import {
  WelcomeBanner,
  WelcomeSummaryLine,
  WelcomeSummarySkeleton,
} from '@components/home/WelcomeBanner';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { HOME_ATC_CHANGE_ACTIONS, HOME_TEST_CHANGE_ACTIONS } from '@lib/home/constants';
import { buildWelcomeSummary, resolveDisplayName } from '@lib/home/welcome-summary';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

const UNAVAILABLE_COPY = 'What changed since you were last here could not be loaded just now.';

// BK-255 — the Home dashboard (master-design-plan §4.2, `home.jsx`). This
// story ships the route plus its welcome banner ONLY; the stat cards, recent
// projects, activity feed and active-runs table are BK-256..BK-260 and land in
// the composable column below, under the banner.
//
// `app/page.tsx` now sends every signed-in member here instead of to
// /projects, so this route inherits that entry point's obligations: it repeats
// the same auth check and the same no-workspace redirect the projects index
// runs, rather than assuming a caller has already been filtered. The (app)
// layout above renders the shell but guards nothing.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/home');
  }

  // Same cookie-honouring resolution the shell layout and the projects index
  // already run, so the banner can never name a different workspace than the
  // sidebar switcher is showing.
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true });
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

  // `last_sign_in_at` comes back on the session user itself — no admin lookup
  // needed here, unlike Settings > Account (BK-87), which reaches for the
  // admin client because it also wants auth.users' canonical email. This is
  // the same field that page already labels "Last active", so Home and
  // Settings answer "when were you last active" identically.
  const lastActiveAt = user.last_sign_in_at ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-7 pb-10 pt-6">
          <WelcomeBanner
            displayName={resolveDisplayName({ metadata: user.user_metadata, email: user.email })}
            workspaceName={activeWorkspace?.name ?? null}
          >
            <Suspense fallback={<WelcomeSummarySkeleton />}>
              <WelcomeSummary workspaceId={activeWorkspaceId} lastActiveAt={lastActiveAt} />
            </Suspense>
          </WelcomeBanner>

          {/* BK-256..BK-260 compose their widgets here, below the banner. */}
        </div>
      </div>
    </div>
  );
}

// The "what changed since you were last here" line (AC2, AC3), isolated in its
// own async component so it streams inside the page's <Suspense> boundary and
// three counting queries can never delay — or, on failure, blank — the
// greeting that AC1 requires.
async function WelcomeSummary({
  workspaceId,
  lastActiveAt,
}: {
  workspaceId: string
  lastActiveAt: string | null
}) {
  try {
    const supabase = await createClient();

    // All three reads are RLS-scoped to the caller: activity_log's
    // `activity_log_select_workspace_member` and runs'
    // `runs_select_workspace_member` (0009 / 0031) narrow them to workspaces
    // the caller belongs to, so a forged cookie pointing at someone else's
    // workspace counts zero rows rather than leaking a number.
    //
    // `head: true` — only the count is wanted; no row payload crosses the
    // wire. Independent of each other, so they run concurrently.
    const [atcs, tests, runs] = await Promise.all([
      lastActiveAt === null
        ? Promise.resolve({ count: 0, error: null })
        : supabase
            .from('activity_log')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .in('action', [...HOME_ATC_CHANGE_ACTIONS])
            .gt('created_at', lastActiveAt),
      lastActiveAt === null
        ? Promise.resolve({ count: 0, error: null })
        : supabase
            .from('activity_log')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .in('action', [...HOME_TEST_CHANGE_ACTIONS])
            .gt('created_at', lastActiveAt),
      supabase
        .from('runs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'running'),
    ]);

    // A failed read is NOT a quiet workspace — collapsing the two would have
    // the banner assert "nothing new to review" to a member whose team shipped
    // all week. Same line `/projects` (BK-266) and `/activity` (BK-49) draw.
    if (atcs.error !== null || tests.error !== null || runs.error !== null) {
      return <WelcomeSummaryLine>{UNAVAILABLE_COPY}</WelcomeSummaryLine>;
    }

    return (
      <WelcomeSummaryLine>
        {buildWelcomeSummary({
          atcChanges: atcs.count ?? 0,
          testChanges: tests.count ?? 0,
          activeRuns: runs.count ?? 0,
          hasBaseline: lastActiveAt !== null,
        })}
      </WelcomeSummaryLine>
    );
  }
  catch {
    return <WelcomeSummaryLine>{UNAVAILABLE_COPY}</WelcomeSummaryLine>;
  }
}
