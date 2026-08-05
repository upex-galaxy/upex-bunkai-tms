import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOME_ACTIVE_RUNS_LIMIT, HOME_ACTIVE_RUNS_STEP_SCAN_LIMIT } from '@lib/home/constants';
import { resolveActivityActors } from '@lib/supabase/rpc';

// BK-256 — the workspace-level rollup behind Home's "Active test runs" widget:
// every run currently in progress across every project in the workspace, each
// carrying the columns the story's AC names (run, project, execution mode,
// status, step-completion progress, executor), plus the exact workspace-wide
// count of them.
//
// Shared deliberately by BOTH `/api/v1/workspaces/{id}/active-runs` and the Home
// server component, so the widget and the endpoint can never disagree about a
// number — the same contract `lib/home/recent-projects.ts` (BK-257) established.
//
// WHAT "ACTIVE" MEANS, and why it is the same set the banner counts
// -----------------------------------------------------------------
// The story's Business Rule says a run is active while Running or Blocked, and
// that Finished and Aborted are excluded. `runs.status` (0031) is constrained to
// `running | passed | failed | aborted` — there is no `blocked` run status;
// `blocked` lives one level down, on `run_steps.status` / `run_atcs.status`.
//
// In this data model a blocked run has not terminated: it is still `running`.
// So "Running or Blocked, minus Finished and Aborted" resolves to exactly
// `status = 'running'` — the SAME predicate the welcome banner (BK-255) counts.
// The two numbers on this screen are therefore identical by construction, not by
// coincidence, which is the whole point: a dashboard whose banner and whose table
// disagree about what is running is worse than one that omits the table.
//
// The BR's second half still has to mean something on screen, and the user story
// asks to "spot stalled or blocked runs". So `state` is derived PER ROW: a run
// with at least one blocked step reads `blocked`, otherwise `running`. That is a
// presentation sub-state of one and the same active set — it changes no count.
//
// ORDERING — by last activity, which is NOT `runs.updated_at`
// -----------------------------------------------------------
// The widget exists to surface the run someone is working on and the one that
// has stalled, so "most recent" has to mean most recently WORKED ON, not most
// recently created. Two columns are wrong for that and one is right:
//
//   * `runs.updated_at` — dead for this purpose. `bunkai_mark_run_step` (0042)
//     takes a `for update` lock on the `runs` row but never UPDATEs it, so the
//     trigger does not fire and a three-hour execution reads as one timestamp.
//   * `runs.started_at` — real, but it is when the run BEGAN. Ordering by it
//     floats the run that has been stalled longest above the one being stepped
//     through right now, which inverts the widget's own purpose.
//   * `run_steps.executed_at` — the honest signal. 0042 writes `now()` into it
//     on EVERY mark, so the newest one across a run's steps is exactly when that
//     run was last touched. It is already in hand: the step scan below reads it
//     in the same request as the progress counts, at no extra cost.
//
// So rows are ORDERED HERE by `max(executed_at)`, falling back to `started_at`
// for a run whose first step has not been marked yet, and the first row is the
// resume target the story's AC3 asks for.
//
// One boundary, deliberate and disclosed: `started_at desc` still SELECTS the
// page (it is what the database can order cheaply, and 0060 indexes it), so the
// re-sort is within the page, not across the workspace. A run old enough to fall
// outside `limit` by start date is not pulled back in by recent step activity.
// The widget names that gap rather than hiding it — when the workspace-wide
// count exceeds the rows returned, the card says how many are not listed and
// points at the per-project run reports that hold them.
//
// COST SHAPE — bounded by the page, not by the workspace
// -----------------------------------------------------
// Five requests for a full page, regardless of how many runs it lists: one
// count, one page read, one project lookup, one actor resolve, and ONE grouped
// step scan covering every listed run at once. The page read rides
// `runs_workspace_id_started_at_running_idx` (0060), a partial index matching
// its predicate and ORDER BY exactly, so it is an index-ordered LIMIT rather
// than a top-N sort over the workspace's whole execution history.
//
// The step scan reads rows rather than issuing per-run `head: true` counts —
// four counts per listed run fanned out to 20 concurrent PostgREST requests on
// the app's landing page, which is not a cost this widget is worth. Reading rows
// reintroduces PostgREST's truncation risk, and a progress bar must never
// understate a total, so the scan asks for an exact `count` alongside the rows
// and REFUSES the whole rollup when the two disagree. Truncation therefore
// surfaces as "could not load active runs", never as a quietly wrong number.
// The scan rides the `run_steps (run_atc_id)` index through an inner-joined
// embed, so no run_atc id list is ever assembled or put in a URL.
//
// Every read runs through the caller's own client, so RLS does the isolation
// (`runs_select_workspace_member`, `run_steps_select_workspace_member` in 0031,
// `projects` in 0002): a forged workspace id yields zero rows rather than
// another tenant's runs.

export type ActiveRunState = 'running' | 'blocked';

export interface ActiveRun {
  id: string
  projectSlug: string
  projectName: string
  testTitle: string
  // 'human' | 'agent' | 'ci' — the run's execution mode (`runs.executor_mode`).
  executorMode: string
  // Who started it. An unresolvable executor (departed member, or a run started
  // by a machine principal) falls back to neutral copy, never a raw uuid.
  executorLabel: string
  // Derived, never read from a column — see the note above.
  state: ActiveRunState
  totalSteps: number
  doneSteps: number
  blockedSteps: number
  failedSteps: number
  startedAt: string
  // When this run was last worked on: the newest `run_steps.executed_at` among
  // its steps, falling back to `startedAt` for a run whose first step has not
  // been marked yet. This is what the list is ordered by — see the note on
  // `listActiveRuns`.
  lastActivityAt: string
}

// `runs: []` with `activeCount: 0` means the workspace genuinely has nothing
// running. A read that FAILED is `ok: false`, never an empty list — the caller
// has to tell a quiet workspace apart from a broken one, exactly as the Home
// banner, the recent-projects rollup and the projects index already do.
export type ActiveRunsResult
  = { ok: true, runs: ActiveRun[], activeCount: number }
    | { ok: false };

interface ListActiveRunsParams {
  workspaceId: string
  limit?: number
}

const UNRESOLVED_EXECUTOR = 'a workspace member';

interface StepRollup {
  total: number
  pending: number
  blocked: number
  failed: number
  lastExecutedAt: string | null
}

const EMPTY_STEP_ROLLUP: StepRollup = {
  total: 0,
  pending: 0,
  blocked: 0,
  failed: 0,
  lastExecutedAt: null,
};

export async function listActiveRuns(
  db: SupabaseClient<Database>,
  { workspaceId, limit = HOME_ACTIVE_RUNS_LIMIT }: ListActiveRunsParams,
): Promise<ActiveRunsResult> {
  // The header count is workspace-wide and exact — it must NOT be the length of
  // the page below it, or a workspace with eight running runs would announce
  // five. Same `head: true` count shape the welcome banner uses, against the
  // same predicate.
  const [total, page] = await Promise.all([
    db
      .from('runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'running'),
    db
      .from('runs')
      .select('id, project_id, executor_mode, executor_user_id, test_title, started_at')
      // `started_at` desc, NOT `updated_at`: marking a step does not write the
      // `runs` row (`bunkai_mark_run_step` locks it but never UPDATEs it), so
      // `updated_at` carries no progress signal for an in-flight run. This picks
      // WHICH runs the page holds; the rows are then re-sorted by real step
      // activity below — see the ORDERING note above. Matches the column order
      // of `runs_workspace_id_started_at_running_idx` (0060).
      .eq('workspace_id', workspaceId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
  ]);

  if (total.error !== null || page.error !== null) {
    return { ok: false };
  }

  const rows = page.data ?? [];
  if (rows.length === 0) {
    return { ok: true, runs: [], activeCount: total.count ?? 0 };
  }

  const projectIds = [...new Set(rows.map(row => row.project_id))];
  const executorIds = [...new Set(
    rows.map(row => row.executor_user_id).filter(id => id !== null),
  )];

  const [projects, actors, stepRollups] = await Promise.all([
    db.from('projects').select('id, slug, name').in('id', projectIds),
    // Reuses the EXISTING actor resolver rather than adding a second
    // SECURITY DEFINER function over `auth.users`. Its provenance guarantee
    // (0047: the caller must be a member, and only ids that actually appear as
    // an actor on THIS workspace's activity_log resolve) holds exactly here —
    // `bunkai_create_run` writes `executor_user_id = p_actor_user_id` and, in
    // the same transaction, a `run.started` activity row with
    // `actor_user_id = p_actor_user_id`. Skipped entirely when no listed run
    // has an executor.
    executorIds.length === 0
      ? Promise.resolve({ data: [] as { user_id: string, email: string | null }[], error: null })
      : resolveActivityActors(db, { workspaceId, userIds: executorIds }),
    readStepRollups(db, rows.map(row => row.id)),
  ]);

  if (projects.error !== null || actors.error !== null || stepRollups === null) {
    return { ok: false };
  }

  const projectById = new Map(
    (projects.data ?? []).map(project => [project.id, project]),
  );
  const emailByUserId = new Map(
    ((actors.data ?? []) as { user_id: string, email: string | null }[])
      .map(actor => [actor.user_id, actor.email]),
  );

  const runs: ActiveRun[] = [];
  for (const row of rows) {
    const project = projectById.get(row.project_id);
    // An unresolvable project fails the WHOLE widget rather than dropping the
    // row. Dropping it would leave the header counting a run the table does not
    // list — worst case a header reading "· 3" above "Nothing running right
    // now", which is the exact contradiction this widget exists to avoid. One
    // failed part fails the widget, the same line `listRecentProjects` draws for
    // a failed count. RLS makes this unreachable in practice (a caller who can
    // read the run can read its project); it is a guard, not a path.
    if (project === undefined) {
      return { ok: false };
    }

    // A run with no steps at all is a real state, not a failure — it reads as
    // 0/0 with no recorded activity, and falls back to its start time.
    const counts = stepRollups.get(row.id) ?? EMPTY_STEP_ROLLUP;

    runs.push({
      id: row.id,
      projectSlug: project.slug,
      projectName: project.name,
      testTitle: row.test_title,
      executorMode: row.executor_mode,
      executorLabel: resolveExecutorLabel(
        row.executor_user_id === null ? null : emailByUserId.get(row.executor_user_id) ?? null,
      ),
      state: counts.blocked > 0 ? 'blocked' : 'running',
      totalSteps: counts.total,
      doneSteps: counts.total - counts.pending,
      blockedSteps: counts.blocked,
      failedSteps: counts.failed,
      startedAt: row.started_at,
      lastActivityAt: counts.lastExecutedAt ?? row.started_at,
    });
  }

  // Newest activity first, id descending as the tie-break so the order is total
  // and stable across renders.
  //
  // Compared as strings, which is exact for these values and keeps the
  // microsecond precision `Date.parse` would round away: both `executed_at` and
  // `started_at` are timestamptz rendered by the same server in the same
  // fixed-width UTC form, and the optional fractional part sorts correctly
  // because '+' < '.' < any digit. That UTC assumption is not new here — every
  // timestamp this app displays already slices the ISO string on it.
  runs.sort((a, b) => {
    if (a.lastActivityAt !== b.lastActivityAt) {
      return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  });

  return { ok: true, runs, activeCount: total.count ?? 0 };
}

// The generated table types describe the embed's cardinality loosely, so the
// scan's rows are read through this shape. `run_steps.run_atc_id` is a NOT NULL
// FK, i.e. a to-one embed, but the array form is tolerated so a change in how
// the relationship is detected cannot silently mis-key the map.
interface StepScanRow {
  status: string
  executed_at: string | null
  run_atcs: { run_id: string } | { run_id: string }[] | null
}

// Every listed run's step progress AND its last-activity timestamp, in ONE
// request.
//
// `run_steps` carries no `run_id` — it hangs off `run_atcs` — so the scan filters
// through an INNER-joined embed (`run_atcs!inner(run_id)`). Postgres does the
// join, which means no list of run_atc ids is ever materialized, batched, or
// pushed into a request URL; only the handful of run ids goes over the wire.
//
// Rows, not counts, because `executed_at` is per row and the ordering signal
// needs it. That trades away the truncation immunity `head: true` counts had, so
// the truncation is DETECTED instead: `count: 'exact'` reports how many rows
// matched irrespective of the limit, and any disagreement with what came back
// fails the rollup. Postgres-side or PostgREST-side, a cut-off scan can never
// reach the caller as an understated total.
async function readStepRollups(
  db: SupabaseClient<Database>,
  runIds: string[],
): Promise<Map<string, StepRollup> | null> {
  const { data, count, error } = await db
    .from('run_steps')
    .select('status, executed_at, run_atcs!inner(run_id)', { count: 'exact' })
    .in('run_atcs.run_id', runIds)
    .limit(HOME_ACTIVE_RUNS_STEP_SCAN_LIMIT);

  if (error !== null) {
    return null;
  }

  const rows = (data ?? []) as unknown as StepScanRow[];
  // An unreported count is as untrustworthy as a short one — neither can be
  // reconciled against what arrived, so neither is rendered as a progress bar.
  if (count === null || count !== rows.length) {
    return null;
  }

  const byRunId = new Map<string, StepRollup>();
  for (const row of rows) {
    const embed = row.run_atcs;
    const runId = (Array.isArray(embed) ? embed[0]?.run_id : embed?.run_id) ?? null;
    if (runId === null) {
      continue;
    }

    const rollup = byRunId.get(runId) ?? { ...EMPTY_STEP_ROLLUP };
    rollup.total += 1;
    if (row.status === 'pending') {
      rollup.pending += 1;
    }
    else if (row.status === 'blocked') {
      rollup.blocked += 1;
    }
    else if (row.status === 'failed') {
      rollup.failed += 1;
    }
    if (
      row.executed_at !== null
      && (rollup.lastExecutedAt === null || row.executed_at > rollup.lastExecutedAt)
    ) {
      rollup.lastExecutedAt = row.executed_at;
    }
    byRunId.set(runId, rollup);
  }

  return byRunId;
}

// Same neutral fallback `/activity` uses for an unresolvable actor (BK-49's
// `resolveActorLabel`): never a raw uuid, never a blank cell.
function resolveExecutorLabel(email: string | null): string {
  return email ?? UNRESOLVED_EXECUTOR;
}
