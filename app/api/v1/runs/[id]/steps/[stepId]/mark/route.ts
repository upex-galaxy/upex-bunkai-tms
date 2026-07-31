import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
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
// Idempotency: no Idempotency-Key header is required — re-marking the SAME
// step is a deliberate UPDATE-in-place (Q7, AC6 last-write-wins), not a
// first-wins close like abort/finish, so a double-submit is not a conflict.
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

  const supabase = createAdminClient();
  const { data, error } = await markRunStep(supabase, {
    actorUserId: principal.userId,
    runId,
    stepId,
    status: parsed.status,
    note: parsed.note,
    evidenceUrl: parsed.evidence_url,
  });
  if (error) {
    mapRunRpcError(error);
  }

  return jsonResponse({ run: data }, { status: 200 });
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
