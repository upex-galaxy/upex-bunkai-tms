import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_COOKIE_DEFAULTS } from '@lib/api/workspace-cookie';
import { leaveWorkspace } from '@lib/supabase/rpc';
import { cookies } from 'next/headers';
import { mapLeaveWorkspaceError, resolveNewActiveWorkspace } from './response';

// DELETE /api/v1/workspaces/{id}/membership — the caller removes their OWN
// active membership row (self-service "leave workspace", BK-90 Slice A). The
// atomic guard logic (last-membership backstop, count-based sole-owner gate,
// PAT auto-revoke) lives in the SECURITY DEFINER RPC `bunkai_leave_workspace`
// (migration 0044) — this route is a thin wrapper, mirroring
// `DELETE /api/v1/tokens/[id]`'s session-only convention.
//
// On success, if the caller's `bk_active_ws` cookie pointed at the workspace
// they just left, we re-resolve the active workspace against their REMAINING
// active memberships (BR-1: oldest membership first) and rotate the cookie in
// the same response — the client's live-region announcement needs no second
// round trip.

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { error } = await leaveWorkspace(db, { workspaceId });
  if (error) {
    mapLeaveWorkspaceError(error);
  }

  const cookieStore = await cookies();
  const currentActiveId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  const { newActiveWorkspaceId, newActiveWorkspaceName } = await resolveNewActiveWorkspace(db, {
    userId: principal.userId,
    leftWorkspaceId: workspaceId,
    currentActiveId,
  });

  const response = jsonResponse({ newActiveWorkspaceId, newActiveWorkspaceName });
  if (newActiveWorkspaceId) {
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, newActiveWorkspaceId, ACTIVE_WORKSPACE_COOKIE_DEFAULTS);
  }
  else if (currentActiveId === workspaceId) {
    // Defensive backstop only — the RPC's last_membership guard already
    // guarantees at least one active membership survives a successful leave,
    // so this branch should not be reachable in practice.
    response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
  }
  return response;
// A PAT must not leave a workspace on the caller's behalf — session-only, the
// same ADR-0001 exception `DELETE /api/v1/tokens/[id]` takes. Enforced by the
// gateway before the body runs; the message is the one this route has always
// returned, moved verbatim from the `assertSessionOnly` guard it replaces.
}, { auth: 'cookie-only', why: 'Personal access tokens cannot leave a workspace. Use a browser session.' });

function extractWorkspaceId(request: NextRequest): string {
  // App Router exposes route params via context, but withApiHandler is generic
  // so we read it from the URL path directly. `/api/v1/workspaces/{id}/membership`
  // → segment right after the literal "workspaces" (mirrors
  // `workspaces/[id]/route.ts`'s `extractId`).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
