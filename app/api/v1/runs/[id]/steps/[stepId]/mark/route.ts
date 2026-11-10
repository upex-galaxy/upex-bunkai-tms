import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { refuseIfRunWorkspaceDeleted } from '@lib/runs/deleted-workspace';
import { mapRunRpcError } from '@lib/runs/errors';
import { RunStepMarkBodySchema } from '@lib/runs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { markRunStep } from '@lib/supabase/rpc';

// POST /api/v1/runs/{id}/steps/{stepId}/mark — mark one run step
// passed/failed/blocked, with an optional note + evidence link (BK-35).
// Bearer `run:execute` (or a cookie session). The SECURITY DEFINER RPC holds
// the rulebook (member+ write gate, the status='running' guard, the status
// backstop, the empty-to-null normalization, the UPDATE-in-place mutation,
// and the parent run_atcs verdict recompute); this handler does parsing and
// error mapping only — same division of labor as abort/finish.
//
// Re-reporting a step (BK-223). A cookie session keeps BK-35's UPDATE-in-place
// (a human correcting a mark is a normal manual action). A bearer caller gets
// retry-safe semantics from the RPC: an identical re-report answers 200 with the
// recorded result and writes nothing, a different one is a 409 conflict. The
// optional `Idempotency-Key` header (ADR-0002 guard) additionally replays the
// byte-identical original response; without it the RPC rule above still holds.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { runId, stepId } = extractIds(request);
  if (!isUuid(runId) || !isUuid(stepId)) {
    throw new ApiError('bad_request', 'Run id and step id must be UUIDs.');
  }

  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  // No AC freezes copy for a malformed mark body (unlike abort/finish's
  // frozen reason/verdict messages), so the generic ZodError envelope
  // (handler.ts) is fine — parse (not safeParse) and let it throw.
  const parsed = RunStepMarkBodySchema.parse(payload);

  // Optional header: only engage the guard when the caller sent one (the guard
  // itself treats a missing header as an error, which suits the endpoints where
  // it is required).
  const idempotency = request.headers.has('idempotency-key')
    ? await beginIdempotentRequest({
        headers: request.headers,
        userId: principal.userId,
        endpoint: 'POST /api/v1/runs/{id}/steps/{stepId}/mark',
        workspaceId: principal.workspaceId ?? null,
        requestPayload: { run_id: runId, step_id: stepId, ...parsed },
      })
    : null;
  if (idempotency?.isReplay) {
    return jsonResponse(idempotency.snapshot, { status: idempotency.status });
  }

  const supabase = createAdminClient();
  const { data, error } = await markRunStep(supabase, {
    actorUserId: principal.userId,
    runId,
    stepId,
    status: parsed.status,
    note: parsed.note,
    evidenceUrl: parsed.evidence_url,
    via: principal.via,
  });
  if (error) {
    if (idempotency) {
      await discardIdempotencyResult(idempotency.token);
    }
    // BK-1129 — a member of a soft-deleted workspace gets a not-found that
    // says so (BK-512 N3); everyone else keeps the RPC's own refusal.
    await refuseIfRunWorkspaceDeleted(supabase, { error, runId, userId: principal.userId });
    mapRunRpcError(error);
  }

  const responseBody = { run: data };
  if (idempotency) {
    // A snapshot-store failure must not fail a request whose write committed.
    try {
      await recordIdempotencyResult(idempotency.token, responseBody, 200);
    }
    catch (recordError) {
      console.error('idempotency snapshot store failed for step mark', recordError);
    }
  }
  return jsonResponse(responseBody, { status: 200 });
}, { auth: 'required', requires: ['run:execute'] });

// The route is /api/v1/runs/{id}/steps/{stepId}/mark — two dynamic segments.
// Resolved by segment NAME (not a fixed negative offset) so the extraction
// stays correct regardless of trailing segments, mirroring the established
// two-param convention in workspaces/[id]/invites/[inviteId]/route.ts.
function extractIds(request: NextRequest): { runId: string, stepId: string } {
  const segments = new URL(request.url).pathname.split('/');
  const runsIdx = segments.lastIndexOf('runs');
  const stepsIdx = segments.lastIndexOf('steps');
  return {
    runId: runsIdx >= 0 ? (segments[runsIdx + 1] ?? '') : '',
    stepId: stepsIdx >= 0 ? (segments[stepsIdx + 1] ?? '') : '',
  };
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
