import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { markAllNotificationsRead } from './response';

// POST /api/v1/workspaces/{id}/notifications/read-all — mark every VISIBLE
// unread notification in one workspace read, for the calling recipient only
// (BK-209 Slice 2: API). Plain RLS-scoped bulk UPDATE, no RPC — same
// authorization surface as `POST /api/v1/notifications/{id}/read` (see
// `./response.ts`). No `assertWorkspaceContext` (ADR-0006): this is a
// personal mutation on the caller's own rows, not a `workspace:admin`
// operation. PO-ratified: scoped to ONE workspace, never cross-workspace
// (comments.md 2026-07-16). Idempotent: a repeat call finds zero remaining
// unread rows and returns `{updated_count: 0}`.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  const result = await markAllNotificationsRead(db, {
    workspaceId,
    recipientUserId: principal.userId,
  });

  return jsonResponse(result, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Personal inbox — the caller marks only their own notification copies read.',
});

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/notifications/read-all` -> segment right after
  // the literal "workspaces" (mirrors `workspaces/[id]/projects/route.ts`'s
  // `extractWorkspaceId`).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
