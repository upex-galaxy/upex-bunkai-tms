import type { TestPlanDetail } from '@components/test-plans/TestPlanDetailView';
import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import { TestPlanDetailSkeleton, TestPlanDetailView } from '@components/test-plans/TestPlanDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

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

  return (
    <Suspense fallback={<TestPlanDetailSkeleton />}>
      <TestPlanDetailSection projectSlug={projectSlug} planId={planId} />
    </Suspense>
  );
}

async function TestPlanDetailSection({ projectSlug, planId }: { projectSlug: string, planId: string }) {
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

  // `workspace_id` and `project_id` are selected, not just displayed columns:
  // both are load-bearing below. RLS already hides a plan the caller cannot
  // see, but it does NOT tie the row to the project named in the URL, and the
  // caller's role must be read in the PLAN's workspace rather than in whatever
  // workspace the cookie currently makes active.
  const { data: row, error } = await supabase
    .from('test_plans')
    .select('id, project_id, workspace_id, name, description, goal, status, created_by, created_at')
    .eq('id', planId)
    .maybeSingle();
  if (error || !row) { notFound(); }

  // The plan must actually belong to the project this URL names. Without this,
  // /projects/other-project/plans/<id> renders a plan from a different project
  // under the wrong breadcrumb and back-link.
  const { data: routeProject } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .eq('workspace_id', row.workspace_id)
    .maybeSingle();
  if (!routeProject || routeProject.id !== row.project_id) { notFound(); }

  const { data: memberRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', row.workspace_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  // Edit is member+ IN THE PLAN'S OWN WORKSPACE — deriving it from the active
  // workspace instead would show the Edit affordance to someone who is an
  // admin here and a viewer there. The RPC would still refuse the write with
  // 42501, so that would be a misleading UI rather than an escalation, but a
  // control that appears and then fails is its own defect.
  const canEdit = ['member', 'admin', 'owner'].includes(memberRow?.role ?? '');

  let creatorLabel = '';
  if (row.created_by) {
    const { data: resolved } = await resolveActivityActors(supabase, {
      workspaceId: row.workspace_id,
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
