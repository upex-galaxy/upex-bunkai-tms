import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { sanitizeSearchTerm, searchEntities } from '../../entities';

// GET /api/v1/workspaces/{id}/chat/entities/search?q= — BK-218 composer picker.
// ATCs, Tests and Runs of the channel's workspace, by title (or full id / ATC
// slug); empty `q` lists the most recent. Inaccessible entities are omitted.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const segments = new URL(request.url).pathname.split('/');
  const workspaceId = segments[segments.lastIndexOf('workspaces') + 1] ?? '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  const { db } = getAuth(ctx);
  const q = sanitizeSearchTerm(request.nextUrl.searchParams.get('q'));
  return jsonResponse(await searchEntities(db, { workspaceId, q }), { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Entity picker search is membership-scoped: RLS on the caller client bounds what is listed, not a capability scope.',
});
