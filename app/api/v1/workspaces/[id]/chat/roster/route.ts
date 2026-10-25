import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { fetchRoster } from '../response';

// GET /api/v1/workspaces/{id}/chat/roster — active workspace members with role
// (BK-215). Presence (online/offline) is NOT served here: it is client-side
// Realtime Presence over the workspace channel. Non-members get 404.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  const workspaceId = idx >= 0 ? (segments[idx + 1] ?? '') : '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  const { db } = getAuth(ctx);
  const members = await fetchRoster(db, workspaceId);
  return jsonResponse({ members }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Chat roster is membership-scoped: the RPC asserts the caller is an active member, not a capability scope.',
});
