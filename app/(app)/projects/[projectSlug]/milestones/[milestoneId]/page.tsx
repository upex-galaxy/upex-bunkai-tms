import type { MilestoneDetail } from '@components/milestones/MilestoneDetailView';
import { MilestoneDetailView } from '@components/milestones/MilestoneDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { overdueInfo, parseMilestonesReadiness } from '@lib/milestones/readiness-view';
import { todayUtcIso } from '@lib/milestones/validation';
import { milestonesReadiness, resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, milestoneId: string }>
}

// BK-206 — the page also reads the milestone's readiness (one
// `bunkai_milestones_readiness` call on the caller's own client), evaluates the
// overdue predicate HERE on the server UTC date (never in the browser, D7), and
// reads the project's open test plans for the Attach-plans picker (member+ only).
//
// BK-205 — read-only Milestone detail page. Milestones are project-scoped;
// the read is keyed by `milestoneId` + RLS (any workspace member of the
// milestone's project), `projectSlug` is the route's display/back-link
// context only — same shape as the Run detail page's own comment on this.
// A missing / not-visible / foreign-workspace milestone collapses into one
// safe `notFound()` (non-disclosure), matching the RPC's own P0002 split for
// the edit path.
export default async function MilestoneDetailPage({ params }: PageProps) {
  const { projectSlug, milestoneId } = await params;
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
    .from('milestones')
    .select('id, project_id, name, target_date, description, created_by')
    .eq('id', milestoneId)
    .maybeSingle();
  if (error || !row) { notFound(); }

  const { data: memberRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
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

  // A failed read leaves readiness null: the card says "unavailable" and no overdue
  // state is claimed.
  const { data: readinessData, error: readinessError } = await milestonesReadiness(supabase, { milestoneIds: [row.id] });
  const readiness = readinessError ? null : (parseMilestonesReadiness(readinessData).get(row.id) ?? null);
  const todayIso = todayUtcIso();
  const overdue = readiness ? overdueInfo({ targetDate: row.target_date, readinessPct: readiness.passed_pct }, todayIso) : null;

  let attachablePlans: { id: string, name: string }[] = [];
  if (canEdit) {
    const { data: openPlans } = await supabase
      .from('test_plans')
      .select('id, name')
      .eq('project_id', row.project_id)
      .eq('status', 'open')
      .order('name', { ascending: true })
      .order('id', { ascending: true });
    attachablePlans = openPlans ?? [];
  }

  const milestone: MilestoneDetail = {
    id: row.id,
    projectId: row.project_id,
    projectSlug,
    name: row.name,
    targetDate: row.target_date,
    description: row.description,
    creatorLabel,
  };

  return (
    <MilestoneDetailView
      milestone={milestone}
      canEdit={canEdit}
      readiness={readiness}
      overdue={overdue}
      attachablePlans={attachablePlans}
      todayIso={todayIso}
    />
  );
}
