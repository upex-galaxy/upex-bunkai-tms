import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';

// BK-206 — shared by the attach (POST .../plans) and detach (DELETE .../plans/{testPlanId})
// routes under /api/v1/projects/{projectId}/milestones/{milestoneId}.

export function extractMilestonePlanIds(request: NextRequest): { projectId: string, milestoneId: string, testPlanId: string } {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const projectsIdx = segments.lastIndexOf('projects');
  const milestonesIdx = segments.lastIndexOf('milestones');
  const plansIdx = segments.lastIndexOf('plans');
  return {
    projectId: projectsIdx >= 0 ? (segments[projectsIdx + 1] ?? '') : '',
    milestoneId: milestonesIdx >= 0 ? (segments[milestonesIdx + 1] ?? '') : '',
    testPlanId: plansIdx >= 0 ? (segments[plansIdx + 1] ?? '') : '',
  };
}

export function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

// The milestone must belong to the project named in the path (TL-1). Read through the
// caller's RLS-scoped client, so a milestone in another project, in another workspace,
// or invisible to a non-member all answer the same 404 the RPC gives a missing one.
// This is a path-consistency check, not the authorization: the RPC re-derives the
// caller's membership and role live on every call.
export async function findMilestoneInProject(
  db: SupabaseClient<Database>,
  args: { projectId: string, milestoneId: string },
): Promise<{ id: string, workspace_id: string }> {
  const { data, error } = await db
    .from('milestones')
    .select('id, workspace_id')
    .eq('id', args.milestoneId)
    .eq('project_id', args.projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Milestone not found.', { details: { reason: 'not_found' } });
  }
  return data;
}
