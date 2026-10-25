import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { fetchMessagesPage, parseListParams, postMessage } from '../response';

// BK-215 — workspace general channel messages.
//
//   GET  /api/v1/workspaces/{id}/chat/messages
//        ?limit=<1..100, default 30>  newest `limit` messages, ascending
//        ?before_seq=<n>              older page (scroll-up history)
//        ?after_seq=<n>               everything newer, ascending (reconnect
//                                     catch-up; capped at 200, `has_more`)
//   POST /api/v1/workspaces/{id}/chat/messages   { body }  -> 201
//
// Auth: any authenticated principal; visibility = active membership and write =
// member/admin/owner are enforced by RLS (migration 0104) on the CALLER'S own
// client, never the admin client. A foreign workspace answers 404, same as a
// missing one.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  const { db } = getAuth(ctx);
  const page = await fetchMessagesPage(db, parseListParams(workspaceId, request.nextUrl.searchParams));
  return jsonResponse(page, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Chat is a membership-scoped surface: RLS limits reads to active workspace members, not a capability scope.',
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  const { principal, db } = getAuth(ctx);

  let json: unknown;
  try {
    json = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const rawBody = typeof json === 'object' && json !== null ? (json as { body?: unknown }).body : undefined;

  const message = await postMessage(db, { workspaceId, userId: principal.userId, rawBody });
  return jsonResponse(message, { status: 201 });
}, {
  auth: 'authenticated',
  why: 'Chat is a membership-scoped surface: RLS limits writes to member/admin/owner, not a capability scope.',
});

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/chat/messages` -> segment right after "workspaces".
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  const id = idx >= 0 ? (segments[idx + 1] ?? '') : '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  return id;
}
