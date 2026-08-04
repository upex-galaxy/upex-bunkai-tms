import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HOME_COVERAGE_CACHE_TTL_MS,
  HOME_COVERAGE_MAX_PROJECTS,
  HOME_COVERAGE_PROJECT_CONCURRENCY,
} from '@lib/home/constants';
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
// One RPC call per project in the workspace, issued at most
// `HOME_COVERAGE_PROJECT_CONCURRENCY` at a time. This is the honest price of
// reusing the shipped per-project computation instead of writing a second one:
// a workspace-wide coverage figure has to visit every acceptance criterion in
// the workspace, and the RPC is the only thing entitled to decide what each
// one's state is.
//
// Three consequences worth naming rather than discovering later:
//   * The per-project payload carries `modules` and `no_coverage` arrays this
//     rollup discards — it needs the `kpis` object only. Nothing on this page
//     renders per-AC gaps; the project Metrics screen owns that. It cannot be
//     trimmed from here either: PostgREST cannot project into a jsonb-returning
//     function, so the whole payload crosses the wire whatever we ask for.
//   * `bunkai_report_project_coverage`'s `atc_real_status` CTE (0050) is not
//     project-scoped, so each call costs one pass over `run_atcs`. That cost is
//     the existing RPC's, not this rollup's, and it is not fixable from here —
//     narrowing it means redefining a shipped, in-QA function.
//   * Therefore total work per uncached render grows with (projects × run
//     history), on the app's LANDING page, for every member on every sign-in.
//     Concurrency caps how much of that runs at once; it caps neither how often
//     it runs nor how large it can get. Two bounds below do:
//       - a short-TTL memo per workspace (`HOME_COVERAGE_CACHE_TTL_MS`), so
//         repeat loads and simultaneous members share one sweep;
//       - a hard project ceiling (`HOME_COVERAGE_MAX_PROJECTS`) that fails to
//         the card's error state rather than printing a partial percentage.
//     If a real workspace ever reaches that ceiling, the fix is NOT a bigger
//     number: it is a `bunkai_report_workspace_coverage` RPC that computes
//     `atc_real_status` ONCE for the workspace and returns just the kpi counts.
//     That would reuse this same CTE chain rather than re-derive it, so it does
//     not create the second definition of "covered" this module exists to
//     avoid — it extracts the existing one. Out of scope here (BK-259 ships no
//     schema change); flagged so the next person has the design, not a puzzle.
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
  // ...of which have at least one linked ATC AND no linked ATC whose MOST
  // RECENT run is still pending. Point-in-time, not cumulative — see the
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

  // THE CACHE GATE IS THIS LINE, NOT THE LOOKUP BELOW.
  //
  // The project list above is read through the CALLER's own RLS-scoped client
  // and is re-read on every request — it is never cached and never skipped.
  // That ordering is what keeps a shared cache safe: `projects_select_workspace_member`
  // (0002) returns rows only to members, so reaching this point at all proves
  // the caller belongs to this workspace. A non-member (or someone whose
  // membership was just revoked, or an API caller passing a workspace id that
  // is not theirs — the route takes an arbitrary id from the path) gets an
  // EMPTY list and returns above, without ever consulting or populating the
  // cache.
  //
  // Caching on workspace id ALONE, ahead of that read, would have been a
  // cross-tenant leak rather than an optimization: one member's sweep would
  // populate an entry that `GET /api/v1/workspaces/{id}/coverage` would then
  // serve to anybody who guessed the id, turning the endpoint's documented
  // non-disclosure answer into a real coverage posture. Every member who DOES
  // pass this gate sees the same workspace-level figures, so sharing the result
  // among them discloses nothing they could not read themselves.
  //
  // The key carries the project id set, so adding or removing a project
  // invalidates immediately instead of waiting out the TTL; only the coverage
  // WITHIN an unchanged set of projects is allowed to be up to
  // `HOME_COVERAGE_CACHE_TTL_MS` stale.
  const cacheKey = `${params.workspaceId}:${[...projectIds].sort().join(',')}`;
  const cached = readCachedRollup(cacheKey);
  if (cached !== null) {
    return { ok: true, ...cached };
  }

  // Refuse rather than approximate. A partial rollup would be a confident
  // percentage over a denominator missing whole projects — see
  // `HOME_COVERAGE_MAX_PROJECTS` for why that is worse than the error card.
  if (projectIds.length > HOME_COVERAGE_MAX_PROJECTS) {
    return { ok: false };
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

  const rollup: WorkspaceCoverageRollup = {
    ...totals,
    acNotRun: totals.acBound - totals.acExecuted,
    acUncovered: totals.acTotal - totals.acBound,
    projectCount: projectIds.length,
  };

  // Only a COMPLETE rollup is ever cached. Every failure path above returns
  // before here, so a transient RPC error cannot be pinned into the cache and
  // replayed at everyone for a minute.
  writeCachedRollup(cacheKey, rollup);

  return { ok: true, ...rollup };
}

// An in-process, per-instance TTL memo of completed rollups. Deliberately NOT
// Next's `unstable_cache`: that would have to close over the request-scoped
// Supabase client, whose session refresh can reach for cookies — a dynamic API
// that throws inside a cache scope — and this repo has no data-cache layer to
// follow the conventions of. A plain Map is something the next reader can hold
// entirely in their head, and it needs no framework guarantees to be correct.
//
// Being per-instance is a real limit, stated rather than glossed: a cold
// serverless instance always pays full price, and N instances mean up to N
// sweeps per TTL instead of one. It still removes the case that actually hurt —
// the same member reloading Home, and a team all landing on it at 9am, each
// paying a full per-project sweep of a workspace whose coverage has not moved.
// A shared cache (Redis, or the Data Cache once something else here needs one)
// is the upgrade path; it would not change any of the logic above.
const rollupCache = new Map<string, { expiresAt: number, value: WorkspaceCoverageRollup }>();

function readCachedRollup(key: string): WorkspaceCoverageRollup | null {
  const entry = rollupCache.get(key);
  if (entry === undefined) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    rollupCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCachedRollup(key: string, value: WorkspaceCoverageRollup): void {
  const now = Date.now();
  // Sweep on write. Without it the map would retain one entry per workspace
  // (and per project-set) for the life of the instance — a slow leak on a
  // long-lived server, since nothing else ever visits these keys again.
  for (const [existingKey, entry] of rollupCache) {
    if (entry.expiresAt <= now) {
      rollupCache.delete(existingKey);
    }
  }
  rollupCache.set(key, { expiresAt: now + HOME_COVERAGE_CACHE_TTL_MS, value });
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
