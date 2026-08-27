import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { addTestsToPlan, resolveActivityActors } from '@lib/supabase/rpc';
import { mapTestPlanTestsRpcError } from '@lib/test-plans/errors';
import { TestPlanAddTestsBodySchema } from '@lib/test-plans/tests-validation';

// GET  /api/v1/test-plans/{id}/tests — list a plan's member tests (name,
//      tags, added-by, added-at). Plain RLS-scoped select, NOT an RPC — same
//      "list/detail reads are not RPCs" precedent 0073 documents for
//      test_plans itself. Visible to any workspace member, viewers included
//      (business-rules.md: seeing membership is role-agnostic, only
//      add/remove is gated).
// POST /api/v1/test-plans/{id}/tests — add one or more tests (member+, plan
//      must be Open). `Idempotency-Key` is REQUIRED — the same header
//      middleware `POST /api/v1/tests` already uses, backstopped by the DB
//      unique(test_plan_id, test_id) index (AC E3, Dev-answered).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const testPlanId = extractTestPlanId(request);
  if (!isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Test plan id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data: plan, error: planError } = await db
    .from('test_plans')
    .select('id, workspace_id')
    .eq('id', testPlanId)
    .maybeSingle();
  if (planError) {
    throw new ApiError('internal_error', planError.message);
  }
  if (!plan) {
    throw new ApiError('not_found', 'Test plan not found.', { details: { reason: 'not_found' } });
  }

  const { data: rows, error: rowsError } = await db
    .from('test_plan_tests')
    .select('id, test_id, added_by, created_at, tests(id, title, tags)')
    .eq('test_plan_id', testPlanId)
    .order('created_at', { ascending: true });
  if (rowsError) {
    throw new ApiError('internal_error', rowsError.message);
  }

  const memberRows = rows ?? [];
  const addedByIds = [...new Set(memberRows.map(row => row.added_by).filter((id): id is string => id !== null))];

  let emailById = new Map<string, string>();
  if (addedByIds.length > 0) {
    const { data: actors, error: actorsError } = await resolveActivityActors(db, {
      workspaceId: plan.workspace_id,
      userIds: addedByIds,
    });
    if (actorsError) {
      throw new ApiError('internal_error', actorsError.message);
    }
    emailById = new Map(
      ((actors ?? []) as { user_id: string, email: string | null }[])
        .map(actor => [actor.user_id, actor.email ?? '']),
    );
  }

  const tests = memberRows.map(row => ({
    id: row.test_id,
    title: row.tests?.title ?? '',
    tags: row.tests?.tags ?? [],
    added_by: row.added_by,
    added_by_email: row.added_by ? (emailById.get(row.added_by) ?? '') : null,
    added_at: row.created_at,
  }));

  return jsonResponse({ tests, count: tests.length }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const testPlanId = extractTestPlanId(request);
  if (!isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Test plan id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = TestPlanAddTestsBodySchema.parse(payload);

  // RLS-scoped read purely for the idempotency row's workspace_id (matches
  // the sibling POST /api/v1/tests). Not an authorization gate — a plan the
  // caller cannot see simply yields null here, and the RPC below is the
  // actual, re-checked-live enforcement point regardless.
  const { data: planForIdempotency } = await db
    .from('test_plans')
    .select('workspace_id')
    .eq('id', testPlanId)
    .maybeSingle();

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: `POST /api/v1/test-plans/${testPlanId}/tests`,
    workspaceId: planForIdempotency?.workspace_id ?? null,
    requestPayload: body,
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  // `bunkai_add_tests_to_plan` carries NO p_actor_user_id — auth.uid() is
  // read directly, so this MUST go through the caller's own RLS-scoped
  // client (never `createAdminClient()`), same contract as
  // create/updateTestPlan.
  let responseBody: { test_plan_id: string, added_count: number, member_count: number } | null = null;
  try {
    const { data, error } = await addTestsToPlan(db, {
      testPlanId,
      testIds: body.test_ids,
    });
    if (error) {
      mapTestPlanTestsRpcError(error);
    }
    responseBody = data as typeof responseBody;
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  try {
    await recordIdempotencyResult(begin.token, responseBody, 201);
  }
  catch (recordError) {
    console.error(`idempotency snapshot store failed for POST /api/v1/test-plans/${testPlanId}/tests`, recordError);
  }
  return jsonResponse(responseBody, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestPlanId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('test-plans');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
