import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { updateTestPlan } from '@lib/supabase/rpc';
import { mapTestPlanRpcError } from '@lib/test-plans/errors';
import { TestPlanUpdateBodySchema } from '@lib/test-plans/validation';

// PATCH /api/v1/test-plans/{id} — edit a test plan's name, description and
//       goal (member+, and only while the plan is Open). Same rulebook as
//       create, with no conditional carve-out: Test Plans carry no
//       now()-relative bound, so every field re-validates identically on both
//       paths and the SAME unique index enforces case-insensitive uniqueness
//       on rename that it enforces on create (ratified T5). Self-exclusion is
//       automatic — updating a row to the name it already holds does not
//       violate the index, because it is the same row.
//
//       Edit is NOT creator-restricted: `created_by` is stored for audit and
//       display only and is never read as an authorization input (ratified —
//       a plan is a team-shared artefact, so a member may edit a plan another
//       member created).
//
// No DELETE — ratified T4 (2026-08-14), epic-wide: there is no Delete for a
// Test Plan, ever; Close (BK-207) is the sole exit from Open. The migration
// ships no DELETE policy and no delete RPC to back one.

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const testPlanId = extractTestPlanId(request);
  if (!isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Test plan id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = TestPlanUpdateBodySchema.parse(payload);

  // `bunkai_update_test_plan` carries NO p_actor_user_id — auth.uid() is read
  // directly, so this MUST go through the caller's own RLS-scoped client
  // (never `createAdminClient()`). There is no read-before-write here: unlike
  // the milestone edit path, nothing about this update is conditional on the
  // stored value, so the RPC's own row lock + non-disclosure split (404 for a
  // non-member, 403 for a viewer) is the whole story.
  const { data, error } = await updateTestPlan(db, {
    testPlanId,
    name: body.name,
    description: body.description,
    goal: body.goal,
  });
  if (error) {
    mapTestPlanRpcError(error);
  }

  return jsonResponse({ test_plan: data }, { status: 200 });
  // Capability posture is mandatory — `lib/api/handler.ts` defines no default,
  // and `requires: []` would type-check while checking nothing.
}, { auth: 'required', requires: ['atc:write'] });

function extractTestPlanId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
