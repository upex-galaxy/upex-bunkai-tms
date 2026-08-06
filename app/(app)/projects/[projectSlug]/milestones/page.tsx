import type { MilestoneListItem } from '@components/milestones/MilestonesListView';
import { MilestonesListSkeleton, MilestonesListView } from '@components/milestones/MilestonesListView';
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

// BK-205 — the "Milestones" list view (`/projects/[projectSlug]/milestones`).
// Reads are plain RLS-scoped PostgREST selects (ADR-0001 Path B; no RPC for
// list/detail — the Tech Lead decision named this explicitly), mirroring
// `bugs/page.tsx`'s workspace/project resolution and member-role derivation.
export default async function ProjectMilestonesPage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <Suspense fallback={<MilestonesListSkeleton />}>
      <ProjectMilestonesSection projectSlug={projectSlug} />
    </Suspense>
  );
}

async function ProjectMilestonesSection({ projectSlug }: { projectSlug: string }) {
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
  // Bug Reports list — a viewer sees the list read-only, create action
  // structurally absent (business-rules.md).
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
    .from('milestones')
    .select('id, name, target_date, description, created_by')
    .eq('project_id', project.id)
    .order('target_date', { ascending: true })
    .order('id', { ascending: true });

  const milestoneRows = rows ?? [];
  const creatorIds = [...new Set(
    milestoneRows.map(row => row.created_by).filter((id): id is string => id !== null),
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

  const milestones: MilestoneListItem[] = milestoneRows.map(row => ({
    id: row.id,
    name: row.name,
    targetDate: row.target_date,
    description: row.description,
    creatorLabel: row.created_by ? (emailByUserId.get(row.created_by) ?? '') : '',
  }));

  return (
    <MilestonesListView
      projectId={project.id}
      projectSlug={project.slug}
      milestones={milestones}
      canCreate={canCreate}
    />
  );
}
