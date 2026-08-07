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

export interface TraceabilityAtc {
  id: string
  slug: string
  title: string
  layer: 'UI' | 'API' | 'Unit'
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
