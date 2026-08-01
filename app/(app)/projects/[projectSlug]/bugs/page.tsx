import type { BugListRowInput } from '@lib/bugs/list-view';
import { BugsListSkeleton, BugsListView } from '@components/bugs/BugsListView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { listProjectBugs } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// BK-40 Slice 3 — the standalone "Bug Reports" list + "New bug" form
// (`/projects/[projectSlug]/bugs`). Bare-bones scope (Technical Decision 2):
// unfiltered, single page, no nav wiring yet (matches `/runs`'s own precedent
// before BK-38 — see RunnerView's Technical Decision 10). Mirrors
// `runs/page.tsx`'s exact server-resolution shape: project via slug + active
// workspace, the same Module-picker query `runs/page.tsx`/`atcs/new/page.tsx`
// already run, and one read, one rulebook (the SAME SECURITY DEFINER RPC the
// headless `GET /api/v1/projects/{id}/bugs` route uses).
export default async function ProjectBugsPage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <Suspense fallback={<BugsListSkeleton />}>
      <ProjectBugsSection projectSlug={projectSlug} />
    </Suspense>
  );
}

interface BugsListPayload {
  items: BugListRowInput[]
}

async function ProjectBugsSection({ projectSlug }: { projectSlug: string }) {
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
    .select('id')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();
  if (projectErr || !project) { notFound(); }

  // The standalone "New bug" form's Module picker — same query/shape
  // `runs/page.tsx`'s filter and `atcs/new/page.tsx`'s Module picker already
  // run for this project (surgical-change rule: a small, cheap, redundant
  // read here, not a new prop threaded through the shared layout).
  const { data: modulesData } = await supabase
    .from('modules')
    .select('id, name')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('position', { ascending: true });
  const modules = (modulesData ?? []).map(m => ({ id: m.id, name: m.name }));

  // Same member+ (not-viewer) gate as ProjectLayout's own `canCreate` and
  // RunnerView's `canReportBug` — a viewer sees the list read-only.
  const { data: { user } } = await supabase.auth.getUser();
  let canCreateBug = false;
  if (user) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    canCreateBug = membership != null && membership.role !== 'viewer';
  }

  try {
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await listProjectBugs(supabase, {
      actorUserId: user.id,
      projectId: project.id,
    });
    if (error) {
      throw error;
    }

    const payload = data as unknown as BugsListPayload;

    return (
      <BugsListView
        projectId={project.id}
        modules={modules}
        canCreateBug={canCreateBug}
        initialBugs={payload.items ?? []}
      />
    );
  }
  catch {
    return (
      <BugsListView
        projectId={project.id}
        modules={modules}
        canCreateBug={canCreateBug}
        initialBugs={[]}
        initialError="Could not load this Project's bugs."
      />
    );
  }
}
