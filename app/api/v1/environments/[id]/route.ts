import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapEnvironmentRpcError } from '@lib/environments/errors';
import { EnvironmentRenameBodySchema } from '@lib/environments/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { deleteEnvironment, renameEnvironment } from '@lib/supabase/rpc';

// PATCH  /api/v1/environments/{id} — rename an environment (member+). Same name
//        rules as create (trim, length 1..50, case-insensitive uniqueness). The
//        row id is unchanged, so runs that reference it keep referencing it.
// DELETE /api/v1/environments/{id} — remove an environment (member+). BLOCKED
//        (409) when >= 1 run references it; the response message states how many.
//        Unused environments are hard-deleted.
//
// Both call the SECURITY DEFINER RPC with the resolved actor id (the admin
// client lets a PAT write through the same DEFINER path the cookie session
// uses, mirroring the runs route). The RPC raises the 452xx environments block
// + the shared 42501 / P0002 gate codes, mapped via mapEnvironmentRpcError.

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const environmentId = extractEnvironmentId(request);
  if (!isUuid(environmentId)) {
    throw new ApiError('bad_request', 'Environment id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = EnvironmentRenameBodySchema.parse(payload);

  const supabase = createAdminClient();
  const { data, error } = await renameEnvironment(supabase, {
    actorUserId: principal.userId,
    environmentId,
    name: body.name,
  });
  if (error) {
    mapEnvironmentRpcError(error);
  }

  return jsonResponse({ environment: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const environmentId = extractEnvironmentId(request);
  if (!isUuid(environmentId)) {
    throw new ApiError('bad_request', 'Environment id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await deleteEnvironment(supabase, {
    actorUserId: principal.userId,
    environmentId,
  });
  if (error) {
    mapEnvironmentRpcError(error);
  }

  return jsonResponse({ deleted: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractEnvironmentId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
