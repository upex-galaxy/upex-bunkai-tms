import { sendDigestEmail } from '@lib/mail/resend-client';
import { webUrl } from '@lib/urls';
import 'server-only';

// BK-512 — confirm-time deletion receipt (ADR-0015 point 9). Sent to the
// owner and every active member the instant the deletion is recorded — this
// is the ADR's chosen recovery path ("a Settings tab a panicking user has
// never visited is not one"), so the restore link is the one load-bearing
// thing in this email.
//
// Reuses `sendDigestEmail` (BK-214) as a generic `{to, subject, html} ->
// Resend` sender rather than adding a second mail-sending code path; no new
// env var (RESEND_API_KEY / RESEND_DIGEST_FROM_EMAIL are both already
// `.optional()`/defaulted in `lib/env.ts`).

const FONT_SANS = 'Inter,-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif';

// Hand-built HTML, no framework auto-escaping — every interpolated string
// (workspace name, actor email) can be user-typed content, same hazard
// `lib/notifications/digest-template.ts` documents for the digest email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface DeletionEmailInput {
  workspaceName: string
  workspaceId: string
  actorEmail: string
  purgeDeadline: string
}

export function buildDeletionEmailSubject(input: DeletionEmailInput): string {
  return `${input.workspaceName} is scheduled for deletion`;
}

export function buildDeletionEmailHtml(input: DeletionEmailInput): string {
  const restoreUrl = webUrl(`/workspaces/${input.workspaceId}/restore`);
  const deadlineLabel = new Date(input.purgeDeadline).toUTCString();

  return `
<div style="font-family:${FONT_SANS};background-color:#0b0d10;padding:32px 16px;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background-color:#16191d;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#f1f3f5;">
          ${escapeHtml(input.workspaceName)} is scheduled for deletion
        </h1>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#c1c6cc;">
          ${escapeHtml(input.actorEmail)} deleted this workspace. Access ended immediately for everyone.
          Everything it held will be permanently erased on
          <strong style="color:#f1f3f5;">${escapeHtml(deadlineLabel)}</strong>.
        </p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#c1c6cc;">
          If this was a mistake, you can restore the workspace with everything it held before that date.
        </p>
        <a href="${escapeHtml(restoreUrl)}" target="_blank" style="display:inline-block;background-color:#5b8def;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">
          Restore workspace
        </a>
      </td>
    </tr>
  </table>
</div>`;
}

export interface SendDeletionEmailsArgs {
  recipients: { email: string }[]
  input: DeletionEmailInput
  apiKey: string | undefined
  fromEmail: string
}

// Fire-and-forget per recipient (mirrors `data-export`'s `after()` posture) —
// a failed send never blocks or fails the deletion itself, which has already
// committed by the time this runs.
export async function sendWorkspaceDeletionEmails(args: SendDeletionEmailsArgs): Promise<void> {
  const subject = buildDeletionEmailSubject(args.input);
  const html = buildDeletionEmailHtml(args.input);

  await Promise.all(args.recipients.map(async recipient =>
    sendDigestEmail(
      { to: recipient.email, subject, html },
      { apiKey: args.apiKey, fromEmail: args.fromEmail },
    ),
  ));
}
