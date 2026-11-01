import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clampedPercent } from '@lib/coverage/clamped-percent';
import { reportWorkspaceCoverage } from '@lib/supabase/rpc';

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
// from `bunkai_report_project_coverage` (0048, corrected by 0050 and 0090), the SAME
// SECURITY DEFINER RPC that backs `/api/v1/projects/{id}/coverage` and the
// project Metrics screen (BK-46). That RPC owns the three-way state — uncovered
// (zero linked non-archived ATCs) / not_run (>=1 linked ATC, at least one whose
// most recent `run_atcs` row is not `passed`/`failed`: pending, skipped or
// blocked, or no run at all — BK-1081) / executed — together with the
// PO's Q1/Q2/Q3 rulings behind it and every archived-entity exclusion.
//
// Re-deriving those rules in TypeScript would have produced a second, subtly
// different definition of "covered", and two coverage percentages that disagree
// about the same product is worse than one: a lead who reads 78% on Home and
// 71% on the project's Metrics screen has no way to tell which is the bug. So
// this module only ever ADDS UP what that RPC already decided. Since BK-1169
// the adding up happens inside Postgres: `bunkai_report_workspace_coverage`
// (0109) runs that RPC's own CTE chain over every project of the workspace in
// one statement and returns the summed kpis, equal by construction to the sum
// of the per-project calls (see the 0109 header).
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
// draws a line this widget is required to keep: coverage that is bound but not
// verified has to read differently from "no coverage" (nothing bound at all).
// Both counts ship alongside the headline, in the card and on the wire, so a
// workspace whose ACs are all bound and none executed reads as 100% bound / 0
// executed rather than as a clean bill of health.
//
// "EXECUTED" IS POINT-IN-TIME, NOT "HAS EVER BEEN RUN"
// ---------------------------------------------------
// Worth stating plainly, because the natural-language reading of these figures
// is wrong in a way that matters. `atc_real_status` (0050) resolves each ATC to
// the status of its MOST RECENT `run_atcs` row across any run — the PO's Q1
// framing, "current point-in-time value, not execution history" — and
// `bunkai_create_run` (0031) inserts every ATC into a new run as `pending`.
//
// So this is NOT a monotonic "has been run at least once" tally: an ATC
// executed every sprint for a year reverts to unrun the moment it is added to a
// fresh regression run, and `acExecuted` for the whole workspace can legitimately
// fall to zero on the morning QA opens a new run, with nothing deleted,
// unbound, or archived. That is the shipped, intended meaning of the project
// Metrics screen's own tiles — this rollup only adds them up — but it makes
// "never run" an actively false label for `acNotRun`, so neither the card nor
// the wire contract uses one. Both say AWAITING EXECUTION, which is what the
// number actually reports.
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
// ONE RPC call per render, whatever the number of projects (BK-1169). BK-259
// first shipped this as one `bunkai_report_project_coverage` call per project,
// at most four at a time, behind a 60-project ceiling that failed to the error
// state. "QA Automation Workspace" grew to 1171 projects on staging, tripped
// that ceiling on every request (GET /api/v1/workspaces/{id}/coverage
// answered 500), and could not simply have the ceiling raised: each call paid
// its own pass over `run_atcs` (~200 ms), so a full sweep was about a minute.
// The workspace RPC computes `atc_real_status` once for the workspace (82 ms
// for those 1171 projects), so the ceiling, the worker pool and the
// stampede-damping memo that existed only to bound the per-project fan-out are
// gone with it.
//
// RLS + non-disclosure: the RPC binds the actor to `auth.uid()` and re-checks
// active membership of a live workspace
// (`bunkai_assert_actor_can_read_workspace`), raising the same P0002 for a
// missing, foreign, deleted or non-member workspace. That P0002 is answered
// below exactly as an empty workspace is (zero projects, zero acceptance
// criteria), so a forged `bk_active_ws` cookie or an arbitrary id on the API
// path learns nothing, as before.

export interface WorkspaceCoverageRollup {
  // Every non-archived acceptance criterion under a non-archived user story in
  // a non-archived module, across every project in the workspace.
  acTotal: number
  // ...of which have at least one non-archived ATC linked (run or not).
  acBound: number
  // ...of which have at least one linked ATC AND every linked ATC was
  // executed (`passed` or `failed`) in its MOST RECENT run; pending, skipped
  // and blocked do not count (BK-1081). Point-in-time, not cumulative — see the
  // "EXECUTED IS POINT-IN-TIME" note above before reading this as "has ever
  // been run".
  acExecuted: number
  // Bound, with at least one linked ATC awaiting execution in its most recent
  // run. Derived: `acBound - acExecuted`. NOT "never run" — an ATC that has
  // been executed many times lands here again as soon as a new run includes it.
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
// publishes, delegated to `clampedPercent` (lib/coverage/clamped-percent.ts):
// whole percent, half-up, clamped to [1, 99] unless the ratio is exactly 0 or
// exactly 1 (BK-881), and `null` — never `0`, never `NaN` — when there is
// nothing to measure. `percentLabel` (lib/coverage/coverage-view.ts) is its
// display twin on the project Metrics screen and uses the same helper, so the
// same workspace cannot round to 78% on one screen and 77% on the other.
export function coveragePercent(numerator: number, denominator: number): number | null {
  return clampedPercent(numerator, denominator);
}

// The `kpis` object of `bunkai_report_workspace_coverage`'s payload. Declared
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
  const { data, error } = await reportWorkspaceCoverage(db, {
    actorUserId: params.actorUserId,
    workspaceId: params.workspaceId,
  });

  // Non-disclosure: a workspace the caller cannot read answers like an empty
  // one. Any other error is a failed read, never a zeroed rollup.
  if (error !== null) {
    return error.code === 'P0002'
      ? { ok: true, ...EMPTY_ROLLUP, projectCount: 0 }
      : { ok: false };
  }

  const kpis = parseKpis(data);
  const projectCount = readCount((data as { project_count?: unknown } | null)?.project_count);
  if (kpis === null || projectCount === null) {
    return { ok: false };
  }

  return {
    ok: true,
    ...kpis,
    acNotRun: kpis.acBound - kpis.acExecuted,
    acUncovered: kpis.acTotal - kpis.acBound,
    projectCount,
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
