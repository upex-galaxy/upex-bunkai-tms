import type { WorkspaceRunsPage } from '@lib/runs/workspace-runs-constants';
import { WorkspaceRunsSkeleton, WorkspaceRunsView } from '@components/runs/WorkspaceRunsView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { listWorkspaceRunFilterOptions, listWorkspaceRuns } from '@lib/runs/workspace-runs';
import { WORKSPACE_RUNS_ERROR_MESSAGE } from '@lib/runs/workspace-runs-view';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// BK-513 — the workspace-wide Runs index (`/runs`): every Run of every Project
// in the active workspace, newest first, read-only. The first page is read
// here on the server through the SAME helper the API route uses, so the table
// paints complete; `WorkspaceRunsView` owns every later query.

const EMPTY_PAGE: WorkspaceRunsPage = { items: [], next_cursor: null, workspace_run_count: 0 };

export default function WorkspaceRunsIndexPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-stroke-2 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Test Runs</h1>
        <p className="text-sm text-fg-2">Every run across the projects in this workspace.</p>
      </div>
      <Suspense fallback={<WorkspaceRunsSkeleton />}>
        <WorkspaceRunsSection />
      </Suspense>
    </div>
  );
}

// A failed read is handed to the view as its error state with Retry; it never
// throws to the route error boundary and takes the shell with it.
async function WorkspaceRunsSection() {
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));

  // No workspace at all is the empty state, not an error.
  if (workspaceId === null) {
    return <WorkspaceRunsView workspaceId="" projects={[]} environments={[]} initialPage={EMPTY_PAGE} />;
  }

  const [result, options] = await Promise.all([
    listWorkspaceRuns(supabase, { workspaceId }),
    listWorkspaceRunFilterOptions(supabase, workspaceId),
  ]);

  return (
    <WorkspaceRunsView
      workspaceId={workspaceId}
      projects={options?.projects ?? []}
      environments={options?.environments ?? []}
      initialPage={result.ok ? result.page : EMPTY_PAGE}
      initialError={result.ok && options !== null ? null : WORKSPACE_RUNS_ERROR_MESSAGE}
    />
  );
}
