import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { getTestExpanded } from '@lib/supabase/rpc';
import { mapTestRpcError } from '@lib/tests/errors';

// GET /api/v1/tests/{id}?expand=atcs.steps,atcs.assertions — read-only expanded
// Test view (BK-32). Returns the Test header + the ordered chain of ATCs, each
// expanded inline with its ordered steps and assertions. Read auth only: viewer
// role suffices and the read-level membership re-check is enforced inside the
// SECURITY DEFINER RPC (`bunkai_get_test_expanded`). Non-disclosure (INV-3):
// missing, not-visible, and foreign-workspace Tests all collapse into one
// identical 404 (`not_found`) — never 403, never an existence echo. The
// `expand` query param is accepted for forward-compatibility and IGNORED; the
// response is always fully expanded in the MVP.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await getTestExpanded(supabase, { actorUserId: principal.userId, testId });
  if (error) {
    mapTestRpcError(error);
  }

  return jsonResponse({ test: data }, { status: 200 });
}, { auth: 'required' });

function extractTestId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
