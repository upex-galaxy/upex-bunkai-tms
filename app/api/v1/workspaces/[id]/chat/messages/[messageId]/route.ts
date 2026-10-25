import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { deleteMessage, editMessage } from '../../response';

// BK-219 — edit / delete one chat message.
//
//   PATCH  /api/v1/workspaces/{id}/chat/messages/{messageId}  { body } -> 200
//   DELETE /api/v1/workspaces/{id}/chat/messages/{messageId}          -> 200 (tombstone)
//
// Ownership, role and the 15-minute edit window are enforced by the SECURITY
// DEFINER RPCs of migration 0105 on the CALLER'S own client, never the admin
// client. A foreign workspace or message answers 404.

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const { workspaceId, messageId } = extractIds(request);
  const { db } = getAuth(ctx);

  let json: unknown;
  try {
    json = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const rawBody = typeof json === 'object' && json !== null ? (json as { body?: unknown }).body : undefined;

  return jsonResponse(await editMessage(db, { workspaceId, messageId, rawBody }), { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Chat is a membership-scoped surface: the edit RPC asserts authorship and the edit window, not a capability scope.',
});

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { workspaceId, messageId } = extractIds(request);
  const { db } = getAuth(ctx);
  return jsonResponse(await deleteMessage(db, { workspaceId, messageId }), { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Chat is a membership-scoped surface: the delete RPC asserts authorship or admin/owner role, not a capability scope.',
});

function extractIds(request: NextRequest): { workspaceId: string, messageId: string } {
  // `/api/v1/workspaces/{id}/chat/messages/{messageId}`
  const segments = new URL(request.url).pathname.split('/');
  const workspaceId = segments[segments.lastIndexOf('workspaces') + 1] ?? '';
  const messageId = segments[segments.lastIndexOf('messages') + 1] ?? '';
  if (!UUID.test(workspaceId) || !UUID.test(messageId)) {
    throw new ApiError('bad_request', 'Workspace and message ids must be UUIDs.');
  }
  return { workspaceId, messageId };
}
