import type { BugsListPageResponse } from '@app/api/v1/bugs/list-response';
import { fetchBugsListPage } from '@app/api/v1/bugs/list-response';
import { BugsListSkeleton, BugsListView } from '@components/bugs/BugsListView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { BUGS_LIST_PAGE_SIZE } from '@lib/bugs/constants';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// BK-41 Slice 3 — the "Bug Reports" list/filter view (`/projects/[projectSlug]/
// bugs`). The first (unfiltered) page is now read through the SAME filtered,
// aggregate-bearing path `GET /api/v1/bugs` uses (`fetchBugsListPage`,
// `app/api/v1/bugs/list-response.ts`) instead of BK-40's bare
// `listProjectBugs`/`bunkai_list_project_bugs` RPC — mirrors `activity/
// page.tsx`'s own precedent of reusing the route's own business-logic
// function directly server-side (its comment explains why: no
// Next.js-request coupling, same RLS-scoped `db` client this page already
// holds, avoids a second hand-duplicated mapping). `BugsListView` owns every
// later query (filter changes, load older, retry, post-create refresh)
// through the API route itself — mirrors `RunHistoryView`/`ActivityView`.
export default async function ProjectBugsPage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <Suspense fallback={<BugsListSkeleton />}>
      <ProjectBugsSection projectSlug={projectSlug} />
    </Suspense>
  );
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

  // Feeds BOTH the standalone "New bug" form's Module picker AND (BK-41) the
  // List view's Module filter — same query/shape `atcs/new/page.tsx`'s Module
  // picker already runs for this project, ordered by `path` (not `position`)
  // so the filter dropdown reads as a hierarchy, matching that precedent.
  const { data: modulesData } = await supabase
    .from('modules')
    .select('id, name, path')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('path', { ascending: true });
  const modules = (modulesData ?? []).map(m => ({ id: m.id, name: m.name, path: m.path }));

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

  const EMPTY_PAGE: BugsListPageResponse = {
    data: [],
    aggregates: { by_severity: { P1: 0, P2: 0, P3: 0, P4: 0 }, by_status: { open: 0, in_progress: 0, resolved: 0, closed: 0 } },
    next_cursor: null,
  };

  try {
    if (!user) {
      throw new Error('No session.');
    }

    // Unfiltered defaults — module/status/severity filtering is a client-side
    // affordance `BugsListView` drives entirely through the API route after
    // this first paint (mirrors `activity/page.tsx` calling `fetchActivityPage`
    // directly with the caller's own RLS-scoped `db` client, never
    // `createAdminClient()` — `bunkai_list_bugs` is SECURITY INVOKER).
    const page = await fetchBugsListPage(supabase, {
      projectId: project.id,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: BUGS_LIST_PAGE_SIZE,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    return (
      <BugsListView
        projectId={project.id}
        modules={modules}
        canCreateBug={canCreateBug}
        initialPage={page}
      />
    );
  }
  catch {
    return (
      <BugsListView
        projectId={project.id}
        modules={modules}
        canCreateBug={canCreateBug}
        initialPage={EMPTY_PAGE}
        initialError="Could not load this Project's bugs."
      />
    );
  }
}
