import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOME_ACTIVE_RUNS_LIMIT } from '@lib/home/constants';
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
// COST SHAPE — bounded by the page, not by the workspace
// -----------------------------------------------------
// One count, one page read, one project lookup, one actor resolve, and four
// exact `head: true` counts per LISTED run (total / pending / blocked / failed
// steps). Every step count is exact rather than derived from a capped scan: a
// row read of `run_steps` would silently truncate at PostgREST's max-rows ceiling
// on a long chain and understate a run's total, which is the one number a
// progress bar must never get wrong. Each count rides the `run_steps
// (run_atc_id)` index through an inner-joined embed, so no run_atc id list is
// ever assembled or put in a URL.
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
      // `updated_at` carries no progress signal for an in-flight run. For a run
      // that has not finished, when it started is the only honest recency.
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

  const [projects, actors, stepCounts] = await Promise.all([
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
    Promise.all(rows.map(async row => countSteps(db, row.id))),
  ]);

  if (projects.error !== null || actors.error !== null || stepCounts.includes(null)) {
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
  for (const [index, row] of rows.entries()) {
    const project = projectById.get(row.project_id);
    // A run whose project the caller cannot read is not this widget's to
    // render, and inventing a placeholder name would put an unclickable row on
    // the page. RLS makes this unreachable in practice; dropping it keeps the
    // widget honest if it ever is not.
    if (project === undefined) {
      continue;
    }

    const counts = stepCounts[index];
    if (counts === null) {
      return { ok: false };
    }

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
    });
  }

  return { ok: true, runs, activeCount: total.count ?? 0 };
}

interface StepCounts {
  total: number
  pending: number
  blocked: number
  failed: number
}

// `run_steps` carries no `run_id` — it hangs off `run_atcs`. Counting through an
// INNER-joined embed (`run_atcs!inner(run_id)`) lets Postgres do the join, so no
// list of run_atc ids is ever materialized, batched, or pushed into a request
// URL. `head: true` means only the count crosses the wire.
async function countSteps(
  db: SupabaseClient<Database>,
  runId: string,
): Promise<StepCounts | null> {
  const countBy = async (status: string | null) => {
    let query = db
      .from('run_steps')
      .select('id, run_atcs!inner(run_id)', { count: 'exact', head: true })
      .eq('run_atcs.run_id', runId);
    if (status !== null) {
      query = query.eq('status', status);
    }
    return query;
  };

  const [total, pending, blocked, failed] = await Promise.all([
    countBy(null),
    countBy('pending'),
    countBy('blocked'),
    countBy('failed'),
  ]);

  if (
    total.error !== null
    || pending.error !== null
    || blocked.error !== null
    || failed.error !== null
  ) {
    return null;
  }

  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    blocked: blocked.count ?? 0,
    failed: failed.count ?? 0,
  };
}

// Same neutral fallback `/activity` uses for an unresolvable actor (BK-49's
// `resolveActorLabel`): never a raw uuid, never a blank cell.
function resolveExecutorLabel(email: string | null): string {
  return email ?? UNRESOLVED_EXECUTOR;
}
