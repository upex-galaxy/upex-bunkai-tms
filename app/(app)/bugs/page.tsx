import type { WorkspaceBugsPage } from '@lib/bugs/workspace-bugs-constants';
import { WorkspaceBugsSkeleton, WorkspaceBugsView } from '@components/bugs/WorkspaceBugsView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { listWorkspaceBugProjects, listWorkspaceBugs } from '@lib/bugs/workspace-bugs';
import { WORKSPACE_BUGS_ERROR_MESSAGE } from '@lib/bugs/workspace-bugs-view';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// BK-555 — the workspace-wide Bug Reports index (`/bugs`): every defect of
// every Project in the active workspace, most severe first, read-only, for
// every role. The first page is read here on the server through the SAME
// helper the API route uses, so the table paints complete;
// `WorkspaceBugsView` owns every later query.

const EMPTY_PAGE: WorkspaceBugsPage = {
  data: [],
  aggregates: {
    by_severity: { P1: 0, P2: 0, P3: 0, P4: 0 },
    by_status: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
  },
  next_cursor: null,
  workspace_bug_count: 0,
};

export default function WorkspaceBugsIndexPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-stroke-2 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Bug Reports</h1>
        <p className="text-sm text-fg-2">Every defect across the projects in this workspace.</p>
      </div>
      <Suspense fallback={<WorkspaceBugsSkeleton />}>
        <WorkspaceBugsSection />
      </Suspense>
    </div>
  );
}

// A failed read is handed to the view as its error state with Retry; it never
// throws to the route error boundary and takes the shell with it.
async function WorkspaceBugsSection() {
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
    return <WorkspaceBugsView workspaceId="" projects={[]} initialPage={EMPTY_PAGE} />;
  }

  const [result, projects] = await Promise.all([
    listWorkspaceBugs(supabase, { workspaceId }),
    listWorkspaceBugProjects(supabase, workspaceId),
  ]);

  // Keyed on the workspace: a switch remounts the view, so no row, option or
  // count of the previous workspace survives it (AC-20).
  return (
    <WorkspaceBugsView
      key={workspaceId}
      workspaceId={workspaceId}
      projects={projects ?? []}
      initialPage={result.ok ? result.page : EMPTY_PAGE}
      initialError={result.ok && projects !== null ? null : WORKSPACE_BUGS_ERROR_MESSAGE}
    />
  );
}
