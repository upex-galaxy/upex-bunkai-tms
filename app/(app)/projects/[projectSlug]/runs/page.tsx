import type { RunReportItem, RunReportTotals } from '@components/runs/ProjectRunsReportView';
import { ProjectRunsReportSkeleton, ProjectRunsReportView } from '@components/runs/ProjectRunsReportView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { encodeRunCursor } from '@lib/runs/history-validation';
import { REPORT_PAGE_SIZE } from '@lib/runs/report-constants';
import { reportProjectRuns } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

// BK-38 — the project-wide Run Report (`/projects/[projectSlug]/runs`). The
// first page is read HERE, server-side, so the table paints complete instead
// of waterfalling a client fetch after hydration; `ProjectRunsReportView`
// owns every later query (a filter change, "load older") through the API
// route. This route sits INSIDE the existing `[projectSlug]` layout — the
// layout's `ProjectShell` (sidebar/topbar/explorer) is already mounted, so
// this file renders ONLY the content slot, same as
// `tests/[testId]/runs/page.tsx` (BK-37) does for its own tab.
//
// One read, one rulebook: this calls the SAME SECURITY DEFINER RPC the
// headless route uses (`bunkai_report_project_runs` via the `reportProjectRuns`
// wrapper) rather than fetching the app's own API route from a server
// component.
export default async function ProjectRunsReportPage({ params }: PageProps) {
  const { projectSlug } = await params;

  return (
    <Suspense fallback={<ProjectRunsReportSkeleton />}>
      <ProjectRunsReportSection projectSlug={projectSlug} />
    </Suspense>
  );
}

interface RunReportPayload {
  items: RunReportItem[]
  totals: RunReportTotals
  next_cursor: { started_at: string, id: string } | null
}

const EMPTY_TOTALS: RunReportTotals = { passed: 0, failed: 0 };

// The first-page read, isolated in its own async component so it streams
// inside the `<Suspense>` boundary above (the `RunHistorySection` / BK-37
// precedent). Project resolution failures are a genuine 404 (the caller
// cannot see this Project at all); a failed REPORT read is caught and handed
// to the view as its error state instead — it must never throw up to the
// route's error boundary and take the whole project shell with it.
async function ProjectRunsReportSection({ projectSlug }: { projectSlug: string }) {
  const supabase = await createClient();

  // Resolve `projectId` the SAME way `ProjectLayout` does (BK-147): a Project
  // slug is unique only PER WORKSPACE, so the lookup is scoped to the
  // caller's active workspace via the same cookie the layout reads.
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

  // The filter `<select>`'s options — the SAME query `ProjectLayout` already
  // runs for the explorer tree. A small, cheap, redundant read is preferred
  // here over threading a new prop through the shared layout/shell for one
  // page's dropdown data (surgical-change rule — do not touch an unrelated
  // shared layout file for this).
  const { data: modulesData } = await supabase
    .from('modules')
    .select('id, name')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('position', { ascending: true });
  const modules = (modulesData ?? []).map(m => ({ id: m.id, name: m.name }));

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await reportProjectRuns(supabase, {
      actorUserId: user.id,
      projectId: project.id,
      limit: REPORT_PAGE_SIZE,
    });
    if (error) {
      throw error;
    }

    const payload = data as unknown as RunReportPayload;

    return (
      <ProjectRunsReportView
        projectId={project.id}
        modules={modules}
        initialPage={{
          items: payload.items ?? [],
          totals: payload.totals ?? EMPTY_TOTALS,
          // The RPC returns the raw keyset position; the client only ever
          // echoes the opaque wire token back, exactly as the API route emits it.
          next_cursor: payload.next_cursor === null
            ? null
            : encodeRunCursor({ startedAt: payload.next_cursor.started_at, id: payload.next_cursor.id }),
        }}
      />
    );
  }
  catch {
    return (
      <ProjectRunsReportView
        projectId={project.id}
        modules={modules}
        initialPage={{ items: [], totals: EMPTY_TOTALS, next_cursor: null }}
        initialError="Could not load the Run report."
      />
    );
  }
}
