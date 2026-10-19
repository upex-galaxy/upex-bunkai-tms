import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { env } from '@lib/env';
import { isValidCronSecret } from '@lib/notifications/send-digest-run';
import { runStorageCleanupSweep } from '@lib/storage/cleanup-sweep';
import { createAdminClient } from '@lib/supabase/admin';
import 'server-only';

export const dynamic = 'force-dynamic';

// BK-593 - the daily sweep of the storage cleanup outbox (ADR-0019), a system/cron route in the
// ADR-0017 shape: `auth: 'public'` at the gateway (no cookie session or PAT), gated by the
// `CRON_SECRET` bearer check below, service-role client, never linked from the UI.
// Expires stale pending evidence uploads, deletes the objects queued by removals and by Run /
// workspace deletion, and purges old finished outbox rows. Idempotent: running it twice the
// same day (the manual POST below) only finds less to do.
//
// BK-882 - THE METHOD LIST IS LOAD-BEARING, DO NOT NARROW IT. Vercel Cron invokes the path with
// a GET; a route that exports only POST answers the scheduler 405 every day, silently. POST is
// the manual retry entry point (and the only way to exercise it on staging, where no cron
// runs). Both verbs run the identical, equally gated handler. Each verb wraps the shared
// implementation in its OWN `withApiHandler` call because the BK-497 posture scanner reads the
// export line for the wrapper.
async function runCleanupRequest(request: NextRequest) {
  if (!isValidCronSecret(request.headers.get('authorization'), env.CRON_SECRET)) {
    throw new ApiError('unauthorized', 'Invalid or missing CRON_SECRET.');
  }

  let result;
  try {
    result = await runStorageCleanupSweep(createAdminClient());
  }
  catch (err) {
    throw new ApiError('internal_error', err instanceof Error ? err.message : 'Storage cleanup failed.');
  }
  return jsonResponse(result);
}

export const GET = withApiHandler(runCleanupRequest, { auth: 'public' });
export const POST = withApiHandler(runCleanupRequest, { auth: 'public' });
