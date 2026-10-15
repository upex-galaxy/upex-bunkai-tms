import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { parseSavedViewInput } from '@lib/saved-views/errors';
import { deleteSavedView, updateSavedView } from '@lib/saved-views/queries';
import { SavedViewPatchBodySchema } from '@lib/saved-views/validation';
import { NextResponse } from 'next/server';
import { projectIdFrom, viewIdFrom } from '../params';

// BK-443 — one saved view.
//
// PATCH  /api/v1/projects/{id}/saved-views/{viewId} — rename (`name`), update the
//        filters it holds (`state`), or both. One verb covers the UI's two
//        buttons. The surface is not changeable.
// DELETE /api/v1/projects/{id}/saved-views/{viewId} — remove the view only; the
//        filters applied on the list are untouched (business rule 7).
//
// Another member's view, another project's view and a nonexistent id all match
// zero rows and answer the same 404, so a foreign id discloses nothing.

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = projectIdFrom(request);
  const viewId = viewIdFrom(request);
  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = parseSavedViewInput(SavedViewPatchBodySchema, payload);

  const item = await updateSavedView(db, { userId: principal.userId, projectId, viewId }, body);
  return jsonResponse({ item }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = projectIdFrom(request);
  const viewId = viewIdFrom(request);
  const { principal, db } = getAuth(ctx);

  await deleteSavedView(db, { userId: principal.userId, projectId, viewId });
  return new NextResponse(null, { status: 204 });
}, { auth: 'required', requires: ['atc:write'] });
