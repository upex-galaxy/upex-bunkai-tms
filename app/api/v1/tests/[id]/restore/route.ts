import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { restoreTest } from '@lib/supabase/rpc';
import { mapTestRpcError } from '@lib/tests/errors';

// POST /api/v1/tests/{id}/restore — restore an archived Test (BK-596, BK-571's
// vocabulary). Idempotent: restoring a live Test is a 200 with `changed: false`,
// no write and no event. A Test has no archived parent, so a restore always
// returns it to full use with its chain, tags and Runs untouched. Auth: Bearer
// `atc:write` (or cookie).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }
  const { principal } = getAuth(ctx);
  const { data, error } = await restoreTest(createAdminClient(), { actorUserId: principal.userId, testId });
  if (error) {
    mapTestRpcError(error);
  }
  return jsonResponse({ test: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/tests/{id}/restore.
function extractTestId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
