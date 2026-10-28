import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DigestCandidateRow } from './digest-grouping';
import { timingSafeEqual } from 'node:crypto';
import { groupDigestCandidates } from './digest-grouping';
import { buildDigestEmailHtml, buildDigestEmailSubject } from './digest-template';

type Admin = SupabaseClient<Database>;

// BK-214 — the testable core of `POST /api/v1/admin/send-digest`, split out
// so its unit tests inject fake collaborators directly (mirrors
// `lib/jira/import-runner.ts`'s `executeImport(admin, searchFn, jobId)`
// shape) instead of `mock.module`-ing `@lib/supabase/admin` /
// `@lib/mail/resend-client`. Those modules are shared process-wide by
// `bun test`'s module cache — a route test that mocks them leaks the mock
// into every OTHER test file that runs later in the same process and calls
// `createAdminClient()` for its own, unrelated, real-DB work (see
// `app/api/v1/projects/[id]/atcs/export/route.test.ts`'s own comment on
// exactly this hazard). Dependency injection sidesteps the hazard entirely
// instead of relying on mock-registration order.

export function isValidCronSecret(authHeader: string | null, expectedSecret: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const provided = Buffer.from(authHeader.slice('Bearer '.length));
  const expected = Buffer.from(expectedSecret);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export function formatDigestDate(date: Date): { isoDate: string, label: string } {
  const isoDate = date.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  return { isoDate, label };
}

export type SendMailFn = (input: { to: string, subject: string, html: string }) => Promise<{ ok: true } | { ok: false, error: string }>;

export interface RunDigestSendResult {
  eligible_users: number
  sent: number
  failed: number
  skipped: number
}

// BK-1217 — ids per `.in()` filter when stamping `emailed_at`. The candidate
// rows carry no suppression flag, so the id list is every unread candidate of
// the user (up to 90 days); chunking keeps each PATCH URL well under
// PostgREST / proxy URL limits.
export const EMAILED_STAMP_CHUNK_SIZE = 100;

// BK-1217 — after a SUCCESSFUL send, mark the user's email-only rows as
// emailed so `bunkai_notification_digest_candidates()` (0107) never includes
// them again; a visible (in-app) row is untouched and keeps being re-included
// while it stays unread (BK-214). Ids come from the RAW candidate rows, never
// the grouped digest: groups are capped at DIGEST_ITEMS_PER_PROJECT_CAP and
// the overflow rows ("and N more") carry no ids there, yet they were
// delivered too (PO decision 13138, rule 7). Returns false when any chunk
// failed; the caller only logs it, because the worst case is the item being
// digested once more tomorrow, and a sent digest must never flip to failed.
async function stampEmailedSuppressed(db: Admin, notificationIds: string[], stampedAt: string): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < notificationIds.length; i += EMAILED_STAMP_CHUNK_SIZE) {
    const chunk = notificationIds.slice(i, i + EMAILED_STAMP_CHUNK_SIZE);
    try {
      const { error } = await db
        .from('notifications')
        .update({ emailed_at: stampedAt })
        .in('id', chunk)
        .eq('in_app_suppressed', true);
      if (error) {
        ok = false;
      }
    }
    catch {
      ok = false;
    }
  }
  return ok;
}

export async function runDigestSend(db: Admin, sendMail: SendMailFn, now: Date = new Date()): Promise<RunDigestSendResult> {
  const { data: candidateRows, error: candidatesError } = await db.rpc('bunkai_notification_digest_candidates');
  if (candidatesError) {
    throw new Error(`Failed to load digest candidates: ${candidatesError.message}`);
  }

  // The RPC's generated return type carries `payload: Json` (the generic
  // jsonb type Supabase codegen produces for any function column), while
  // `DigestCandidateRow` narrows it to `Record<string, unknown>` to match
  // `resolveNotificationTitle`'s existing contract (`view.ts`) — `payload`
  // is `jsonb not null default '{}'::jsonb` on `notifications` (0053), so
  // it is always an object in practice, never the `Json` union's other arms.
  const rows = (candidateRows ?? []) as unknown as DigestCandidateRow[];
  const digests = groupDigestCandidates(rows);
  const { isoDate, label } = formatDigestDate(now);

  const candidateIdsByUser = new Map<string, string[]>();
  for (const row of rows) {
    const ids = candidateIdsByUser.get(row.recipient_user_id);
    if (ids) {
      ids.push(row.notification_id);
    }
    else {
      candidateIdsByUser.set(row.recipient_user_id, [row.notification_id]);
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const digest of digests) {
    // Claim BEFORE composing/sending (0078_notification_digest_log.sql's
    // header: closes the race a write-only-after-send design would only
    // detect after two emails were already sent). A unique-constraint
    // conflict means another invocation already claimed today for this user.
    const { data: claimed, error: claimError } = await db
      .from('notification_digest_log')
      .insert({ user_id: digest.userId, digest_date: isoDate })
      .select('id')
      .single();

    if (claimError) {
      // 23505 = unique_violation (already claimed today) — expected on a
      // same-day re-invocation, not a failure to surface.
      if (claimError.code === '23505') {
        skipped += 1;
        continue;
      }
      failed += 1;
      continue;
    }

    const subject = buildDigestEmailSubject(digest.totalCount, label);
    const html = buildDigestEmailHtml({ digest, digestDateLabel: label });
    const result = await sendMail({ to: digest.email, subject, html });

    if (result.ok) {
      sent += 1;
      await db
        .from('notification_digest_log')
        .update({ status: 'sent', notification_count: digest.totalCount, sent_at: new Date().toISOString() })
        .eq('id', claimed.id);

      const stamped = await stampEmailedSuppressed(db, candidateIdsByUser.get(digest.userId) ?? [], new Date().toISOString());
      if (!stamped) {
        console.warn(`[send-digest] digest sent to user ${digest.userId} but stamping emailed_at failed; email-only items may be digested once more.`);
      }
    }
    else {
      failed += 1;
      await db
        .from('notification_digest_log')
        .update({ status: 'failed', error: result.error })
        .eq('id', claimed.id);
    }
  }

  return { eligible_users: digests.length, sent, failed, skipped };
}
