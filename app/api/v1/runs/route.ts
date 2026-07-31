import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { mapRunRpcError } from '@lib/runs/errors';
import { RunCreateBodySchema } from '@lib/runs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { createRun } from '@lib/supabase/rpc';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';

// Resolve the workspace for the Idempotency-Key namespace (BK-182 regression).
// DB-parametrized and cookie-value-parametrized (no `cookies()` call inside)
// so it is directly unit-testable — no dedicated NextRequest/ctx test harness
// exists in this repo, same isolation style as `resolveNewActiveWorkspace` in
// workspaces/[id]/membership/route.test.ts. Cookie sessions pass their cookie
// value; bearer callers pass `null`, which `resolveActiveWorkspaceId` already
// treats as "fall back to the first/oldest visible workspace".
export async function resolveRunWorkspaceId(
  db: SupabaseClient<Database>,
  principal: Pick<Principal, 'workspaceId' | 'via'>,
  cookieActive: string | null,
): Promise<string | null> {
  let workspaceId = principal.workspaceId ?? null;
  if (!workspaceId) {
    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    if (workspacesError) {
      throw new ApiError('internal_error', workspacesError.message);
    }
    workspaceId = resolveActiveWorkspaceId(
      principal.via === 'cookie' ? cookieActive : null,
      (workspaces ?? []).map(w => w.id),
    );
  }
  return workspaceId;
}

// POST /api/v1/runs — start a manual Run of a Test in a chosen environment (BK-34).
// Auth: Bearer `run:execute` (or a cookie session). The SECURITY DEFINER RPC
// holds the rulebook (write-membership gate, executor-mode / environment /
// executable-steps validation, the 24h same-token idempotency window, the
// chain-snapshot walk into run_atcs/run_steps, and the run.started audit); this
// handler does parsing, executor-mode derivation, the request-level
// Idempotency-Key guard, and error mapping. `Idempotency-Key` is REQUIRED on
// this endpoint (the HTTP request-replay guard — distinct from the domain
// `start_token`, which is the per-Test 24h window).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = RunCreateBodySchema.parse(payload);

  // Executor-mode derivation (PO-pending §4 — executor-mode derivation):
  // cookie sessions are unambiguously `human`; a PAT (bearer) caller may declare
  // `agent` / `ci` via the body, defaulting to `human` when unspecified.
  const executorMode = principal.via === 'cookie'
    ? 'human'
    : (body.executor_mode ?? 'human');

  // Domain idempotency token (PO-pending §4 Q1 — expired/absent token):
  // when the client omits a start_token, mint a fresh one so each start is a new
  // Run. A client that wants retry-safety within the 24h window sends a stable
  // start_token; after 24h the same token misses the window and starts a NEW Run
  // (the working answer — no expired-token reject path is built here).
  const startToken = body.start_token ?? randomUUID();

  // Resolve the workspace for the Idempotency-Key namespace. The RPC re-resolves
  // the authoritative workspace from the Test; this is only the dedupe scope.
  // Cookie sessions use the active workspace; bearer callers fall back to their
  // principal workspace (or the first membership) — the namespace just needs to
  // be stable per caller.
  const cookieActive = principal.via === 'cookie'
    ? (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
    : null;
  const workspaceId = await resolveRunWorkspaceId(db, principal, cookieActive);
  if (!workspaceId) {
    throw new ApiError('validation_failed', 'No active workspace could be resolved for this request.');
  }

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/runs',
    workspaceId,
    requestPayload: { test_id: body.test_id, environment_id: body.environment_id, executor_mode: executorMode, start_token: startToken },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  // Any throw before the RPC commits must not strand the pending key: discard,
  // then rethrow so envelope mapping stays in withApiHandler.
  let responseBody: { run: unknown } | null = null;
  let replayed = false;
  try {
    const supabase = createAdminClient();
    const { data, error } = await createRun(supabase, {
      actorUserId: principal.userId,
      testId: body.test_id,
      environmentId: body.environment_id,
      executorMode,
      startToken,
    });
    if (error) {
      mapRunRpcError(error);
    }
    // The RPC tags the composed json with `replayed` (true = the 24h same-token
    // window returned an existing Run -> HTTP 200; false = freshly created -> 201).
    const run = data as { replayed?: boolean } | null;
    replayed = run?.replayed === true;
    responseBody = { run: data };
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  const status = replayed ? 200 : 201;

  // The Run exists (or was replayed) from here on. A snapshot-store failure must
  // NOT discard the key nor fail the request — answer the computed status and
  // leave the row pending to expire with its TTL.
  try {
    await recordIdempotencyResult(begin.token, responseBody, status);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/runs', recordError);
  }
  return jsonResponse(responseBody, { status });
}, { auth: 'required', requires: ['run:execute'] });
