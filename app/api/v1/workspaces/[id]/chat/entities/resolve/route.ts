import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { parseResolveBody, resolveEntityCards } from '../../entities';

// POST /api/v1/workspaces/{id}/chat/entities/resolve — BK-218. Turns the
// ATC / Test / Run references found in rendered messages into their CURRENT
// card data. Permission-aware: never discloses an entity outside the channel's
// workspace (see ../../entities.ts). Read-only despite POST (batched ids).

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const segments = new URL(request.url).pathname.split('/');
  const workspaceId = segments[segments.lastIndexOf('workspaces') + 1] ?? '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  let json: unknown;
  try {
    json = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const refs = parseResolveBody(json);
  const { db } = getAuth(ctx);
  return jsonResponse(await resolveEntityCards(db, { workspaceId, refs }), { status: 200 });
}, {
  auth: 'authenticated',
  why: 'Rich-link resolution is membership-scoped: RLS on the caller client plus the channel workspace bound what is disclosed, not a capability scope.',
});
