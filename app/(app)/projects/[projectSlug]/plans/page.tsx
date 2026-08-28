import type { TestPlanListItem } from '@components/test-plans/TestPlansListView';
import type { TestPlanStatus } from '@components/test-plans/TestPlanStatusChip';
import { TestPlansListSkeleton, TestPlansListView } from '@components/test-plans/TestPlansListView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// BK-202 — the "Test Plans" list view (`/projects/[projectSlug]/plans`, the
// route master-design-plan §4.11 names for this screen). Reads are plain
// RLS-scoped PostgREST selects (ADR-0001 Path B; no RPC for list/detail),
// mirroring the milestones list's workspace/project resolution and
// member-role derivation.
export default async function ProjectTestPlansPage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <Suspense fallback={<TestPlansListSkeleton />}>
      <ProjectTestPlansSection projectSlug={projectSlug} />
    </Suspense>
  );
}

async function ProjectTestPlansSection({ projectSlug }: { projectSlug: string }) {
  const supabase = await createClient();

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

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  // Same member+ (not-viewer) gate as ProjectLayout's own `canCreate` and the
  // Milestones list — a viewer sees the list read-only, create action
  // structurally absent (business-rules.md, AC 4.1). This is presentation
  // only: `bunkai_create_test_plan` re-derives the role live on every write,
  // so a stale client role cannot carry a create (AC 4.5).
  const { data: { user } } = await supabase.auth.getUser();
  let canCreate = false;
  if (user) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    canCreate = membership != null && membership.role !== 'viewer';
  }

  const { data: rows } = await supabase
    .from('test_plans')
    .select('id, name, description, goal, status, created_by')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  const planRows = rows ?? [];
  const creatorIds = [...new Set(
    planRows.map(row => row.created_by).filter((id): id is string => id !== null),
  )];
  const emailByUserId = new Map<string, string | null>();
  if (creatorIds.length > 0) {
    const { data: resolved } = await resolveActivityActors(supabase, {
      workspaceId: activeWorkspaceId,
      userIds: creatorIds,
    });
    for (const actor of (resolved ?? []) as { user_id: string, email: string | null }[]) {
      emailByUserId.set(actor.user_id, actor.email);
    }
  }

  // BK-203 — live per-plan test counts. One extra query, counted client-side
  // (this list is small-N, same scale the rest of this page already reads at)
  // rather than a denormalized counter column, which would be a second write
  // path to keep in sync with test_plan_tests.
  const planIds = planRows.map(row => row.id);
  const testCountByPlanId = new Map<string, number>();
  if (planIds.length > 0) {
    const { data: memberships } = await supabase
      .from('test_plan_tests')
      .select('test_plan_id')
      .in('test_plan_id', planIds);
    for (const row of memberships ?? []) {
      testCountByPlanId.set(row.test_plan_id, (testCountByPlanId.get(row.test_plan_id) ?? 0) + 1);
    }
  }

  const testPlans: TestPlanListItem[] = planRows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    goal: row.goal,
    status: row.status as TestPlanStatus,
    testCount: testCountByPlanId.get(row.id) ?? 0,
    creatorLabel: row.created_by ? (emailByUserId.get(row.created_by) ?? '') : '',
  }));

  return (
    <TestPlansListView
      projectId={project.id}
      projectSlug={project.slug}
      testPlans={testPlans}
      canCreate={canCreate}
    />
  );
}
