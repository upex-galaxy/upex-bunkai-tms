import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { mapMilestonePlanRpcError } from '@lib/milestones/errors';
import { extractMilestonePlanIds, findMilestoneInProject, isUuid } from '@lib/milestones/plans-route';
import { detachPlanFromMilestone } from '@lib/supabase/rpc';
import { NextResponse } from 'next/server';

// DELETE /api/v1/projects/{projectId}/milestones/{milestoneId}/plans/{testPlanId} —
//        detach one Test Plan from a Milestone (member+). BK-206, contract D2: 204 and
//        idempotent, so detaching a plan that is not attached also answers 204.
//        Detaching never touches the plan or its progress: the RPC only reaches
//        `milestone_plans`.

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { projectId, milestoneId, testPlanId } = extractMilestonePlanIds(request);
  if (!isUuid(projectId) || !isUuid(milestoneId) || !isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Project id, milestone id and test plan id must all be UUIDs.');
  }

  const { db } = getAuth(ctx);

  await findMilestoneInProject(db, { projectId, milestoneId });

  // No identity parameter: the caller's own RLS-scoped client only.
  const { error } = await detachPlanFromMilestone(db, { milestoneId, testPlanId });
  if (error) {
    mapMilestonePlanRpcError(error);
  }

  return new NextResponse(null, { status: 204 });
}, { auth: 'required', requires: ['atc:write'] });
