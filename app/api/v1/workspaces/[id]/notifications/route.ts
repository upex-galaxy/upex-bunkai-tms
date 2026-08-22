import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { decodeNotificationsCursor, parseNotificationsListParams } from '@lib/notifications/list-validation';
import { fetchNotificationsPage } from './response';

// GET /api/v1/workspaces/{id}/notifications — the caller's own notification
// inbox for one workspace, newest first (BK-209 Slice 2: API). Auth: cookie
// session or Bearer PAT, no capability required — this is a personal read
// (each recipient reads their own copies), NOT the workspace-shared feed that
// GET /api/v1/activity serves, which is why that route takes `atc:read` and
// this one does not (BK-499 ruling Q1). It is not a
// `workspace:admin` operation either, so ADR-0006's `assertWorkspaceContext` does not
// apply here (that pairing is scoped to the admin-capability slice — see
// ADR-0006). `workspace_id` is a plain filter, not a trust boundary
// (migration 0053_notifications.sql's own header) — RLS enforces recipient +
// membership + 90-day retention regardless of what this path segment is set
// to.
//
//   ?limit=<1..50>   optional, default 30 (out of range -> 422).
//   ?cursor=<opaque> optional page token from a previous `next_cursor`;
//                    malformed -> 400, never a silent first page.
//
// A foreign/nonexistent workspace id, or one the caller lost membership of,
// collapses into the SAME 200 `{items: [], unread_count: 0, next_cursor:
// null}` a genuinely-empty inbox would return — RLS silently empties the
// result set inside `bunkai_list_notifications` (SECURITY INVOKER), so there
// is nothing here to distinguish "exists but you can't see it" from "no
// notifications yet" (mirrors GET /api/v1/activity's own non-disclosure
// posture).
//
// Uses the CALLER'S OWN RLS-scoped client (`getAuth(ctx).db`), NEVER
// `createAdminClient()` — see `lib/supabase/rpc.ts`'s `listNotifications`
// comment for why (Risk R2, same shape as `listActivity`/`listBugs`).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const query = parseNotificationsListParams(request.nextUrl.searchParams);

  // An undecodable cursor is a client bug, not "start over": silently
  // answering with the first page would re-serve rows the caller already has
  // (mirrors GET /api/v1/activity's own decodeActivityCursor gate).
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeNotificationsCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursorCreatedAt = decoded.cursor.createdAt;
    cursorId = decoded.cursor.id;
  }

  const page = await fetchNotificationsPage(db, {
    workspaceId,
    limit: query.limit,
    cursorCreatedAt,
    cursorId,
  });

  return jsonResponse(page, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Personal inbox — each recipient reads only their own notification copies, not workspace-shared data.',
});

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/notifications` -> segment right after the
  // literal "workspaces" (mirrors `workspaces/[id]/projects/route.ts`'s
  // `extractWorkspaceId`).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
