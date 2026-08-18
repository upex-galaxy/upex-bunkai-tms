import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { markNotificationRead } from './response';

// POST /api/v1/notifications/{id}/read — mark ONE of the caller's own
// notifications read (BK-209 Slice 2: API). Plain RLS-scoped UPDATE, no RPC
// (migration 0053_notifications.sql's own header) — `notifications_update_
// recipient_member` is the entire authorization surface: the caller's own
// RLS-scoped client (`getAuth(ctx).db`) is the ONLY client this route
// constructs, so a foreign id or another recipient's row collapses to 404
// (see `./response.ts`). Idempotent: re-marking an already-read notification
// succeeds rather than erroring (edge cases E6/E12).

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const notificationId = extractNotificationId(request);
  if (!isUuid(notificationId)) {
    throw new ApiError('bad_request', 'Notification id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const notification = await markNotificationRead(db, notificationId);

  return jsonResponse({ notification }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — identity and notifications.',
});

function extractNotificationId(request: NextRequest): string {
  // `/api/v1/notifications/{id}/read` -> segment right after the literal
  // "notifications" (mirrors `workspaces/[id]/route.ts`'s `extractId`).
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('notifications');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
