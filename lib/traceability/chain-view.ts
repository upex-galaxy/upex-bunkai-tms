// BK-45 — pure view-state logic for the US -> AC -> ATC -> Test -> Run ->
// Defect evidence chain. Framework-agnostic (no React, no Next) so it is
// testable without a browser or a live DB, mirroring `lib/coverage/coverage-view.ts`'s
// split (BK-46). All copy strings here are ratified VERBATIM on the ticket
// (comment 12171, AI Product Owner decisions on the AC-02/AC-03/AC-04/AC-07
// placeholders) — do not re-word them; anchor automated assertions on
// `data-testid` hooks, not on this prose, per the PO's own instruction.

// The shape `bunkai_report_story_traceability` returns (0068_story_traceability_report.sql).
export interface TraceabilityStory {
  id: string
  title: string
  status: 'draft' | 'ready_to_test'
  archived_at: string | null
}

export interface TraceabilityTest {
  id: string
  title: string
}

export type TraceabilityRunState = 'in_flight' | 'aborted' | 'passed' | 'failed' | 'blocked' | 'skipped';

export interface TraceabilityLatestRun {
  run_id: string
  run_status: 'running' | 'passed' | 'failed' | 'aborted'
  atc_status: 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped'
  started_at: string
  finished_at: string | null
  state: TraceabilityRunState
}

export interface TraceabilityDefect {
  id: string
  title: string
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  run_id: string | null
  run_step_id: string | null
}

// BK-48 — the Module this ATC belongs to (0069_story_traceability_module.sql).
// Always present: every ATC has a non-nullable module_id. `id` is the
// filterable identity; `name` is display-only. See the AI Tech Lead decision
// on the ticket for why this is `{id, name}` and not a `MOD-XXX` code — the
// real schema has no such code column.
export interface TraceabilityModule {
  id: string
  name: string
}

export interface TraceabilityAtc {
  id: string
  slug: string
  title: string
  layer: 'UI' | 'API' | 'Unit'
  module: TraceabilityModule
  test: TraceabilityTest | null
  latest_run: TraceabilityLatestRun | null
  defects: TraceabilityDefect[]
}

export interface TraceabilityCriterion {
  id: string
  title: string
  atcs: TraceabilityAtc[]
}

export interface StoryTraceabilityPayload {
  story: TraceabilityStory
  criteria: TraceabilityCriterion[]
}

// ---------------------------------------------------------------------------
// Story-level render state (AC-03, AC-07 — two DISTINCT empty states, ratified
// as never collapsing into one message).

export type StoryChainViewState = 'zero-ac' | 'zero-coverage' | 'has-chain';

export function resolveStoryChainViewState(payload: StoryTraceabilityPayload): StoryChainViewState {
  if (payload.criteria.length === 0) { return 'zero-ac'; }
  if (payload.criteria.every(c => c.atcs.length === 0)) { return 'zero-coverage'; }
  return 'has-chain';
}

export const ZERO_AC_TITLE = 'No acceptance criteria yet';
export const ZERO_AC_BODY = 'This story has no acceptance criteria defined, so there is nothing for the chain to trace. '
  + 'This is different from a coverage gap: criteria are authored first, in the story editor, and the chain builds from there.';

export const ZERO_COVERAGE_HEADING = 'No coverage anywhere on this story.';
export function zeroCoverageBody(acCount: number): string {
  return `${acCount} acceptance criteria exist, but none of them has an ATC bound. `
    + 'There is no chain to trace yet: every criterion below is an open verification gap.';
}

// ---------------------------------------------------------------------------
// Per-AC coverage (AC-04 — an AC with zero ATCs bound within an otherwise
// partially-covered story gets the SAME uncovered strip, never a broken row).

export function isAcUncovered(ac: TraceabilityCriterion): boolean {
  return ac.atcs.length === 0;
}

export const UNCOVERED_LABEL = 'Uncovered';
// Ratified verbatim (comment 12171 — "Full strip copy on the AC row"). Ship
// this exact string; anchor tests on the `uncovered-strip` hook instead.
export const UNCOVERED_WHY = '· 0 ATCs bound: no verification exists for this criterion. Bind an ATC in the Test Cases screen to start a chain.';

// ---------------------------------------------------------------------------
// Per-ATC row state (AC-02 — three layer-specific "no data yet" placeholders,
// visually distinct from the AC-level `uncovered-strip`. Ratified verbatim,
// comment 12171 "AC-02 placeholder" decision.)

export type AtcRowState = 'no-test' | 'no-run' | 'has-run';

export function resolveAtcRowState(atc: TraceabilityAtc): AtcRowState {
  if (!atc.test) { return 'no-test'; }
  if (!atc.latest_run) { return 'no-run'; }
  return 'has-run';
}

export const CHAIN_PLACEHOLDER_COPY = {
  noTestWrittenYet: 'No test written yet',
  awaitingTest: 'Awaiting test',
  noRunRecordedYet: 'No run recorded yet',
  awaitingFirstRun: 'Awaiting first run',
  noneLinked: 'None linked',
} as const;

// Test column copy for a given row state.
export function testCellCopy(state: AtcRowState): string | null {
  return state === 'no-test' ? CHAIN_PLACEHOLDER_COPY.noTestWrittenYet : null;
}

// Run column copy for a given row state (null when a real run chip renders).
export function runCellPlaceholder(state: AtcRowState): string | null {
  if (state === 'no-test') { return CHAIN_PLACEHOLDER_COPY.awaitingTest; }
  if (state === 'no-run') { return CHAIN_PLACEHOLDER_COPY.noRunRecordedYet; }
  return null;
}

// Defect column copy for a given row state + defect count (null when a real
// defect list renders).
export function defectCellPlaceholder(state: AtcRowState, defectCount: number): string | null {
  if (state === 'no-test') { return CHAIN_PLACEHOLDER_COPY.awaitingTest; }
  if (state === 'no-run') { return CHAIN_PLACEHOLDER_COPY.awaitingFirstRun; }
  if (defectCount === 0) { return CHAIN_PLACEHOLDER_COPY.noneLinked; }
  return null;
}

// ---------------------------------------------------------------------------
// Run-result chip tone (mirrors the mockup's `.chip[data-status]` grammar —
// `--running` for an in-flight run, never collapsed into `--skipped`).

export type RunChipTone = 'pass' | 'fail' | 'blocked' | 'skipped' | 'running' | 'aborted';

const RUN_STATE_TONE: Record<TraceabilityRunState, RunChipTone> = {
  in_flight: 'running',
  aborted: 'aborted',
  passed: 'pass',
  failed: 'fail',
  blocked: 'blocked',
  skipped: 'skipped',
};

const RUN_STATE_LABEL: Record<TraceabilityRunState, string> = {
  in_flight: 'Running',
  aborted: 'Aborted',
  passed: 'Pass',
  failed: 'Fail',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

export function runChipTone(run: TraceabilityLatestRun): RunChipTone {
  return RUN_STATE_TONE[run.state];
}

export function runChipLabel(run: TraceabilityLatestRun): string {
  return RUN_STATE_LABEL[run.state];
}

// ---------------------------------------------------------------------------
// Story rollup counts (story-head "N ACs · N ATCs · N tests · N runs · N
// defects", mirrors the mockup's `story-counts` line).

export interface StoryRollupCounts {
  acCount: number
  atcCount: number
  testCount: number
  runCount: number
  defectCount: number
}

export function storyRollupCounts(payload: StoryTraceabilityPayload): StoryRollupCounts {
  const atcs = payload.criteria.flatMap(c => c.atcs);
  const testIds = new Set(atcs.map(a => a.test?.id).filter((id): id is string => Boolean(id)));
  const runIds = new Set(atcs.map(a => a.latest_run?.run_id).filter((id): id is string => Boolean(id)));
  const defectIds = new Set(atcs.flatMap(a => a.defects.map(d => d.id)));
  return {
    acCount: payload.criteria.length,
    atcCount: atcs.length,
    testCount: testIds.size,
    runCount: runIds.size,
    defectCount: defectIds.size,
  };
}

// ---------------------------------------------------------------------------
// BK-48 — chain filters (result / module / date range). Pure, framework-
// agnostic, mirrors the mockup's own client-side `applyFilters()`
// (`traceability-chain.html:914-974`) over the ALREADY-fetched chain — no new
// fetch on a filter change (BK-45's own no-pagination decision already
// bounds one story's payload). `data-status`/`data-module`/`data-date` below
// name the row attributes the mockup carries per `.chain-row` — the live
// component renders the SAME attributes on each `AtcRow` root element.

// Six-value order per D27 (domain-glossary.md's run-status grain split) and
// AC1.3's mandated toggle order.
export const RESULT_FILTER_VALUES: RunChipTone[] = ['pass', 'fail', 'blocked', 'skipped', 'aborted', 'running'];

export const RESULT_FILTER_LABELS: Record<RunChipTone, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  skipped: 'Skipped',
  aborted: 'Aborted',
  running: 'Running',
};

// A row's `data-status` source. `null` when the ATC has no latest run yet —
// EXCLUDED while a result filter is active (AC1.4), still visible with none
// active (the existing "no-run" placeholder rendering is unaffected).
export function rowFilterStatus(atc: TraceabilityAtc): RunChipTone | null {
  return atc.latest_run ? runChipTone(atc.latest_run) : null;
}

// A row's `data-date` source (latest-run date, per the shift-left Design
// Contract Status #4 resolution). `null` when there is no latest run —
// EXCLUDED while a date filter is active (AC2.7/AC6.1).
export function rowFilterDate(atc: TraceabilityAtc): string | null {
  return atc.latest_run ? atc.latest_run.started_at.slice(0, 10) : null;
}

export interface TraceabilityFilterState {
  results: RunChipTone[]
  moduleId: string | null
  from: string | null
  to: string | null
}

export const EMPTY_FILTER_STATE: TraceabilityFilterState = { results: [], moduleId: null, from: null, to: null };

// AC2.5 — ratified verbatim error copy.
export const DATE_RANGE_ERROR_MESSAGE = 'From date is after to date. Date filter ignored until fixed.';

export function isDateRangeInverted(from: string | null, to: string | null): boolean {
  return from !== null && to !== null && from > to;
}

// An inverted range contributes NOTHING to filtering (AC2.5 — "ignored until
// fixed"), same as the mockup's `dateRange()` clearing `from`/`to` to '' on
// invalid input before `filtering` is computed.
export function isFilteringActive(state: TraceabilityFilterState): boolean {
  const dateActive = !isDateRangeInverted(state.from, state.to) && (state.from !== null || state.to !== null);
  return state.results.length > 0 || state.moduleId !== null || dateActive;
}

// AND across result + module + date (AC2.4); an inverted date range is
// skipped (never excludes a row), matching `isFilteringActive`.
export function atcMatchesFilters(atc: TraceabilityAtc, state: TraceabilityFilterState): boolean {
  if (state.moduleId !== null && atc.module.id !== state.moduleId) { return false; }

  if (state.results.length > 0) {
    const status = rowFilterStatus(atc);
    if (status === null || !state.results.includes(status)) { return false; }
  }

  if (!isDateRangeInverted(state.from, state.to) && (state.from !== null || state.to !== null)) {
    const date = rowFilterDate(atc);
    if (date === null) { return false; }
    if (state.from !== null && date < state.from) { return false; }
    if (state.to !== null && date > state.to) { return false; }
  }

  return true;
}

// The module picker's option set (AC2.1/2.2): dedupe modules actually
// present in this chain. Archived modules never reach this list FOR FREE —
// `bunkai_report_story_traceability` already excludes ATCs under an archived
// module (or archived ancestor) from the payload entirely, so there is
// nothing extra to filter here.
export function distinctModules(payload: StoryTraceabilityPayload): TraceabilityModule[] {
  const byId = new Map<string, TraceabilityModule>();
  for (const criterion of payload.criteria) {
    for (const atc of criterion.atcs) {
      if (!byId.has(atc.module.id)) { byId.set(atc.module.id, atc.module); }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// AC5.4 — a `module` URL param has no static enum to check against (unlike
// `result`, validated inside `parseFilterStateFromParams` itself): it can
// only be validated once the real module set for THIS chain is known. A
// stale or malformed id (e.g. from an old share link, or a module archived
// since the link was shared) drops back to "all modules" — never a false
// "Filters excluded everything". Review correction (Stage 3): an earlier
// version passed a URL-supplied `moduleId` through unvalidated.
export function resolveKnownModuleId(moduleId: string | null, modules: TraceabilityModule[]): string | null {
  if (moduleId === null) { return null; }
  return modules.some(m => m.id === moduleId) ? moduleId : null;
}

export interface FilteredCriterion {
  criterion: TraceabilityCriterion
  visibleAtcIds: Set<string>
  shownCount: number
  totalCount: number
}

// Per-AC visible-row sets (AC1.1/AC2.6's "n of m shown", and the AC-card
// hide rule below). An AC that is naturally uncovered (0 ATCs bound) has
// `totalCount: 0` and is NEVER hidden by filtering alone — see
// `isAcCardHidden`.
export function filterCriteria(payload: StoryTraceabilityPayload, state: TraceabilityFilterState): FilteredCriterion[] {
  return payload.criteria.map((criterion) => {
    const visibleAtcIds = new Set(criterion.atcs.filter(atc => atcMatchesFilters(atc, state)).map(atc => atc.id));
    return { criterion, visibleAtcIds, shownCount: visibleAtcIds.size, totalCount: criterion.atcs.length };
  });
}

// AC1.1 — "the AC card remains visible if it has at least one visible row;
// hidden if zero visible rows". Scoped to ACs that HAVE rows to begin with
// (`totalCount > 0`): a naturally-uncovered AC (0 ATCs bound) is NEVER
// hidden by filtering alone, matching both the mockup's own `applyFilters()`
// (`traceability-chain.html:939-949` — an empty `.ac-card` hides only in the
// story-wide zero-match case, never per-filter) and BK-45's already-shipped
// "Uncovered" strip, which renders unconditionally. Review correction
// (Stage 3): an earlier version hid every zero-shown card uniformly,
// including uncovered ones — that silently erased a real coverage gap from
// view the moment ANY filter was active (e.g. toggling "Fail" would hide an
// unrelated AC that simply has no ATCs), an unratified departure from both
// the mockup and the shipped baseline (Critical Rule #15).
export function isAcCardHidden(filtered: FilteredCriterion, filtering: boolean): boolean {
  return filtering && filtered.totalCount > 0 && filtered.shownCount === 0;
}

export function acNoteLabel(filtered: FilteredCriterion, filtering: boolean): string {
  return filtering ? `${filtered.shownCount} of ${filtered.totalCount} shown ·` : '';
}

export interface FilterTotals {
  totalRows: number
  visibleRows: number
}

export function filterTotals(filtered: FilteredCriterion[]): FilterTotals {
  return filtered.reduce(
    (acc, f) => ({ totalRows: acc.totalRows + f.totalCount, visibleRows: acc.visibleRows + f.shownCount }),
    { totalRows: 0, visibleRows: 0 },
  );
}

// AC3.1 — the whole story has chain rows, but the active filter combination
// matches none of them. Distinct from `resolveStoryChainViewState`'s
// `zero-coverage` (no ATCs bound anywhere — a DATA gap) and `zero-ac` (no
// criteria at all).
export function isFilteredEmpty(totals: FilterTotals, filtering: boolean): boolean {
  return filtering && totals.totalRows > 0 && totals.visibleRows === 0;
}

export const FILTERED_EMPTY_TITLE = 'Filters excluded everything';
export function filteredEmptyBody(totalRows: number, storyTitle: string): string {
  const noun = totalRows === 1 ? 'chain entry exists' : 'chain entries exist';
  return `${totalRows} ${noun} for ${storyTitle}, and the active filters match none of them. `
    + 'The data is still there: this is a filter result, not a coverage gap.';
}

// AC4.1/AC4.4 — the row-count `aria-live` text.
export function rowCountLabel(totals: FilterTotals, filtering: boolean): string {
  if (totals.totalRows === 0) { return ''; }
  return filtering
    ? `${totals.visibleRows} of ${totals.totalRows} chain entries shown`
    : `${totals.totalRows} chain entries`;
}

export interface ActiveFilterChip {
  key: 'result' | 'module' | 'from' | 'to'
  label: string
}

// AC4.1 — one chip per active filter axis. A still-invalid date range never
// contributes a chip (matches `isFilteringActive`'s treatment).
export function activeFilterChips(state: TraceabilityFilterState, modules: TraceabilityModule[]): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (state.results.length > 0) {
    chips.push({ key: 'result', label: `Result: ${state.results.map(r => RESULT_FILTER_LABELS[r]).join(', ')}` });
  }
  if (state.moduleId !== null) {
    const label = modules.find(m => m.id === state.moduleId)?.name ?? state.moduleId;
    chips.push({ key: 'module', label: `Module: ${label}` });
  }
  if (!isDateRangeInverted(state.from, state.to)) {
    if (state.from !== null) { chips.push({ key: 'from', label: `From ${state.from}` }); }
    if (state.to !== null) { chips.push({ key: 'to', label: `To ${state.to}` }); }
  }
  return chips;
}

// ---------------------------------------------------------------------------
// URL query-param <-> filter-state (AC5). Unknown/malformed values are
// silently dropped (AC5.4) rather than surfaced as errors — a bad share link
// degrades to the unfiltered view, never a broken one.

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isResultFilterValue(value: string): value is RunChipTone {
  return (RESULT_FILTER_VALUES as string[]).includes(value);
}

// Shape AND calendar validity (rejects e.g. `2026-13-45` — the regex alone
// only checks digit shape, not that month 13 / day 45 exist).
function isValidDateParam(value: string): boolean {
  if (!DATE_PARAM_PATTERN.test(value)) { return false; }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseFilterStateFromParams(params: URLSearchParams): TraceabilityFilterState {
  const resultRaw = params.get('result');
  const results = resultRaw
    ? [...new Set(resultRaw.split(',').map(v => v.trim()).filter(isResultFilterValue))]
    : [];

  const moduleRaw = params.get('module');
  const moduleId = moduleRaw && moduleRaw.length > 0 ? moduleRaw : null;

  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  const from = fromRaw && isValidDateParam(fromRaw) ? fromRaw : null;
  const to = toRaw && isValidDateParam(toRaw) ? toRaw : null;

  return { results, moduleId, from, to };
}

// Only the axes actually set are written (AC5.5/5.6 — partial and
// open-ended ranges never force the other params into the URL).
export function filterStateToParams(state: TraceabilityFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.results.length > 0) { params.set('result', state.results.join(',')); }
  if (state.moduleId !== null) { params.set('module', state.moduleId); }
  if (state.from !== null) { params.set('from', state.from); }
  if (state.to !== null) { params.set('to', state.to); }
  return params;
}
