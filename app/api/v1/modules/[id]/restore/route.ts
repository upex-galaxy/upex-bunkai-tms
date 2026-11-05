import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { restoreErrorFrom } from '@lib/modules/restore-errors';

// POST /api/v1/modules/{id}/restore — bring an archived Module back with exactly
// what its archive took (BK-601). The atomic work runs in the SECURITY DEFINER
// function bunkai_restore_module_subtree (0117), whose actor is the caller's
// auth.uid(). Idempotent: an active Module is a 200 with `changed: false`, no write
// and no event. A restore the live tree can no longer hold is a 409 with
// `details.reason`. Auth: Bearer `atc:write` (or cookie).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const moduleId = extractModuleId(request);
  if (!isUuid(moduleId)) {
    throw new ApiError('bad_request', 'Module id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // Split a stranger (404) from a viewer (the function's 403), as DELETE does: RLS
  // scopes this read, and it does not filter archived rows.
  const { data: existing, error: selError } = await db
    .from('modules')
    .select('id')
    .eq('id', moduleId)
    .maybeSingle();
  if (selError) {
    throw new ApiError('internal_error', selError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Module not found.');
  }

  const { data, error } = await db.rpc('bunkai_restore_module_subtree', { p_module_id: moduleId });
  if (error) {
    throw restoreErrorFrom(error);
  }

  return jsonResponse({ restored: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/modules/{id}/restore.
function extractModuleId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
