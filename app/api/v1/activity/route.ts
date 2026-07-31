import type { NextRequest } from 'next/server';
import { decodeActivityCursor, parseActivityParams } from '@lib/activity/history-validation';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { cookies } from 'next/headers';
import { fetchActivityPage, resolveActivityWorkspaceId } from './response';

// GET /api/v1/activity — workspace activity feed, newest first (BK-49). A
// read-only, paginated view over the existing `activity_log` table (no new
// event writers, no realtime/polling, no defect activity — see the
// implementation plan's "7 decided items"). Auth: cookie session or Bearer
// PAT, no scope requirement (mirrors GET /api/v1/tests/{id}/runs).
//
//   ?workspace_id=<uuid>  Cookie sessions: optional, falls back to the
//                         bk_active_ws cookie via resolveActiveWorkspaceId.
//                         Bearer/PAT callers: REQUIRED (422 without it) — see
//                         BK-182 (Bearer active-workspace resolution is a
//                         known open gap this route inherits, not something
//                         it re-solves).
//   ?limit=<1..50>        optional, default 30 (out of range → 422).
//   ?cursor=<opaque>      optional page token from a previous `next_cursor`;
//                         malformed → 400, never a silent first page.
//
// Empty `items` is a valid 200 (AC3) — this route never answers 404. An
// inaccessible `workspace_id` (foreign or nonexistent) collapses into the
// SAME 200 `{items: []}` a genuinely-empty workspace would return: RLS
// silently filters it out inside `bunkai_list_activity`, so there is nothing
// here to distinguish "exists but you can't see it" from "you have no
// activity yet" — a deliberately cleaner non-disclosure than BK-37/38's
// P0002 collapse (see implementation-plan.md § "Errors").

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const query = parseActivityParams(request.nextUrl.searchParams);

  const cookieStore = await cookies();
  const cookieActiveWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspaceId = await resolveActivityWorkspaceId(db, {
    explicitWorkspaceId: query.workspace_id ?? null,
    principal,
    cookieActiveWorkspaceId,
  });

  // An undecodable cursor is a client bug, not "start over": silently
  // answering with the first page would re-serve rows the caller already has
  // (mirrors GET /api/v1/tests/{id}/runs).
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeActivityCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursorCreatedAt = decoded.cursor.createdAt;
    cursorId = decoded.cursor.id;
  }

  // `db` — the CALLER's own RLS-scoped client from getAuth(ctx) — NEVER
  // createAdminClient(). bunkai_list_activity is SECURITY INVOKER
  // (migration 0045_activity_stream.sql): it runs its SELECT under the
  // CALLING role, so RLS's activity_log_select_workspace_member (0009)
  // evaluates against THIS request's own auth.uid() and silently returns
  // zero rows for a non-member. An admin/service-role client has no
  // authenticated auth.uid() — using one here would bypass that RLS check
  // entirely and silently reopen the exact cross-workspace leak the Stage 1
  // review flagged and closed by construction (implementation plan Risk R2;
  // see also `lib/supabase/rpc.ts`'s `listActivity` comment).
  const page = await fetchActivityPage(db, {
    workspaceId,
    limit: query.limit,
    cursorCreatedAt,
    cursorId,
  });

  return jsonResponse(page, { status: 200 });
}, { auth: 'required' });
