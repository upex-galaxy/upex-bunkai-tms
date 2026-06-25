import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRunRpcError } from '@lib/runs/errors';
import {
  RUN_ABORT_REASON_MAX,
  RUN_ABORT_REASON_TOO_LONG_MESSAGE,
  RUN_ABORT_REASON_TOO_SHORT_MESSAGE,
  RunAbortBodySchema,
} from '@lib/runs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { abortRun } from '@lib/supabase/rpc';

// POST /api/v1/runs/{id}/abort — abort an in-progress Run with a reason (BK-36).
// Bearer `run:execute` (or a cookie session). The SECURITY DEFINER RPC holds the
// rulebook (member+ write gate, the status='running' guard, the reason backstop,
// and the atomic close + skip-pending-steps walk + run.aborted audit); this
// handler does parsing, the AC-exact reason copy, and error mapping.
//
// Idempotency: no Idempotency-Key header is required — the RPC's row lock makes
// abort first-wins, so a double-submit re-reads status='aborted' and returns a
// 409 conflict ("This run is already closed and cannot be aborted.").
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const runId = extractRunId(request);
  if (!isUuid(runId)) {
    throw new ApiError('bad_request', 'Run id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  // Parse with safeParse + AC-exact copy: the generic ZodError envelope collapses
  // to "Request body failed validation." (handler.ts), but AC2 freezes the exact
  // message the user must see, so map the reason failure explicitly.
  const parsed = RunAbortBodySchema.safeParse(payload);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(i => i.code === 'too_big');
    throw new ApiError(
      'validation_failed',
      tooLong ? RUN_ABORT_REASON_TOO_LONG_MESSAGE : RUN_ABORT_REASON_TOO_SHORT_MESSAGE,
      { details: { reason: tooLong ? 'abort_reason_too_long' : 'abort_reason_too_short', max: RUN_ABORT_REASON_MAX } },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await abortRun(supabase, {
    actorUserId: principal.userId,
    runId,
    reason: parsed.data.reason,
  });
  if (error) {
    mapRunRpcError(error);
  }

  return jsonResponse({ run: data }, { status: 200 });
}, { auth: 'required', requires: ['run:execute'] });

// The route is /api/v1/runs/{id}/abort — the run id is the second-to-last segment.
function extractRunId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
