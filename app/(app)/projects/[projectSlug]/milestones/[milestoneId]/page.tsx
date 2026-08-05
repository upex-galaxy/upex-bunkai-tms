import type { MilestoneDetail } from '@components/milestones/MilestoneDetailView';
import { MilestoneDetailView } from '@components/milestones/MilestoneDetailView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { resolveActivityActors } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string, milestoneId: string }>
}

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
    .select('id, name, target_date, description, created_by')
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

  const milestone: MilestoneDetail = {
    id: row.id,
    projectSlug,
    name: row.name,
    targetDate: row.target_date,
    description: row.description,
    creatorLabel,
  };

  return <MilestoneDetailView milestone={milestone} canEdit={canEdit} />;
}
