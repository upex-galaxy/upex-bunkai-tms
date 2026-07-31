import type { ActivityPage } from '@components/activity/ActivityView';
import { fetchActivityPage } from '@app/api/v1/activity/response';
import { ActivitySkeleton, ActivityView } from '@components/activity/ActivityView';
import { ACTIVITY_PAGE_SIZE } from '@lib/activity/constants';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

// BK-49 — the workspace Activity feed (`/activity`, §5 D15 — a standalone
// route, not Home; ratified 2026-07-31, see master-design-plan.md §4.16).
// The first page is read HERE, server-side, so the table paints complete
// instead of waterfalling a client fetch after hydration; `ActivityView` owns
// every later query (load older, retry) through the API route — mirrors
// `runs/page.tsx` (BK-37) and `projects/[projectSlug]/runs/page.tsx` (BK-38).
export default function ActivityPageRoute() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-stroke-2 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Activity</h1>
        <p className="text-sm text-fg-2">Recent activity across this workspace, newest first.</p>
      </div>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivitySection />
      </Suspense>
    </div>
  );
}

const EMPTY_PAGE: ActivityPage = { items: [], next_cursor: null };

// The first-page read, isolated in its own async component so it streams
// inside the `<Suspense>` boundary above (the `RunHistorySection` / BK-37
// precedent). A failure is caught here and handed to the view as its error
// state — it must never throw up to the route's error boundary and take the
// whole app shell with it.
//
// Reuses `fetchActivityPage` from the API route's own `response.ts`
// (`app/api/v1/activity/response.ts`) rather than re-deriving the
// actor-batch-resolution + per-action label projection independently, unlike
// the RunHistory/ProjectRunsReport precedents (whose pages duplicate a
// TRIVIAL near-1:1 row mapping on purpose, so the route stays its own
// separately-contracted surface). Activity's mapping is not trivial — it
// makes a SECOND RPC call to batch-resolve actor emails and derives an
// item label per action (implementation-plan.md § "ActivityItemSchema") — so
// a hand-duplicated second copy is a real drift risk (Risk R1) for zero
// benefit: `fetchActivityPage` has no Next.js-request coupling, takes the
// same RLS-scoped `db` client this page already holds, and is exactly the
// pure, already-tested function Slice 2 isolated for this. Workspace-id
// resolution below is NOT reused from `response.ts` — that part IS trivial
// and stays independently derived, matching every other page in this app.
async function ActivitySection() {
  try {
    const supabase = await createClient();

    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    const cookieStore = await cookies();
    const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));

    // No active workspace (a brand-new account with none yet) is not a read
    // failure — the honest answer is the same empty state a genuinely-quiet
    // workspace would show (AC3 3.1), not an error block.
    if (activeWorkspaceId === null) {
      return <ActivityView initialPage={EMPTY_PAGE} />;
    }

    const page = await fetchActivityPage(supabase, {
      workspaceId: activeWorkspaceId,
      limit: ACTIVITY_PAGE_SIZE,
      cursorCreatedAt: null,
      cursorId: null,
    });

    return <ActivityView initialPage={page} />;
  }
  catch {
    return (
      <ActivityView
        initialPage={EMPTY_PAGE}
        initialError="Could not load the activity feed."
      />
    );
  }
}
