import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { createTest, filterTestsByTag } from '@lib/supabase/rpc';
import { mapTestFilterError, mapTestRpcError } from '@lib/tests/errors';
import { decodeTestTagFilterCursor, encodeTestTagFilterCursor, parseTestTagFilterParams } from '@lib/tests/tag-filter-validation';
import { TestCreateBodySchema } from '@lib/tests/validation';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';

// POST /api/v1/tests — create a Test chaining ATCs in the given order (BK-27).
// Auth: Bearer `atc:write` (or a cookie session). The SECURITY DEFINER RPC
// holds the rulebook (role gate, title rules, chain >= 1, same-workspace ATC
// resolution, activity log); this handler does parsing, workspace binding at
// the submit instant, idempotency, and error mapping. `Idempotency-Key` is
// REQUIRED on this endpoint.

// GET /api/v1/tests?tag=<tag> — list the workspace's Tests that carry a single
// tag (BK-33). Auth: Bearer `atc:read` (or cookie session). The SECURITY
// DEFINER RPC restricts results to the actor's active workspace memberships
// (any role) and matches via a GIN `@>` containment — the lookup tag is
// normalized the same way stored tags are, so `Smoke` matches `smoke`. Zero
// matches return `{ items: [] }`, never a 404; cross-workspace Tests never leak.
// `tag` is required (the MVP exposes single-tag filtering only — no list-all).
// BK-742 — the answer is ONE bounded page, newest first (created_at desc, id
// desc): `limit` 1..50 (default 20; out of range is a 422, never clamped) and an
// opaque `cursor`. `next_cursor` is non-null if and only if more Tests remain;
// a cursor this endpoint did not issue is a 400, never a silent first page.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const query = parseTestTagFilterParams(request.nextUrl.searchParams);

  let after: { createdAt: string, id: string } | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeTestTagFilterCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    after = decoded.cursor;
  }

  const supabase = createAdminClient();
  const { data, error } = await filterTestsByTag(supabase, {
    actorUserId: principal.userId,
    tag: query.tag,
    limit: query.limit,
    after,
  });
  if (error) {
    mapTestFilterError(error);
  }

  // The RPC returns { items, next_after } (already workspace-isolated).
  const page = (data ?? { items: [], next_after: null }) as {
    items: unknown[]
    next_after: { created_at: string, id: string } | null
  };
  return jsonResponse({
    items: page.items,
    next_cursor: page.next_after
      ? encodeTestTagFilterCursor({ createdAt: page.next_after.created_at, id: page.next_after.id })
      : null,
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = TestCreateBodySchema.parse(payload);

  // Workspace binding at the submit instant (E2): an explicit body value wins;
  // cookie sessions fall back to the active-workspace resolver. PAT callers
  // have no cookie, so they must send workspace_id.
  let workspaceId = body.workspace_id ?? null;
  if (!workspaceId && principal.via === 'cookie') {
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    if (workspacesError) {
      throw new ApiError('internal_error', workspacesError.message);
    }
    workspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));
  }
  if (!workspaceId) {
    throw new ApiError('validation_failed', 'workspace_id is required for token-authenticated calls.');
  }

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/tests',
    workspaceId,
    requestPayload: body,
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  // Any throw before the RPC commits must not strand the pending row:
  // discard, then rethrow so envelope mapping stays in withApiHandler.
  let responseBody: { test: unknown } | null = null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await createTest(supabase, {
      actorUserId: principal.userId,
      workspaceId,
      title: body.title,
      atcIds: body.atc_ids,
    });
    if (error) {
      mapTestRpcError(error);
    }
    responseBody = { test: data };
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  // The Test exists from here on. A snapshot-store failure must NOT discard
  // the key (a same-key retry would mint a duplicate) nor fail the request —
  // the write already succeeded, so answer 201 and leave the row pending to
  // expire with its TTL.
  try {
    await recordIdempotencyResult(begin.token, responseBody, 201);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/tests', recordError);
  }
  return jsonResponse(responseBody, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });
