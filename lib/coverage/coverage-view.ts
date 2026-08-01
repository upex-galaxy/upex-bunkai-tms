// BK-46 — Project Coverage view-state logic: framework-agnostic, pure
// functions only. All I/O stays in the server page and the client component
// (Slice 4); this file is what makes the segment filter, the module status
// chip, and the "no coverage" panel's module-collapsing testable without a
// browser or a live DB. Mirrors `lib/runs/report-view.ts`'s split (BK-38).
//
// The segment filter's exact semantics are read off the shipped mockup's own
// JS (`metrics-dashboard.html`'s `applyFilter`), NOT re-derived from the RPC's
// per-module `status` field — the two are NOT the same partition. A module
// can match BOTH `gaps` and `notrun` simultaneously (e.g. a module with 2
// uncovered ACs AND 3 never-run-but-bound ACs counts under both segments),
// so segment membership is evaluated independently per segment, mirroring
// the mockup's `unc > 0` / `nr > 0 && bound > 0` checks exactly — it is NOT
// a switch over a single mutually-exclusive category.

export type CoverageSegment = 'all' | 'gaps' | 'notrun';

// The shape `bunkai_report_project_coverage` returns per module (Slice 1).
// Declared locally rather than imported from `lib/supabase/rpc.ts` — this
// slice has no dependency on Slice 1/3's exports (feature-branch-chain,
// parallel-safe slices), matching `lib/runs/report-view.ts`'s own precedent
// of declaring its filter shape locally rather than importing the RPC arg
// type.
export interface CoverageModule {
  module_id: string
  module_name: string
  ac_total: number
  ac_uncovered: number
  ac_not_run: number
  ac_executed: number
  // Raw DB-level classification (Q1/Q2/Q3 collapsed) — 'no_acs' is not shown
  // in the mockup (every mockup row has real ACs) but is a real ATP Group 5
  // case (a module with zero User Stories/ACs), handled distinctly below.
  status: 'uncovered' | 'not_run' | 'fully_covered' | 'no_acs'
}

export interface CoverageNoCoverageItem {
  ac_id: string
  ac_title: string
  user_story_id: string
  user_story_title: string
  module_id: string
  module_name: string
}

// ac_bound = ACs with at least one linked (non-archived) ATC, run or not —
// the RPC does not return this directly, only its two components.
export function moduleBoundCount(mod: CoverageModule): number {
  return mod.ac_not_run + mod.ac_executed;
}

// Mirrors metrics-dashboard.html's `applyFilter` exactly: `unc = ac_uncovered`,
// `nr = ac_not_run`, `bound = moduleBoundCount(mod)`.
export function matchesSegment(mod: CoverageModule, segment: CoverageSegment): boolean {
  if (segment === 'all') { return true; }
  if (segment === 'gaps') { return mod.ac_uncovered > 0; }
  return mod.ac_not_run > 0 && moduleBoundCount(mod) > 0;
}

export function filterModulesBySegment(modules: readonly CoverageModule[], segment: CoverageSegment): CoverageModule[] {
  return modules.filter(m => matchesSegment(m, segment));
}

// The three segment counts shown on the filter buttons (`All 8`, `Coverage
// gaps 4`, `Never run 5`) — always computed over the FULL unfiltered set, so
// switching segments never changes the OTHER buttons' own counts (mirrors
// the mockup's simultaneous static counts).
export interface CoverageSegmentCounts {
  all: number
  gaps: number
  notrun: number
}

export function segmentCounts(modules: readonly CoverageModule[]): CoverageSegmentCounts {
  return {
    all: modules.length,
    gaps: modules.filter(m => matchesSegment(m, 'gaps')).length,
    notrun: modules.filter(m => matchesSegment(m, 'notrun')).length,
  };
}

// The filter-meta line above the table: "N of M modules" (mirrors the
// mockup's `#filter-count` — `<mono>N of M</mono> modules`).
export function moduleFilterMetaText(visibleCount: number, totalCount: number): string {
  return `${visibleCount} of ${totalCount} modules`;
}

export type ModuleStatusChipTone = 'pass' | 'fail' | 'skipped' | 'neutral';

export interface ModuleStatusChip {
  label: string
  tone: ModuleStatusChipTone
}

// The module row's status chip — a FINER breakdown than the RPC's own
// `status` field, matching the mockup's five distinct chip copies exactly
// (metrics-dashboard.html rows MOD-001..MOD-008):
//   bound === 0                        -> "No coverage"        (fail)
//   ac_uncovered > 0 (bound > 0)       -> "{N} uncovered"       (fail)
//   ac_not_run === 0                   -> "Fully covered"       (pass)
//   ac_not_run === bound               -> "Bound, never run"    (skipped)
//   else                               -> "{N} never run"       (skipped)
// `no_acs` (zero User Stories/ACs, ATP Group 5 #1 — not in the mockup, which
// has no such row) gets its own distinct, neutral chip.
export function resolveModuleStatusChip(mod: CoverageModule): ModuleStatusChip {
  if (mod.status === 'no_acs') {
    return { label: 'No ACs yet', tone: 'neutral' };
  }
  const bound = moduleBoundCount(mod);
  if (bound === 0) {
    return { label: 'No coverage', tone: 'fail' };
  }
  if (mod.ac_uncovered > 0) {
    return { label: `${mod.ac_uncovered} uncovered`, tone: 'fail' };
  }
  if (mod.ac_not_run === 0) {
    return { label: 'Fully covered', tone: 'pass' };
  }
  if (mod.ac_not_run === bound) {
    return { label: 'Bound, never run', tone: 'skipped' };
  }
  return { label: `${mod.ac_not_run} never run`, tone: 'skipped' };
}

// The "Coverage" column's bar segments, as fractions of ac_total (0..1 each,
// summing to <=1). Mirrors the mockup's `b-exec`/`b-notrun` width percentages
// (the remainder, if any, is the implicit "unbound" portion — the mockup
// never draws a bar segment for it, just leaves it blank).
export interface CoverageBarFractions {
  executed: number
  notRun: number
}

export function coverageBarFractions(mod: CoverageModule): CoverageBarFractions {
  if (mod.ac_total === 0) {
    return { executed: 0, notRun: 0 };
  }
  return {
    executed: mod.ac_executed / mod.ac_total,
    notRun: mod.ac_not_run / mod.ac_total,
  };
}

// "12 / 16" style fraction (mockup's `.cov-frac`) — bound over total. A
// zero-total module (no_acs) renders "—" rather than "0 / 0".
export function coverageFractionLabel(mod: CoverageModule): string {
  if (mod.ac_total === 0) {
    return '—';
  }
  return `${moduleBoundCount(mod)} / ${mod.ac_total}`;
}

// The KPI-row percentages ("AC coverage %", "Executed coverage %"). A zero
// denominator renders "—", never "0%"/NaN (Technical Decision, Stage 1 plan).
export function percentLabel(numerator: number, denominator: number): string {
  if (denominator === 0) { return '—'; }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

// ---------------------------------------------------------------------------
// "No coverage" panel — collapses an ENTIRELY uncovered module (ac_uncovered
// === ac_total, ac_total > 0 — i.e. moduleBoundCount === 0) into ONE summary
// row ("MOD-005 · module — Entire module unbound · 8 ACs exposed", mirroring
// the mockup's first `<li>` exactly), while every uncovered AC belonging to
// a PARTIALLY-bound module gets its own individual row (the mockup's
// remaining `<li>`s). This is presentation-only grouping — the RPC's
// `no_coverage` array is already itemized per-AC; this function is the one
// piece of client-visible logic layered on top of it.

export type NoCoverageEntry
  = | { kind: 'module', moduleId: string, moduleName: string, acCount: number }
    | { kind: 'ac', acId: string, acTitle: string, userStoryId: string, userStoryTitle: string, moduleId: string, moduleName: string };

export function buildNoCoverageDisplayList(
  noCoverage: readonly CoverageNoCoverageItem[],
  modules: readonly CoverageModule[],
): NoCoverageEntry[] {
  const entirelyUncoveredModuleIds = new Set(
    modules.filter(m => m.ac_total > 0 && moduleBoundCount(m) === 0).map(m => m.module_id),
  );

  const seenCollapsedModule = new Set<string>();
  const entries: NoCoverageEntry[] = [];

  for (const item of noCoverage) {
    if (entirelyUncoveredModuleIds.has(item.module_id)) {
      if (seenCollapsedModule.has(item.module_id)) { continue; }
      seenCollapsedModule.add(item.module_id);
      const acCount = noCoverage.filter(nc => nc.module_id === item.module_id).length;
      entries.push({ kind: 'module', moduleId: item.module_id, moduleName: item.module_name, acCount });
      continue;
    }
    entries.push({
      kind: 'ac',
      acId: item.ac_id,
      acTitle: item.ac_title,
      userStoryId: item.user_story_id,
      userStoryTitle: item.user_story_title,
      moduleId: item.module_id,
      moduleName: item.module_name,
    });
  }
  return entries;
}

// The panel header chip ("17 ACs") and empty-state resolution — the panel
// itself is empty (ATP Group 1 #5 / "no coverage gaps" state) exactly when
// the RPC's `no_coverage` array is empty, independent of module count.
export function noCoverageTotalCount(noCoverage: readonly CoverageNoCoverageItem[]): number {
  return noCoverage.length;
}

export function hasNoCoverageGaps(noCoverage: readonly CoverageNoCoverageItem[]): boolean {
  return noCoverage.length > 0;
}

// ---------------------------------------------------------------------------
// Whole-project empty state (ATP Group 5 #2 — "project with no ACs").
export type CoverageEmptyState = 'has-data' | 'empty-no-acs';

export function resolveCoverageEmptyState(kpis: { ac_total: number }): CoverageEmptyState {
  return kpis.ac_total === 0 ? 'empty-no-acs' : 'has-data';
}

export const COVERAGE_EMPTY_NO_ACS_TITLE = 'No acceptance criteria yet';
export const COVERAGE_EMPTY_NO_ACS_DESCRIPTION
  = 'This project has no acceptance criteria authored yet. Coverage has nothing to measure until at least one exists.';
