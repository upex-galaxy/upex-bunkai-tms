import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOME_COVERAGE_PROJECT_CONCURRENCY } from '@lib/home/constants';
import { reportProjectCoverage } from '@lib/supabase/rpc';

// BK-259 — the workspace-level rollup behind Home's "Coverage" stat card: how
// much of the workspace's acceptance criteria actually has test coverage, and
// how the shortfall splits between "bound but never executed" and "nothing
// bound at all".
//
// Shared deliberately by BOTH `/api/v1/workspaces/{id}/coverage` and the Home
// server component, so the card and the endpoint can never disagree about a
// number — the contract `lib/home/recent-projects.ts` (BK-257) established and
// `active-runs.ts` (BK-256) / `open-bugs.ts` (BK-258) repeated.
//
// WHERE "COVERED" IS DEFINED — NOT HERE
// -------------------------------------
// This module computes NO coverage state of its own. Every per-AC verdict comes
// from `bunkai_report_project_coverage` (0048, corrected by 0050), the SAME
// SECURITY DEFINER RPC that backs `/api/v1/projects/{id}/coverage` and the
// project Metrics screen (BK-46). That RPC owns the three-way state — uncovered
// (zero linked non-archived ATCs) / not_run (>=1 linked ATC, at least one whose
// most recent `run_atcs` row is still `pending`) / executed — together with the
// PO's Q1/Q2/Q3 rulings behind it and every archived-entity exclusion.
//
// Re-deriving those rules in TypeScript would have produced a second, subtly
// different definition of "covered", and two coverage percentages that disagree
// about the same product is worse than one: a lead who reads 78% on Home and
// 71% on the project's Metrics screen has no way to tell which is the bug. So
// this module only ever ADDS UP what that RPC already decided.
//
// THE ROLL-UP RULE — AC-WEIGHTED, NOT A MEAN OF PROJECT PERCENTAGES
// -----------------------------------------------------------------
// The workspace figure is the union of every project's acceptance criteria,
// counted once each:
//
//     ac_coverage % = sum(ac_bound over projects) / sum(ac_total over projects)
//
// NOT `avg(project coverage %)`. Averaging the percentages weights a project
// with 3 acceptance criteria exactly like one with 300, so a single tiny,
// fully-covered side project can lift the workspace headline by twenty points
// while the flagship product is untested. The AC-weighted union says what a
// lead actually means by "our coverage": pick an acceptance criterion at random
// from this workspace, this is the chance it has a test bound to it. The rule is
// published in the endpoint's OpenAPI description too, so an API caller reads it
// rather than guessing it from a number.
//
// WHICH PERCENTAGE IS THE HEADLINE
// --------------------------------
// `ac_bound / ac_total` — the same quantity the project Metrics screen prints
// as its FIRST KPI tile, "AC coverage" (`ProjectCoverageView`, via
// `percentLabel(kpis.ac_bound, kpis.ac_total)`). Home showing the OTHER tile
// (executed coverage) as its single headline would put two different
// definitions of the word "coverage" on two screens of one product, which is
// exactly the confusion the reuse above exists to prevent.
//
// That choice makes the headline "has a test case", not "has been verified", so
// the card must not stop there — and does not. §4.7 of the master design plan
// draws a line this widget is required to keep: "never run" (ATCs bound, zero
// executions) has to read differently from "no coverage" (nothing bound at
// all). Both counts ship alongside the headline, in the card and on the wire,
// so a workspace whose ACs are all bound and none ever executed reads as 100%
// bound / 0 executed rather than as a clean bill of health.
//
// DERIVED, NOT SEPARATELY COUNTED
// -------------------------------
// `acNotRun` and `acUncovered` are arithmetic on the three figures the RPC
// returns (`ac_bound - ac_executed`, `ac_total - ac_bound`), not extra reads.
// The RPC's own per-AC state is a three-way partition of `ac_total`, so the
// three shares are exhaustive by construction and always add back up to the
// total the headline is a percentage of — the card can never print a breakdown
// its own headline contradicts.
//
// COST SHAPE — read this before adding anything to Home
// ----------------------------------------------------
// One RPC call per project in the workspace, issued at most
// `HOME_COVERAGE_PROJECT_CONCURRENCY` at a time. This is the honest price of
// reusing the shipped per-project computation instead of writing a second one:
// a workspace-wide coverage figure has to visit every acceptance criterion in
// the workspace, and the RPC is the only thing entitled to decide what each
// one's state is.
//
// Two consequences worth naming rather than discovering later:
//   * The per-project payload carries `modules` and `no_coverage` arrays this
//     rollup discards — it needs the `kpis` object only. Nothing on this page
//     renders per-AC gaps; the project Metrics screen owns that.
//   * `bunkai_report_project_coverage`'s `atc_real_status` CTE (0050) is not
//     project-scoped, so each call costs one pass over `run_atcs`. That cost is
//     the existing RPC's, not this rollup's, and it is not fixable from here —
//     narrowing it means redefining a shipped, in-QA function. Flagged so the
//     next person to touch Home coverage knows the ceiling is per-project call
//     count, and that the fix lives in the RPC.
// No index is added for this story: this module issues no ordering, no
// filtering and no scan of its own beyond the workspace's project list, which
// `lib/home/recent-projects.ts` already reads the same way.
//
// RLS + non-disclosure: the project list is read through the CALLER's own
// client, so `projects_select_workspace_member` (0002) scopes it — a forged
// `bk_active_ws` cookie pointing at someone else's workspace yields zero
// projects, therefore zero acceptance criteria, therefore the same answer an
// empty workspace gets, never a leak. Each RPC call then re-checks the actor's
// active membership on that project's workspace on its own account
// (`bunkai_assert_actor_can_read_workspace`), so the isolation does not depend
// on this module getting the project list right.

export interface WorkspaceCoverageRollup {
  // Every non-archived acceptance criterion under a non-archived user story in
  // a non-archived module, across every project in the workspace.
  acTotal: number
  // ...of which have at least one non-archived ATC linked (run or not).
  acBound: number
  // ...of which have at least one linked ATC AND no linked ATC still awaiting
  // its first execution.
  acExecuted: number
  // Bound but not yet verified. Derived: `acBound - acExecuted`.
  acNotRun: number
  // Nothing bound at all. Derived: `acTotal - acBound`.
  acUncovered: number
  modulesTotal: number
  modulesFullyCovered: number
  // How many projects were rolled up. Zero for a workspace with no projects —
  // and for a workspace the caller cannot read (see the non-disclosure note).
  projectCount: number
}

// A read that FAILED is `ok: false`, never a zeroed rollup. Printing "0%
// coverage" to a lead whose workspace is well covered — or, worse, "100%" off a
// partial read — is the exact false reading this card exists to prevent, and it
// is the same line every other Home widget draws.
export type WorkspaceCoverageResult
  = { ok: true } & WorkspaceCoverageRollup
    | { ok: false };

interface SummarizeWorkspaceCoverageParams {
  workspaceId: string
  // The RPC takes an explicit actor (0048's contract) and binds it against
  // `auth.uid()`, so the caller has to say who it is asking as.
  actorUserId: string
}

// The one numeric rule behind every coverage percentage this story prints or
// publishes: whole percent, half-up, and `null` — never `0`, never `NaN` — when
// there is nothing to measure. `percentLabel` (lib/coverage/coverage-view.ts)
// is its display twin on the project Metrics screen and rounds identically, so
// the same workspace cannot round to 78% on one screen and 77% on the other.
export function coveragePercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 100);
}

// The `kpis` object of `bunkai_report_project_coverage`'s payload. Declared
// locally and validated below rather than cast: the RPC returns `jsonb`, and a
// shape that does not parse must fail the rollup instead of contributing a
// silent zero to a percentage.
interface ProjectCoverageKpis {
  acTotal: number
  acBound: number
  acExecuted: number
  modulesTotal: number
  modulesFullyCovered: number
}

const EMPTY_ROLLUP: Omit<WorkspaceCoverageRollup, 'projectCount'> = {
  acTotal: 0,
  acBound: 0,
  acExecuted: 0,
  acNotRun: 0,
  acUncovered: 0,
  modulesTotal: 0,
  modulesFullyCovered: 0,
};

export async function summarizeWorkspaceCoverage(
  db: SupabaseClient<Database>,
  params: SummarizeWorkspaceCoverageParams,
): Promise<WorkspaceCoverageResult> {
  const { data: projects, error: projectsError } = await db
    .from('projects')
    .select('id')
    .eq('workspace_id', params.workspaceId);

  if (projectsError !== null) {
    return { ok: false };
  }

  const projectIds = (projects ?? []).map(project => project.id);
  if (projectIds.length === 0) {
    return { ok: true, ...EMPTY_ROLLUP, projectCount: 0 };
  }

  const perProject = await mapWithConcurrency(
    projectIds,
    HOME_COVERAGE_PROJECT_CONCURRENCY,
    async (projectId) => {
      const { data, error } = await reportProjectCoverage(db, {
        actorUserId: params.actorUserId,
        projectId,
      });
      if (error !== null) {
        return null;
      }
      return parseKpis(data);
    },
  );

  // One unreadable project fails the whole card. Summing the rest would print a
  // percentage over a denominator that silently excludes a project's entire
  // acceptance criteria — a confident figure about a workspace the reader
  // cannot see all of, which is worse than an honest error state.
  if (perProject.includes(null)) {
    return { ok: false };
  }

  const totals = { ...EMPTY_ROLLUP };
  for (const kpis of perProject) {
    if (kpis === null) {
      continue;
    }
    totals.acTotal += kpis.acTotal;
    totals.acBound += kpis.acBound;
    totals.acExecuted += kpis.acExecuted;
    totals.modulesTotal += kpis.modulesTotal;
    totals.modulesFullyCovered += kpis.modulesFullyCovered;
  }

  return {
    ok: true,
    ...totals,
    acNotRun: totals.acBound - totals.acExecuted,
    acUncovered: totals.acTotal - totals.acBound,
    projectCount: projectIds.length,
  };
}

// A missing key, a non-number, or a negative one is a broken read, not a zero.
function parseKpis(payload: unknown): ProjectCoverageKpis | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const kpis = (payload as { kpis?: unknown }).kpis;
  if (typeof kpis !== 'object' || kpis === null) {
    return null;
  }
  const record = kpis as Record<string, unknown>;

  const acTotal = readCount(record.ac_total);
  const acBound = readCount(record.ac_bound);
  const acExecuted = readCount(record.ac_executed);
  const modulesTotal = readCount(record.modules_total);
  const modulesFullyCovered = readCount(record.modules_fully_covered);

  if (
    acTotal === null || acBound === null || acExecuted === null
    || modulesTotal === null || modulesFullyCovered === null
  ) {
    return null;
  }

  // The RPC's three per-AC states partition `ac_total`, so these inequalities
  // hold for every payload it can legitimately produce. A payload that breaks
  // them would make `acNotRun` or `acUncovered` negative — better to fail the
  // card than to render a breakdown that cannot be true.
  if (acExecuted > acBound || acBound > acTotal || modulesFullyCovered > modulesTotal) {
    return null;
  }

  return { acTotal, acBound, acExecuted, modulesTotal, modulesFullyCovered };
}

function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

// A fixed-size worker pool. `Promise.all` over every project at once would fire
// one heavyweight coverage RPC per project simultaneously from the app's
// LANDING page — the shape most likely to turn one member's sign-in into a
// connection-pool spike for everyone else's. Results keep input order; each
// worker claims the next index, so a slow project delays only itself.
async function mapWithConcurrency<In, Out>(
  items: readonly In[],
  concurrency: number,
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results = Array.from<Out>({ length: items.length });
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  };

  const workers: Promise<void>[] = [];
  for (let started = 0; started < Math.min(concurrency, items.length); started += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
