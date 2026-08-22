import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { CHANNELS, EDITABLE_EVENT_TYPES } from '@lib/notification-preferences/constants';
import { z } from 'zod';
import { listNotificationPreferences, upsertNotificationPreference } from './response';

// GET   /api/v1/notification-preferences — the caller's own notification
//       preferences grid (BK-213): 4 editable cells (existing value, or the
//       ratified default when never touched) + 2 locked `mentions` cells.
// PATCH /api/v1/notification-preferences — instant-save ONE (event_type,
//       channel) cell.
//
// Personal + GLOBAL (no workspace concept -- QA Refinement Decision 1,
// comments.md 2026-07-18): every read/write is scoped by `principal.userId`
// alone via `notification_preferences`'s RLS (migration 0062) -- plain
// RLS-scoped PostgREST calls, no RPC.

const PatchBodySchema = z.object({
  // `mentions` is deliberately excluded from this enum -- a request naming
  // it fails validation (422) here, on top of migration 0062's own
  // DB-level INSERT/UPDATE lock (defense in depth, not redundancy: this
  // gate is what gives API consumers an actionable 422 instead of a raw
  // RLS-denial error shape).
  event_type: z.enum(EDITABLE_EVENT_TYPES),
  channel: z.enum(CHANNELS),
  enabled: z.boolean(),
});

export const GET = withApiHandler(async (_request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  const preferences = await listNotificationPreferences(db, principal.userId);
  return jsonResponse({ preferences });
}, {
  auth: 'authenticated',
  why: 'Own account state — the caller reads only their own notification preferences.',
});

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const input = PatchBodySchema.parse(payload);

  const preference = await upsertNotificationPreference(db, principal.userId, input);
  return jsonResponse({ preference });
}, {
  auth: 'authenticated',
  why: 'Own account state — the caller writes only their own notification preferences.',
});
