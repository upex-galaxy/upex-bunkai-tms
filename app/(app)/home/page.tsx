import type { ReactNode } from 'react';
import {
  WelcomeBanner,
  WelcomeSummaryLine,
  WelcomeSummarySkeleton,
} from '@components/home/WelcomeBanner';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import {
  HOME_ACTIVITY_SCAN_LIMIT,
  HOME_ATC_CHANGE_ACTIONS,
  HOME_CHANGE_WINDOW_HOURS,
  HOME_TEST_CHANGE_ACTIONS,
} from '@lib/home/constants';
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

      {/* BK-256..BK-260 compose their widgets here, below the banner. */}
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
