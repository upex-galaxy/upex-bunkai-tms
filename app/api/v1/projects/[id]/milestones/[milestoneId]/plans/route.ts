import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { mapMilestonePlanRpcError } from '@lib/milestones/errors';
import { extractMilestonePlanIds, findMilestoneInProject, isUuid } from '@lib/milestones/plans-route';
import { MilestoneAttachPlansBodySchema } from '@lib/milestones/plans-validation';
import { attachPlansToMilestone } from '@lib/supabase/rpc';

// POST /api/v1/projects/{projectId}/milestones/{milestoneId}/plans — attach one or
//      more Test Plans of the same project to a Milestone (member+). BK-206, contract
//      D2 ratified 2026-10-25 under the `/api/v1` prefix every route carries (AI Tech
//      Lead decision TL-1). `Idempotency-Key` is REQUIRED (a replay answers the stored
//      201); the database unique (milestone_id, test_plan_id) index is the second,
//      independent backstop. A selection with any plan already attached is rejected
//      whole (409 + milestone_plan_exists). A plan outside the project, in another
//      workspace or unknown answers one 422 that names no id.
//
// There is deliberately no GET: readiness is read by the server-rendered milestone
// pages straight from `bunkai_milestones_readiness` (D1, no new read endpoint).

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { projectId, milestoneId } = extractMilestonePlanIds(request);
  if (!isUuid(projectId) || !isUuid(milestoneId)) {
    throw new ApiError('bad_request', 'Project id and milestone id must both be UUIDs.');
  }

  const { principal, db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = MilestoneAttachPlansBodySchema.parse(payload);

  // The milestone must belong to the project in the path. Read through RLS, so a
  // milestone the caller cannot see answers the same 404 as a missing one.
  const milestone = await findMilestoneInProject(db, { projectId, milestoneId });

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: `POST /api/v1/projects/${projectId}/milestones/${milestoneId}/plans`,
    workspaceId: milestone.workspace_id,
    requestPayload: body,
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  // `bunkai_attach_plans_to_milestone` carries NO identity parameter: auth.uid() is
  // read inside, so this MUST run on the caller's own RLS-scoped client.
  let responseBody: { milestone_id: string, attached_count: number, plan_count: number } | null = null;
  try {
    const { data, error } = await attachPlansToMilestone(db, { milestoneId, testPlanIds: body.test_plan_ids });
    if (error) {
      mapMilestonePlanRpcError(error);
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
    console.error(`idempotency snapshot store failed for POST /api/v1/projects/${projectId}/milestones/${milestoneId}/plans`, recordError);
  }
  return jsonResponse(responseBody, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });
