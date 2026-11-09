import type { Principal } from '@lib/api/principal';
import { ApiError } from '@lib/api/error-envelope';
import { mapSubmissionRpcError } from '@lib/runs/submission-errors';
import { parseRunSubmissionBody } from '@lib/runs/submission-validation';
import { submitAutomatedRun } from '@lib/supabase/rpc';

// BK-222 — the body of POST /api/v1/runs/submissions, kept out of the route file
// so it is unit-testable without a NextRequest harness (same isolation style as
// `resolveRunWorkspaceId`). Bearer tokens only: the token IS the executor
// identity (PO ruling), and a cookie session has no token to attribute the run
// to. The RPC owns the rulebook; this layer owns the caller shape, parsing and
// the 201 / 200 split.
export type SubmissionCaller = Pick<Principal, 'userId' | 'workspaceId' | 'via' | 'tokenId' | 'db'>;

export interface SubmissionResult {
  status: 200 | 201
  body: { run: unknown }
}

export async function executeRunSubmission(
  principal: SubmissionCaller,
  payload: unknown,
): Promise<SubmissionResult> {
  if (principal.via !== 'bearer' || !principal.tokenId) {
    throw new ApiError('forbidden', 'Run submissions require an access token (Bearer); cookie sessions cannot submit.', {
      details: { reason: 'token_required' },
    });
  }
  if (principal.workspaceId === null) {
    throw new ApiError('forbidden', 'This token is not scoped to a workspace; it cannot submit runs.', {
      details: { reason: 'token_not_workspace_scoped' },
    });
  }

  const body = parseRunSubmissionBody(payload);

  const { data, error } = await submitAutomatedRun(principal.db, {
    actorUserId: principal.userId,
    tokenId: principal.tokenId,
    testId: body.test_id,
    environmentName: body.environment,
    verdict: body.verdict,
    durationSeconds: body.duration_seconds,
    steps: body.steps,
    evidenceUrls: body.evidence_urls,
    idempotencyKey: body.idempotency_key,
  });
  if (error) {
    mapSubmissionRpcError({ code: error.code, message: error.message, details: error.details });
  }

  const replayed = (data as { replayed?: boolean } | null)?.replayed === true;
  return { status: replayed ? 200 : 201, body: { run: data } };
}
