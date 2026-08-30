import { Resend } from 'resend';
import 'server-only';

// BK-214 — thin wrapper around the Resend SDK for the notification digest
// sender. Takes its API key / from-address as parameters rather than
// importing `@lib/env` directly — this keeps the module test-double-free:
// `resend-client.test.ts` fakes the `resend` package itself and passes a
// plain string config, instead of `mock.module('@lib/env', ...)`, which
// would leak a stripped-down env object into every OTHER test file that
// runs later in the same `bun test` process and needs the REAL env (see
// `lib/notifications/send-digest-run.ts`'s header comment for the sibling
// hazard this same pattern avoids on the DB side). The route handler
// (`app/api/v1/admin/send-digest/route.ts`) is the only place `env.
// RESEND_API_KEY` / `env.RESEND_DIGEST_FROM_EMAIL` are read.
//
// A missing/falsy `apiKey` never throws or boots the app closed — it
// resolves to a typed `resend_not_configured` failure the caller logs
// per-recipient into `notification_digest_log`, mirroring the Jira import
// worker's posture: a missing credential surfaces as a failed job, not an
// app-boot error.

export interface SendDigestEmailInput {
  to: string
  subject: string
  html: string
}

export interface ResendConfig {
  apiKey: string | undefined
  fromEmail: string
}

export type SendDigestEmailResult
  = | { ok: true }
    | { ok: false, error: string };

export async function sendDigestEmail(input: SendDigestEmailInput, config: ResendConfig): Promise<SendDigestEmailResult> {
  if (!config.apiKey) {
    return { ok: false, error: 'resend_not_configured' };
  }

  const resend = new Resend(config.apiKey);
  const { error } = await resend.emails.send({
    from: config.fromEmail,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    return { ok: false, error: `${error.name}: ${error.message}` };
  }

  return { ok: true };
}
