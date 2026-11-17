import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { createAdminClient } from '@lib/supabase/admin';
import { archiveTest, getTestExpanded, renameTest } from '@lib/supabase/rpc';
import { mapTestRpcError } from '@lib/tests/errors';
import { TEST_TITLE_MAX, TestRenameBodySchema, testTitleFault } from '@lib/tests/validation';

// GET /api/v1/tests/{id}?expand=atcs.steps,atcs.assertions — read-only expanded
// Test view (BK-32). Returns the Test header + the ordered chain of ATCs, each
// expanded inline with its ordered steps and assertions. Read auth only: viewer
// role suffices and the read-level membership re-check is enforced inside the
// SECURITY DEFINER RPC (`bunkai_get_test_expanded`). Non-disclosure (INV-3):
// missing, not-visible, and foreign-workspace Tests all collapse into one
// identical 404 (`not_found`) — never 403, never an existence echo. The
// `expand` query param is accepted for forward-compatibility and IGNORED; the
// response is always fully expanded in the MVP. BK-596: an archived Test keeps
// resolving, with `archived_at` set.

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
}, { auth: 'required', requires: ['atc:read'] });

// PATCH /api/v1/tests/{id} — rename a Test (BK-596, the published "update a
// Test" contract; the title is the only field a Test has to update). Same name
// rule as create. The version token rides `X-If-Match` (BK-96); a stale one is a
// 409 with `current_version`. An identical name after trimming is a 200 with
// `changed: false`, no version bump and no event. An archived Test answers 409
// `test_archived`. Auth: Bearer `atc:write` (or cookie).
export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }
  const { principal } = getAuth(ctx);

  const raw = (await request.text()).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw === '' ? '{}' : raw);
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const body = TestRenameBodySchema.parse(parsed);

  const fault = testTitleFault(body.title);
  if (fault === 'title_required') {
    throw new ApiError('validation_failed', 'A Test needs a name.', { details: { reason: 'title_required' } });
  }
  if (fault === 'title_too_long') {
    throw new ApiError('validation_failed', `Title must be ${TEST_TITLE_MAX} characters or fewer.`, { details: { reason: 'title_too_long' } });
  }

  const precondition = readVersionPrecondition(request.headers);
  if (!precondition.ok) {
    throw new ApiError('bad_request', 'X-If-Match must be a decimal integer version.');
  }

  const { data, error } = await renameTest(createAdminClient(), {
    actorUserId: principal.userId,
    testId,
    title: body.title.trim(),
    ifMatch: precondition.version,
  });
  if (error) {
    mapTestRpcError(error);
  }
  const { changed, ...test } = data as unknown as Record<string, unknown> & { changed: boolean };
  return jsonResponse({ test, changed }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// DELETE /api/v1/tests/{id} — archive one Test (BK-596, the published
// "Soft-delete a Test → 204 Archived" contract, BK-571's vocabulary). Recoverable
// through POST .../restore; nothing is destroyed, no Run, chain or Test Plan is
// edited. Idempotent: archiving an archived Test is the same 204, with the first
// actor and timestamp kept and no new event. Auth: Bearer `atc:write` (or cookie).
export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }
  const { principal } = getAuth(ctx);
  const { error } = await archiveTest(createAdminClient(), { actorUserId: principal.userId, testId });
  if (error) {
    mapTestRpcError(error);
  }
  return new Response(null, { status: 204 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
