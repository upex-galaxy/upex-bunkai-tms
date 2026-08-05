import type { ReactNode } from 'react';
import { fetchActivityPage } from '@app/api/v1/activity/response';
import {
  ActiveRunsCard,
  ActiveRunsError,
  ActiveRunsSkeleton,
} from '@components/home/ActiveRuns';
import {
  CoverageSummaryCard,
  CoverageSummaryError,
  CoverageSummarySkeleton,
} from '@components/home/CoverageSummary';
import {
  OpenBugsCard,
  OpenBugsError,
  OpenBugsSkeleton,
} from '@components/home/OpenBugs';
import {
  RecentActivityCard,
  RecentActivityError,
  RecentActivitySkeleton,
} from '@components/home/RecentActivity';
import {
  RecentProjectsCard,
  RecentProjectsError,
  RecentProjectsSkeleton,
} from '@components/home/RecentProjects';
import {
  WelcomeBanner,
  WelcomeSummaryLine,
  WelcomeSummarySkeleton,
} from '@components/home/WelcomeBanner';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { listActiveRuns } from '@lib/home/active-runs';
import {
  HOME_ACTIVITY_FEED_LIMIT,
  HOME_ACTIVITY_SCAN_LIMIT,
  HOME_ATC_CHANGE_ACTIONS,
  HOME_CHANGE_WINDOW_HOURS,
  HOME_TEST_CHANGE_ACTIONS,
} from '@lib/home/constants';
import { summarizeWorkspaceCoverage } from '@lib/home/coverage';
import { countOpenBugs } from '@lib/home/open-bugs';
import { selectRecentActivity } from '@lib/home/recent-activity';
import { listRecentProjects } from '@lib/home/recent-projects';
import { buildWelcomeSummary, resolveDisplayName } from '@lib/home/welcome-summary';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

const SUMMARY_UNAVAILABLE_COPY = 'What changed recently could not be loaded just now.';
const WORKSPACE_UNAVAILABLE_COPY
  = 'This workspace could not be loaded just now. Reload the page to try again — nothing has been changed.';

// BK-255 — the Home dashboard (master-design-plan §4.2, `home.jsx`). This
// story ships the route plus its welcome banner ONLY; the stat cards, recent
// projects, activity feed and active-runs table are BK-256..BK-260 and land in
// the composable column below, under the banner.
//
// `app/page.tsx` now sends every signed-in member here instead of to
// /projects, so this route inherits that entry point's obligations: `/home` is
// registered in middleware.ts's PROTECTED_PREFIXES (the edge gate), and the
// getUser() check below repeats it as defense in depth, exactly as /projects
// and /settings do. The (app) layout above renders the shell but guards
// nothing.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/home');
  }

  const displayName = resolveDisplayName({ metadata: user.user_metadata, email: user.email });

  // Same cookie-honouring resolution the shell layout and the projects index
  // already run, so the banner can never name a different workspace than the
  // sidebar switcher is showing.
  const { data: workspaces, error: workspacesError } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true });

  // A failed read is NOT a member without a workspace. Collapsing the two
  // would send someone with a fully populated workspace to /onboarding to
  // "create your first workspace" — and, since /onboarding bounces an existing
  // member back to /projects, which re-runs this same failing read, straight
  // into a redirect ping-pong. `/projects` (BK-266) draws the same line.
  if (workspacesError !== null) {
    return (
      <HomeShell>
        <WelcomeBanner displayName={displayName} workspaceName={null}>
          <WelcomeSummaryLine>{WORKSPACE_UNAVAILABLE_COPY}</WelcomeSummaryLine>
        </WelcomeBanner>
      </HomeShell>
    );
  }

  const list = workspaces ?? [];

  // A member with no workspace at all belongs in onboarding, exactly as
  // /projects has always sent them — moving the landing route must not strand
  // them on an empty dashboard.
  if (list.length === 0) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId
    = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id)) ?? list[0].id;
  const activeWorkspace = list.find(w => w.id === activeWorkspaceId) ?? null;

  return (
    <HomeShell>
      <WelcomeBanner
        displayName={displayName}
        workspaceName={activeWorkspace?.name ?? null}
      >
        <Suspense fallback={<WelcomeSummarySkeleton />}>
          <WelcomeSummary workspaceId={activeWorkspaceId} />
        </Suspense>
      </WelcomeBanner>

      {/* The mockup's KPI row sits directly under the greeting: open bugs
          (BK-258) then coverage (BK-259), stacked rather than gridded — see
          each card's own note on why the 4-up grid was not built. */}
      <Suspense fallback={<OpenBugsSkeleton />}>
        <OpenBugs workspaceId={activeWorkspaceId} />
      </Suspense>

      <Suspense fallback={<CoverageSummarySkeleton />}>
        <CoverageSummary workspaceId={activeWorkspaceId} actorUserId={user.id} />
      </Suspense>

      <Suspense fallback={<ActiveRunsSkeleton />}>
        <ActiveRuns workspaceId={activeWorkspaceId} />
      </Suspense>

      <Suspense fallback={<RecentProjectsSkeleton />}>
        <RecentProjects workspaceId={activeWorkspaceId} />
      </Suspense>

      <Suspense fallback={<RecentActivitySkeleton />}>
        <RecentActivity workspaceId={activeWorkspaceId} />
      </Suspense>
    </HomeShell>
  );
}

// The page's scroll container and content column. Both render paths (resolved
// workspace, failed workspace read) use it, so the greeting sits in the same
// place whichever one runs.
function HomeShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-7 pb-10 pt-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// BK-256 — the "Active test runs" widget. Same shape as the two widgets around
// it: its own async component in its own <Suspense> boundary, so the handful of
// reads behind it cannot delay — or, on failure, blank — the banner above or the
// projects list below.
//
// The rollup lives in `lib/home/active-runs.ts` and is shared with
// GET /api/v1/workspaces/{id}/active-runs, so the widget and the endpoint cannot
// drift. Called directly rather than fetched over HTTP: same process, same
// RLS-scoped client, no extra round trip and no cookie forwarding.
async function ActiveRuns({ workspaceId }: { workspaceId: string }) {
  try {
    const supabase = await createClient();
    const result = await listActiveRuns(supabase, { workspaceId });
    // A failed read is NOT an idle workspace — see ActiveRunsError.
    if (!result.ok) {
      return <ActiveRunsError />;
    }
    return <ActiveRunsCard runs={result.runs} activeCount={result.activeCount} />;
  }
  catch {
    return <ActiveRunsError />;
  }
}

// BK-258 — the "Open bugs" stat card. Same shape as every other widget on this
// page: its own async component in its own <Suspense> boundary, so the four
// counts behind it cannot delay — or, on failure, blank — the banner above or
// the table below.
//
// The rollup lives in `lib/home/open-bugs.ts` and is shared with
// GET /api/v1/workspaces/{id}/open-bugs, so the card and the endpoint cannot
// drift. Called directly rather than fetched over HTTP: same process, same
// RLS-scoped client, no extra round trip and no cookie forwarding.
//
// RLS does the scoping: `bugs_select_workspace_member` (0046) narrows every
// count to workspaces the caller belongs to, so a forged `bk_active_ws` cookie
// pointing at someone else's workspace counts zero rather than leaking that
// workspace's defect posture.
async function OpenBugs({ workspaceId }: { workspaceId: string }) {
  try {
    const supabase = await createClient();
    const result = await countOpenBugs(supabase, { workspaceId });
    // A failed read is NOT a clean workspace — see OpenBugsError.
    if (!result.ok) {
      return <OpenBugsError />;
    }
    return <OpenBugsCard rollup={result} />;
  }
  catch {
    return <OpenBugsError />;
  }
}

// BK-259 — the "Coverage" stat card. Same shape as every other widget on this
// page: its own async component in its own <Suspense> boundary, so the
// per-project coverage reads behind it cannot delay — or, on failure, blank —
// the banner above or the table below. That boundary matters more here than
// anywhere else on the page: the open-bug counts above it are four `head`
// counts, while this one visits every acceptance criterion in the workspace.
//
// The rollup lives in `lib/home/coverage.ts` and is shared with
// GET /api/v1/workspaces/{id}/coverage, so the card and the endpoint cannot
// drift. That module does not define coverage itself — it sums
// `bunkai_report_project_coverage`, the same RPC the project Metrics screen
// (BK-46) reads, so Home and Metrics cannot report two different coverages for
// the same acceptance criteria.
//
// The actor id is passed down rather than re-read: the RPC takes an explicit
// actor and binds it against `auth.uid()` (0048), and this page has already
// resolved the session above.
//
// RLS does the scoping: the project list is read through the caller's own
// client (`projects_select_workspace_member`, 0002) and each RPC call re-checks
// the actor's active membership on its own account, so a forged `bk_active_ws`
// cookie pointing at someone else's workspace measures nothing rather than
// leaking that workspace's coverage posture.
async function CoverageSummary({ workspaceId, actorUserId }: { workspaceId: string, actorUserId: string }) {
  try {
    const supabase = await createClient();
    const result = await summarizeWorkspaceCoverage(supabase, { workspaceId, actorUserId });
    // A failed read is NOT an uncovered workspace — see CoverageSummaryError.
    if (!result.ok) {
      return <CoverageSummaryError />;
    }
    return <CoverageSummaryCard rollup={result} />;
  }
  catch {
    return <CoverageSummaryError />;
  }
}

// BK-257 — the "Recent projects" widget. Its own async component inside its own
// <Suspense> boundary, exactly as the welcome summary is: the rollup behind it
// issues several reads, and none of them may delay — or, on failure, blank —
// the banner above.
//
// The rollup itself lives in `lib/home/recent-projects.ts` and is shared with
// GET /api/v1/workspaces/{id}/recent-projects, so the widget and the endpoint
// cannot drift. Called directly rather than fetched over HTTP: same process,
// same RLS-scoped client, no extra round trip and no cookie forwarding.
async function RecentProjects({ workspaceId }: { workspaceId: string }) {
  try {
    const supabase = await createClient();
    const result = await listRecentProjects(supabase, { workspaceId });
    // A failed read is NOT an empty workspace — see RecentProjectsError.
    if (!result.ok) {
      return <RecentProjectsError />;
    }
    return <RecentProjectsCard projects={result.projects} />;
  }
  catch {
    return <RecentProjectsError />;
  }
}

// BK-260 — the condensed "Recent activity" feed. Its own async component in
// its own <Suspense> boundary, like every other widget on this page, so the
// feed read can neither delay nor blank the banner and lists above it.
//
// It reuses `fetchActivityPage` — the SAME function `/api/v1/activity` and
// `/activity` are both built on (BK-49) — rather than issuing its own query,
// so an event cannot read one way on Home and another on the full feed. This
// story therefore adds NO workspace-level endpoint: the numbers behind it are
// already verifiable by API through
// `GET /api/v1/activity?workspace_id={id}&limit={n}`. Called directly, not
// over HTTP: same process, same RLS-scoped client, no extra round trip and no
// cookie forwarding.
//
// RLS does the scoping, as it does for the route: `bunkai_list_activity`
// (migration 0045) is SECURITY INVOKER and runs under the caller's own role,
// so `activity_log_select_workspace_member` (0009) evaluates against THIS
// request's auth.uid() — a forged `bk_active_ws` cookie pointing at someone
// else's workspace returns zero rows, never a leak.
//
// The page asks for exactly `HOME_ACTIVITY_FEED_LIMIT` rows and then drops
// whatever falls outside the 24h window. That is exact rather than
// approximate: the feed is newest-first, so nothing inside the window can hide
// behind a row the window rejects — see `selectRecentActivity`.
async function RecentActivity({ workspaceId }: { workspaceId: string }) {
  try {
    const supabase = await createClient();
    const page = await fetchActivityPage(supabase, {
      workspaceId,
      limit: HOME_ACTIVITY_FEED_LIMIT,
      cursorCreatedAt: null,
      cursorId: null,
    });

    // One instant for the whole render, so every row's age is measured from
    // the same clock reading.
    const now = new Date();
    const items = selectRecentActivity({
      items: page.items,
      now,
      windowHours: HOME_CHANGE_WINDOW_HOURS,
      limit: HOME_ACTIVITY_FEED_LIMIT,
    });

    return <RecentActivityCard items={items} now={now} />;
  }
  catch {
    // A failed read is NOT a quiet workspace — see RecentActivityError.
    // `fetchActivityPage` signals RPC failure by throwing (ApiError), which is
    // the whole error surface here; there is no `{ ok: false }` to check.
    return <RecentActivityError />;
  }
}

// The "what changed recently" line (AC2, AC3), isolated in its own async
// component so it streams inside the page's <Suspense> boundary and the
// counting queries can never delay — or, on failure, blank — the greeting that
// AC1 requires.
async function WelcomeSummary({ workspaceId }: { workspaceId: string }) {
  try {
    const supabase = await createClient();

    const since = new Date(
      Date.now() - HOME_CHANGE_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Both reads are RLS-scoped to the caller: activity_log's
    // `activity_log_select_workspace_member` and runs'
    // `runs_select_workspace_member` (0009 / 0031) narrow them to workspaces
    // the caller belongs to, so a forged cookie pointing at someone else's
    // workspace counts zero rows rather than leaking a number.
    //
    // The activity read pulls rows rather than asking Postgres for a count,
    // because the figure the banner reports is DISTINCT entities, not events
    // (see the de-duplication below). ATC and Test actions come back in one
    // query and are partitioned here — same table, same window, no reason to
    // pay two round trips. Runs stays a `head: true` count: it is a plain row
    // count with nothing to de-duplicate.
    const [changes, runs] = await Promise.all([
      supabase
        .from('activity_log')
        .select('id, action, entity_id')
        .eq('workspace_id', workspaceId)
        .in('action', [...HOME_ATC_CHANGE_ACTIONS, ...HOME_TEST_CHANGE_ACTIONS])
        .gt('created_at', since)
        .limit(HOME_ACTIVITY_SCAN_LIMIT),
      supabase
        .from('runs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'running'),
    ]);

    // A failed read is NOT a quiet workspace — collapsing the two would have
    // the banner assert "nothing new to review" to a member whose team shipped
    // all week. Same line `/projects` (BK-266) and `/activity` (BK-49) draw.
    if (changes.error !== null || runs.error !== null) {
      return <WelcomeSummaryLine>{SUMMARY_UNAVAILABLE_COPY}</WelcomeSummaryLine>;
    }

    // One ATC saved three times is one changed ATC, so the number the member
    // reads is the size of the entity set, not the row count. `entity_id` is
    // nullable on the table; for every action listed here the emitting RPC
    // always sets it, and falling back to the row's own id keeps a
    // hypothetical null row counting as itself rather than collapsing with
    // another one.
    const atcIds = new Set<string>();
    const testIds = new Set<string>();
    for (const row of changes.data ?? []) {
      const key = row.entity_id ?? row.id;
      if ((HOME_ATC_CHANGE_ACTIONS as readonly string[]).includes(row.action)) {
        atcIds.add(key);
      }
      else if ((HOME_TEST_CHANGE_ACTIONS as readonly string[]).includes(row.action)) {
        testIds.add(key);
      }
    }

    return (
      <WelcomeSummaryLine>
        {buildWelcomeSummary({
          atcChanges: atcIds.size,
          testChanges: testIds.size,
          activeRuns: runs.count ?? 0,
        })}
      </WelcomeSummaryLine>
    );
  }
  catch {
    return <WelcomeSummaryLine>{SUMMARY_UNAVAILABLE_COPY}</WelcomeSummaryLine>;
  }
}
