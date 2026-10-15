import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { parseSavedViewInput } from '@lib/saved-views/errors';
import { createSavedView, listSavedViews } from '@lib/saved-views/queries';
import { SavedViewCreateBodySchema, SavedViewListQuerySchema } from '@lib/saved-views/validation';
import { projectIdFrom } from './params';

// BK-443 — saved views.
//
// GET  /api/v1/projects/{id}/saved-views?view_kind= — the caller's OWN views for
//      one surface in this project, ordered by case-folded name then id.
// POST /api/v1/projects/{id}/saved-views — save the filters currently applied
//      under a name.
//
// There is no RPC and no identity parameter: this is table CRUD through the
// caller's RLS-scoped client (see `lib/saved-views/queries.ts`). Ownership,
// project membership, name uniqueness, the 25-view cap and the name/state rules
// are enforced by the database (migration 0093).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = projectIdFrom(request);
  const { principal, db } = getAuth(ctx);
  const query = parseSavedViewInput(SavedViewListQuerySchema, {
    view_kind: new URL(request.url).searchParams.get('view_kind') ?? undefined,
  });

  const items = await listSavedViews(db, { userId: principal.userId, projectId }, query.view_kind);
  return jsonResponse({ items }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = projectIdFrom(request);
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseSavedViewInput(SavedViewCreateBodySchema, payload);

  const item = await createSavedView(db, { userId: principal.userId, projectId }, body);
  return jsonResponse({ item }, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });
