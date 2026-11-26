import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@lib/env';
import { sendDigestEmail } from '@lib/mail/resend-client';
import { createAdminClient } from '@lib/supabase/admin';
import { webUrl } from '@lib/urls';
import { after } from 'next/server';
import 'server-only';

type Admin = SupabaseClient<Database>;

export type SendMailFn = (input: { to: string, subject: string, html: string }) => Promise<{ ok: true } | { ok: false, error: string }>;

export interface CancellationNoticeDeps {
  admin: Admin
  sendMail: SendMailFn
  lookupEmail: (userId: string) => Promise<string | null>
}

export interface CancellationNoticeInput {
  workspaceName: string
  endsAt: string | null
}

export interface CancellationNoticeOutcome {
  sent: number
  failed: number
  skipped: number
}

const FONT_SANS = 'Inter,-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif';

const END_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPeriodEnd(endsAt: string | null): string | null {
  if (!endsAt) {
    return null;
  }
  const date = new Date(endsAt);
  return Number.isNaN(date.getTime()) ? null : `${END_DATE_FORMAT.format(date)} (UTC)`;
}

export function buildCancellationNoticeSubject(input: CancellationNoticeInput): string {
  const end = formatPeriodEnd(input.endsAt);
  return end
    ? `Cloud for ${input.workspaceName} ends on ${end}`
    : `Cloud for ${input.workspaceName} ends at the end of the paid period`;
}

export function buildCancellationNoticeHtml(input: CancellationNoticeInput): string {
  const end = formatPeriodEnd(input.endsAt);
  const when = end ? `on <strong style="color:#f1f3f5;">${escapeHtml(end)}</strong>` : 'at the end of the period already paid';
  const before = end ? `before ${escapeHtml(end)}` : 'before the paid period ends';
  const billingUrl = webUrl('/settings/billing');

  return `
<div style="font-family:${FONT_SANS};background-color:#0b0d10;padding:32px 16px;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background-color:#16191d;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#f1f3f5;">
          The Cloud subscription of ${escapeHtml(input.workspaceName)} is cancelled
        </h1>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#c1c6cc;">
          Cloud access ends ${when}. Until then nothing changes for anyone in the workspace.
        </p>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#c1c6cc;">
          After that date the workspace moves to the Community plan. Projects beyond the Community project limit become read-only, oldest first. Nothing is deleted.
        </p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#c1c6cc;">
          Changed your mind? Resubscribe ${before} from Billing. The period is already paid, so resubscribing makes no new charge.
        </p>
        <a href="${escapeHtml(billingUrl)}" target="_blank" style="display:inline-block;background-color:#5b8def;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">
          Open billing
        </a>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#8b929a;">
          You receive this because you are an owner of ${escapeHtml(input.workspaceName)}.
        </p>
      </td>
    </tr>
  </table>
</div>`;
}

export async function notifyCancellationScheduled(workspaceId: string, deps: CancellationNoticeDeps): Promise<CancellationNoticeOutcome> {
  const outcome: CancellationNoticeOutcome = { sent: 0, failed: 0, skipped: 0 };
  try {
    const [workspace, state, owners] = await Promise.all([
      deps.admin.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
      deps.admin.from('workspace_billing_state').select('current_period_end, cancel_at_period_end').eq('workspace_id', workspaceId).maybeSingle(),
      deps.admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner').eq('status', 'active'),
    ]);
    if (workspace.error || state.error || owners.error || !workspace.data) {
      console.error('cancellation notice not sent: lookup failed', { workspaceId });
      return { ...outcome, failed: 1 };
    }
    if (!state.data?.cancel_at_period_end) {
      return { ...outcome, skipped: 1 };
    }
    const input: CancellationNoticeInput = { workspaceName: workspace.data.name, endsAt: state.data.current_period_end };
    if (!formatPeriodEnd(input.endsAt)) {
      console.error('cancellation notice has no period end date', { workspaceId });
    }
    const subject = buildCancellationNoticeSubject(input);
    const html = buildCancellationNoticeHtml(input);

    for (const owner of owners.data ?? []) {
      const email = await deps.lookupEmail(owner.user_id);
      if (!email) {
        outcome.skipped += 1;
        console.error('cancellation notice skipped: owner has no email', { workspaceId });
        continue;
      }
      const result = await deps.sendMail({ to: email, subject, html });
      if (result.ok) {
        outcome.sent += 1;
      }
      else {
        outcome.failed += 1;
        console.error('cancellation notice not sent', { workspaceId, error: result.error });
      }
    }
  }
  catch (error) {
    outcome.failed += 1;
    console.error('cancellation notice not sent: unexpected error', { workspaceId, error: error instanceof Error ? error.name : 'unknown' });
  }
  return outcome;
}

export function cancellationNoticeDeps(config: { apiKey: string | undefined, fromEmail: string }): CancellationNoticeDeps {
  const admin = createAdminClient();
  return {
    admin,
    sendMail: async input => sendDigestEmail(input, config),
    lookupEmail: async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      return data?.user?.email ?? null;
    },
  };
}

// Runs after the response, once the cancellation has committed; a failed send never reaches the caller.
export function scheduleCancellationNotice(workspaceId: string, schedule: (task: () => Promise<void>) => void = after): void {
  schedule(async () => {
    await notifyCancellationScheduled(workspaceId, cancellationNoticeDeps({ apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_DIGEST_FROM_EMAIL }));
  });
}
