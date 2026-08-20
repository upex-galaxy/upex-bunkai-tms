import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createTestPlan } from '@lib/supabase/rpc';
import { mapTestPlanRpcError } from '@lib/test-plans/errors';
import { TestPlanCreateBodySchema } from '@lib/test-plans/validation';

// GET  /api/v1/projects/{id}/test-plans — list a project's test plans, newest
//      first (id tie-break for a stable order). Visible to any workspace
//      member via the SELECT RLS policy (a non-member's cookie-scoped read
//      returns []), viewers included — read access is role-agnostic among
//      members (business-rules.md).
// POST /api/v1/projects/{id}/test-plans — create a test plan (member+). The
//      SECURITY DEFINER RPC holds the rulebook (write gate, normalize +
//      length, uniqueness); this handler does parsing and error mapping only.
//
// HYBRID error model (mirrors the milestones + environments + bugs routes): a
// body-rule failure keeps the house `code` but carries a granular
// `details.reason`.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // RLS scopes the read to test plans the caller can see (workspace members).
  // `created_at desc, id desc` is the deterministic order the list renders in
  // — a plan has no date axis the way a milestone does, so newest cycle
  // first. Served by test_plans_project_created_at_id_idx (migration 0073)
  // scanned backwards.
  const { data, error } = await db
    .from('test_plans')
    .select('id, project_id, name, description, goal, status, created_by, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ test_plans: data ?? [] }, { status: 200 });
  // Capability posture is mandatory — `lib/api/handler.ts` defines no default,
  // and `requires: []` would type-check while checking nothing.
}, { auth: 'required', requires: ['atc:read'] });

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = TestPlanCreateBodySchema.parse(payload);

  // `bunkai_create_test_plan` carries NO p_actor_user_id — auth.uid() is read
  // directly, so this MUST go through the caller's own RLS-scoped client
  // (never `createAdminClient()`; a PAT's user-scoped JWT still carries
  // auth.uid() through this same path — ADR-0001 Path B). The member+ gate
  // and the case-insensitive uniqueness check both live inside the RPC and
  // its unique index: this route deliberately performs NO pre-check of
  // either, since an app-level duplicate check would reopen the concurrent
  // -create race the DB index closes (AC 2.6).
  const { data, error } = await createTestPlan(db, {
    projectId,
    name: body.name,
    description: body.description,
    goal: body.goal,
  });
  if (error) {
    mapTestPlanRpcError(error);
  }

  return jsonResponse({ test_plan: data }, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });

function extractProjectId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('projects');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
