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
  const digests = groupDigestCandidates((candidateRows ?? []) as unknown as DigestCandidateRow[]);
  const { isoDate, label } = formatDigestDate(now);

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
