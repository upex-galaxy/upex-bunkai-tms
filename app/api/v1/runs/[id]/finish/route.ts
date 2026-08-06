import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRunRpcError } from '@lib/runs/errors';
import { RUN_FINISH_VERDICT_REQUIRED_MESSAGE, RunFinishBodySchema } from '@lib/runs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { finishRun } from '@lib/supabase/rpc';

// POST /api/v1/runs/{id}/finish — finish an in-progress Run with a final verdict
// (BK-39). Bearer `run:execute` (or a cookie session). The SECURITY DEFINER RPC
// holds the rulebook (member+ write gate, the status='running' guard, the verdict
// backstop, and the atomic close + skip-pending-steps walk + run.finished audit);
// this handler does parsing, the AC-exact "verdict required" copy, and error
// mapping. A human cookie session, an AI Test Agent, and a CI pipeline all pass
// the SAME gate and produce identical run data.
//
// Idempotency: no Idempotency-Key header is required — the RPC's row lock makes
// finish first-wins, so a double-submit (or a race with abort) re-reads a terminal
// status and returns a 409 conflict ("This run is already closed and cannot be
// finished.").
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const runId = extractRunId(request);
  if (!isUuid(runId)) {
    throw new ApiError('bad_request', 'Run id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  // Parse with safeParse + AC-exact copy: the negative-path AC freezes the exact
  // message the user must see when no verdict is selected, so map the verdict
  // failure explicitly rather than letting it collapse to the generic ZodError
  // envelope ("Request body failed validation." in handler.ts).
  const parsed = RunFinishBodySchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('validation_failed', RUN_FINISH_VERDICT_REQUIRED_MESSAGE, {
      details: { reason: 'finish_verdict_invalid' },
    });
  }

  const supabase = createAdminClient();
  const { data, error } = await finishRun(supabase, {
    actorUserId: principal.userId,
    runId,
    verdict: parsed.data.verdict,
    // BK-211/12196/12198 — the run-event notification trigger's
    // self-suppression predicate needs the session kind, not just the actor
    // id (a PAT impersonates its owning user under ADR-0001 Path B).
    via: principal.via,
  });
  if (error) {
    mapRunRpcError(error);
  }

  return jsonResponse({ run: data }, { status: 200 });
}, { auth: 'required', requires: ['run:execute'] });

// The route is /api/v1/runs/{id}/finish — the run id is the second-to-last segment.
function extractRunId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
