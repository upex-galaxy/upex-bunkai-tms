import type { TestPlanDetail } from '@components/test-plans/TestPlanDetailView';
import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import { TestPlanDetailView } from '@components/test-plans/TestPlanDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, planId: string }>
}

// BK-202 — Test Plan detail page. Test Plans are project-scoped; the read is
// keyed by `planId` + RLS (any workspace member of the plan's project),
// `projectSlug` is the route's display / back-link context only — same shape
// as the Milestone and Run detail pages. A missing / not-visible /
// foreign-workspace plan collapses into one safe `notFound()`
// (non-disclosure), matching the RPC's own P0002 split for the edit path.
export default async function TestPlanDetailPage({ params }: PageProps) {
  const { projectSlug, planId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { notFound(); }

  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  const { data: row, error } = await supabase
    .from('test_plans')
    .select('id, name, description, goal, status, created_by, created_at')
    .eq('id', planId)
    .maybeSingle();
  if (error || !row) { notFound(); }

  const { data: memberRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  // Edit is member+, and is NOT restricted to the plan's creator — a plan is
  // a team-shared artefact (ratified), so `created_by` is never compared here.
  const canEdit = ['member', 'admin', 'owner'].includes(memberRow?.role ?? '');

  let creatorLabel = '';
  if (row.created_by) {
    const { data: resolved } = await resolveActivityActors(supabase, {
      workspaceId: activeWorkspaceId,
      userIds: [row.created_by],
    });
    creatorLabel = ((resolved ?? []) as { user_id: string, email: string | null }[])
      .find(actor => actor.user_id === row.created_by)
      ?.email ?? '';
  }

  const testPlan: TestPlanDetail = {
    id: row.id,
    projectSlug,
    name: row.name,
    description: row.description,
    goal: row.goal,
    status: row.status as TestPlanStatus,
    creatorLabel,
    createdAtLabel: row.created_at.slice(0, 10),
  };

  return <TestPlanDetailView testPlan={testPlan} canEdit={canEdit} />;
}
