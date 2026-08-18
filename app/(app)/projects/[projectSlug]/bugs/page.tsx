import type { BugsListPageResponse } from '@app/api/v1/bugs/list-response';
import { fetchBugsListPage } from '@app/api/v1/bugs/list-response';
import { BugsListSkeleton, BugsListView } from '@components/bugs/BugsListView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { BUGS_LIST_PAGE_SIZE } from '@lib/bugs/constants';
import { createAdminClient } from '@lib/supabase/admin';
import { resolveActivityActors } from '@lib/supabase/rpc';
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

  // BK-264 — every active member of the current workspace, feeding the List
  // view's own Assignee picker (a bug can only be assigned to a workspace
  // member — assigning outside this set is what the assign RPC's own
  // 45312/45313 rejections exist for).
  //
  // Admin client, deliberately: `workspace_members_select_self_or_admin`
  // (0001_tenancy.sql) lets a caller see ONLY their own row unless they are
  // themselves admin/owner — a plain 'member' (e.g. this story's own "Mateo
  // Silva, QA Lead" persona) would otherwise see just themselves in this
  // picker and could never assign a bug to a teammate (discovered live during
  // this slice's own UI validation — the roster silently collapsed to one row
  // under a member-role test identity). `activeWorkspaceId` above is already
  // an RLS-PROVEN membership (resolved from the caller's own RLS-scoped
  // `workspaces` query earlier in this function) before this admin read ever
  // runs, so scoping strictly to that workspace_id discloses nothing a
  // non-member could reach. `workspace_members` carries no email column, so
  // display info is batch-resolved through the SAME `bunkai_resolve_activity_
  // actors` RPC the list response itself already uses for the `assignee`
  // field on each row (ADR-0011's "reusable pattern" note) — called through
  // the caller's OWN RLS-scoped client below (that RPC's SECURITY DEFINER
  // membership check reads auth.uid(), which the admin client has none of).
  const { data: memberRows } = await createAdminClient()
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });
  const memberUserIds = (memberRows ?? []).map(m => m.user_id);
  const memberEmailById = new Map<string, string | null>();
  if (memberUserIds.length > 0) {
    const { data: resolvedMembers } = await resolveActivityActors(supabase, {
      workspaceId: activeWorkspaceId,
      userIds: memberUserIds,
    });
    for (const resolved of resolvedMembers ?? []) {
      memberEmailById.set(resolved.user_id, resolved.email);
    }
  }
  const workspaceMembers = (memberRows ?? []).map(m => ({
    user_id: m.user_id,
    role: m.role,
    email: memberEmailById.get(m.user_id) ?? null,
  }));

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
        projectSlug={projectSlug}
        modules={modules}
        canCreateBug={canCreateBug}
        workspaceMembers={workspaceMembers}
        initialPage={page}
      />
    );
  }
  catch {
    return (
      <BugsListView
        projectId={project.id}
        projectSlug={projectSlug}
        modules={modules}
        canCreateBug={canCreateBug}
        workspaceMembers={workspaceMembers}
        initialPage={EMPTY_PAGE}
        initialError="Could not load this Project's bugs."
      />
    );
  }
}
