import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { env } from '@lib/env';
import { sendDigestEmail } from '@lib/mail/resend-client';
import { isValidCronSecret, runDigestSend } from '@lib/notifications/send-digest-run';
import { createAdminClient } from '@lib/supabase/admin';
import 'server-only';

export const dynamic = 'force-dynamic';

// BK-214 — the system/cron principal (ADR-0017). `auth: 'public'` at the
// `withApiHandler` gateway (this route carries no cookie session or PAT — it
// is not one of ADR-0001's two principals), gated instead by a manual
// `CRON_SECRET` bearer check below. Vercel Cron (`vercel.json`) is the
// primary trigger; the route may also be invoked manually as a same-day
// retry (see `send-digest-run.ts`'s claim-before-send comment).
//
// The actual orchestration (candidate lookup, grouping, claim, send, log)
// lives in `lib/notifications/send-digest-run.ts` as a plain function taking
// the DB client and mailer as parameters — this handler is the only place
// those concrete dependencies (`createAdminClient()`, `sendDigestEmail`) are
// wired in, so `send-digest-run.test.ts` never needs to mock a shared module.
export const POST = withApiHandler(async (request) => {
  if (!isValidCronSecret(request.headers.get('authorization'), env.CRON_SECRET)) {
    throw new ApiError('unauthorized', 'Invalid or missing CRON_SECRET.');
  }

  const mailConfig = { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_DIGEST_FROM_EMAIL };
  let result;
  try {
    result = await runDigestSend(createAdminClient(), async input => sendDigestEmail(input, mailConfig));
  }
  catch (err) {
    throw new ApiError('internal_error', err instanceof Error ? err.message : 'Digest run failed.');
  }

  return jsonResponse(result);
}, { auth: 'public' });
