import type { NextRequest } from 'next/server';
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
// BK-882 — THE METHOD LIST IS LOAD-BEARING, DO NOT NARROW IT.
// Vercel Cron invokes the configured path with a **GET** request. This route
// shipped exporting only POST, so the scheduled 08:00 UTC trigger would have
// received 405 every day, silently: a cron that 405s produces no email, no
// error anywhere the app can see, and no failed invocation a human would
// notice. It was never observed only because BK-214 has not been promoted to
// the production branch, and Vercel registers cron definitions solely from
// the production deployment (`vercel crons list` reported `not deployed`).
// GET is therefore the CRON entry point and must stay exported.
//
// POST is kept as the manual same-day-retry entry point the header above
// describes, and is how the digest is exercised on staging, where no cron
// exists to fire it. Both verbs run the identical handler, so both are gated
// by the same CRON_SECRET check — adding a verb here must never mean adding
// an ungated one.
//
// The actual orchestration (candidate lookup, grouping, claim, send, log)
// lives in `lib/notifications/send-digest-run.ts` as a plain function taking
// the DB client and mailer as parameters — this handler is the only place
// those concrete dependencies (`createAdminClient()`, `sendDigestEmail`) are
// wired in, so `send-digest-run.test.ts` never needs to mock a shared module.
async function runDigestRequest(request: NextRequest) {
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
}

// Each verb wraps the shared implementation in its OWN `withApiHandler` call,
// deliberately, even though `export const GET = handleDigestRun` would be
// shorter. BK-497's posture scanner reads the export LINE for the wrapper call
// (`lib/api/route-posture-scan.ts`, `postureAt`), so a binding to an
// already-wrapped const reports `bypass` — the scanner's word for a route that
// never reaches the gateway at all. The terser form therefore makes this route
// look UNGATED to the very check that exists to catch ungated routes. One
// implementation, two declared postures, is the shape that satisfies both.
export const GET = withApiHandler(runDigestRequest, { auth: 'public' });
export const POST = withApiHandler(runDigestRequest, { auth: 'public' });
