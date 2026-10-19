import { formatRunDuration } from '@lib/runs/duration';

// BK-442 — Run comparison view model: framework-agnostic, pure functions only.
// `bunkai_compare_run` (0092_run_compare.sql) owns the RULES (status matrix,
// pairing, Previous-run choice, counts, row order) and returns data with no copy;
// this file owns the WORDS and the small decisions about which block to draw.
// Keeping them here makes every sentence and every branch unit-testable without a
// browser or a database, and keeps the page and the API client reading one
// vocabulary. Mirrors `lib/runs/history-view.ts` (BK-37).
//
// No imports from `components/runs/RunHistoryView.tsx`: that file is shared with
// BK-443 and stays untouched by this story, so the few helpers it keeps private
// (UTC rendering, executor labels, chip tokens) are re-stated here.

export type CompareState = 'compared' | 'no_previous' | 'in_progress' | 'unreliable';

export type CompareGroup
  = | 'new_failure'
    | 'still_failing'
    | 'newly_fixed'
    | 'not_comparable'
    | 'added'
    | 'removed'
    | 'unchanged_pass';

export type CompareStepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';
export type CompareRunStatus = 'running' | 'passed' | 'failed' | 'aborted';

export interface CompareRunHeader {
  id: string
  status: CompareRunStatus
  started_at: string
  finished_at: string | null
  environment_id: string
  environment_name: string | null
  executor_mode: string
  abort_reason: string | null
  total_steps: number
  skipped_steps: number
}

export interface CompareRow {
  group: CompareGroup
  atc_position: number
  atc_title: string
  content: string
  input_data: string | null
  expected: string | null
  step_id: string | null
  previous_step_id: string | null
  status: CompareStepStatus | null
  previous_status: CompareStepStatus | null
}

export interface CompareCounts {
  new_failure: number
  still_failing: number
  newly_fixed: number
  unchanged_pass: number
  not_comparable: number
  shared: number
  added: number
  removed: number
}

// The wire shape of `bunkai_compare_run` and of GET /api/v1/runs/{id}/compare.
// `counts`, `nothing_changed`, `no_common_steps` and `rows` exist only when
// `state === 'compared'`; `previous` is null unless a Previous run was resolved.
export interface RunComparison {
  state: CompareState
  test: { id: string, title: string }
  environment: { id: string, name: string | null }
  run: CompareRunHeader
  previous: CompareRunHeader | null
  counts?: CompareCounts
  nothing_changed?: boolean
  no_common_steps?: boolean
  rows?: CompareRow[]
}

// ---------------------------------------------------------------------------
// Copy — the PO's ratified wording (BK-442 comments of 2026-10-12). Exported so
// the component and the tests assert against ONE source.
// ---------------------------------------------------------------------------

export const COMPARE_NOTHING_CHANGED = 'Nothing changed since the previous run.';
export const COMPARE_NO_COMMON_STEPS = 'These two runs have no step in common. Every step is listed as Added or Removed.';
export const COMPARE_IN_PROGRESS = 'This run is still in progress. Comparison is available once it is finished or aborted.';
export const COMPARE_UNRELIABLE_TITLE = 'These two runs cannot be compared reliably.';
export const COMPARE_UNRELIABLE_DETAIL = 'Bunkai cannot tell which ATC one of their steps came from, so it shows no comparison instead of a wrong one.';
export const COMPARE_NO_PREVIOUS_NOTE = 'Runs in other environments are not compared.';
export const COMPARE_REWORDED_NOTE = 'A step whose wording changed appears as Removed and Added.';
// ONE error copy for every failed load: the first server read, a failed Retry and the
// API's own fixed 500 text (`COMPARE_FAILURE_MESSAGE` in the route's response.ts is
// this constant), so the screen never changes its wording between attempts.
export const COMPARE_LOAD_ERROR = 'Could not compare these runs.';

export function compareNoPreviousMessage(environmentName: string | null): string {
  return `No earlier run of this Test in ${environmentName ?? 'this environment'} to compare with.`;
}

// Group order is fixed (PO Q6): what broke first, what needs no attention last.
export const COMPARE_GROUP_ORDER: readonly CompareGroup[] = [
  'new_failure',
  'still_failing',
  'newly_fixed',
  'not_comparable',
  'added',
  'removed',
  'unchanged_pass',
];

export const COMPARE_GROUP_LABEL: Record<CompareGroup, string> = {
  new_failure: 'New failures',
  still_failing: 'Still failing',
  newly_fixed: 'Newly fixed',
  not_comparable: 'Not comparable',
  added: 'Added',
  removed: 'Removed',
  unchanged_pass: 'Unchanged passes',
};

// ---------------------------------------------------------------------------
// Words and tokens
// ---------------------------------------------------------------------------

const STEP_STATUS_WORD: Record<CompareStepStatus, string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

export function stepStatusWord(status: CompareStepStatus | null): string {
  return status === null ? '—' : STEP_STATUS_WORD[status];
}

// `.status-chip[data-status]` keys in app/globals.css. 'pending' has no chip of
// its own and cannot occur in a terminal Run; it borrows the neutral one rather
// than rendering an unstyled chip.
const STEP_CHIP_TOKEN: Record<CompareStepStatus, string> = {
  pending: 'skipped',
  passed: 'pass',
  failed: 'fail',
  blocked: 'blocked',
  skipped: 'skipped',
};

export function stepChipToken(status: CompareStepStatus): string {
  return STEP_CHIP_TOKEN[status];
}

const RUN_CHIP_TOKEN: Record<CompareRunStatus, string> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'aborted',
  running: 'running',
};

export function runChipToken(status: CompareRunStatus): string {
  return RUN_CHIP_TOKEN[status];
}

export function runOutcomeWord(status: CompareRunStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Both outcomes in words, never colour alone: "Passed → Failed", "Blocked → Passed".
// An Added row has only This run's outcome, a Removed row only the Previous run's.
export function rowOutcomeText(row: Pick<CompareRow, 'group' | 'status' | 'previous_status'>): string {
  if (row.group === 'added') {
    return stepStatusWord(row.status);
  }
  if (row.group === 'removed') {
    return stepStatusWord(row.previous_status);
  }
  return `${stepStatusWord(row.previous_status)} → ${stepStatusWord(row.status)}`;
}

const EXECUTOR_LABEL: Record<string, string> = { human: 'Human', agent: 'Agent', ci: 'CI' };

export function executorLabel(mode: string): string {
  return EXECUTOR_LABEL[mode] ?? mode;
}

export function shortRunId(id: string): string {
  return id.slice(0, 8);
}

// Deterministic UTC rendering (no `toLocale*`): the view server-renders its first
// paint, so a locale call would drift between server and browser and trip a
// hydration mismatch. '2026-10-02T09:00:00+00:00' -> '2026-10-02 09:00 UTC'.
// Returns the input untouched when it does not parse: a formatter must never break
// a render.
export function formatUtcMinute(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  const normalized = new Date(parsed).toISOString();
  return `${normalized.slice(0, 10)} ${normalized.slice(11, 16)} UTC`;
}

export function startedLine(header: Pick<CompareRunHeader, 'started_at'>): string {
  return `Started ${formatUtcMinute(header.started_at)}`;
}

export function durationText(header: Pick<CompareRunHeader, 'started_at' | 'finished_at'>): string {
  return formatRunDuration(header.started_at, header.finished_at) ?? '—';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function compareHref(projectSlug: string, runId: string): string {
  return `/projects/${projectSlug}/runs/${runId}/compare`;
}

export function runHref(projectSlug: string, runId: string): string {
  return `/projects/${projectSlug}/runs/${runId}`;
}

export function testHistoryHref(projectSlug: string, testId: string): string {
  return `/projects/${projectSlug}/tests/${testId}/runs`;
}

// The control is offered on every Passed, Failed or Aborted Run, viewers included,
// and never on a Run still running (PO Q5/Q6).
export function shouldShowCompareControl(status: CompareRunStatus): boolean {
  return status !== 'running';
}

// ---------------------------------------------------------------------------
// What to draw
// ---------------------------------------------------------------------------

export interface CompareCountItem { group: CompareGroup, label: string, value: number }

// Seven labelled counts, ALWAYS drawn, zero included (AC 2.2), in the same order
// as the groups. Added and Removed are counted apart from the five outcomes.
export function buildCountItems(counts: CompareCounts): CompareCountItem[] {
  return COMPARE_GROUP_ORDER.map(group => ({ group, label: COMPARE_GROUP_LABEL[group], value: counts[group] }));
}

export function sharedStepsLine(shared: number): string {
  return `${shared} ${shared === 1 ? 'step' : 'steps'} in both runs`;
}

export interface CompareGroupBlock {
  group: CompareGroup
  label: string
  rows: CompareRow[]
  collapsed: boolean
  showRewordedNote: boolean
}

// Groups in the fixed order; an EMPTY group is not drawn. The function already
// returns the rows in display order, so each group keeps its rows' relative order.
// Unchanged passes starts collapsed; the reworded-step line shows under Added and
// Removed whenever either is drawn.
export function buildGroupBlocks(rows: CompareRow[]): CompareGroupBlock[] {
  return COMPARE_GROUP_ORDER.flatMap((group) => {
    const inGroup = rows.filter(row => row.group === group);
    if (inGroup.length === 0) {
      return [];
    }
    return [{
      group,
      label: COMPARE_GROUP_LABEL[group],
      rows: inGroup,
      collapsed: group === 'unchanged_pass',
      showRewordedNote: group === 'added' || group === 'removed',
    }];
  });
}

export type CompareViewState
  = | { kind: 'error', message: string }
    | { kind: 'no_previous', message: string, note: string }
    | { kind: 'in_progress', message: string }
    | { kind: 'unreliable', message: string, detail: string }
    | { kind: 'compared' };

// Branch selection for the mutually exclusive bodies. A load failure wins over
// everything (a failed read also has no comparison, and rendering "no earlier run"
// on a broken request would be a lie). In the three non-compared states the
// message REPLACES counts and groups; the header cards stay.
export function resolveCompareViewState(args: { comparison: RunComparison | null, error: string | null }): CompareViewState {
  if (args.error !== null || args.comparison === null) {
    return { kind: 'error', message: args.error ?? COMPARE_LOAD_ERROR };
  }
  const { comparison } = args;
  switch (comparison.state) {
    case 'no_previous':
      return {
        kind: 'no_previous',
        message: compareNoPreviousMessage(comparison.environment.name),
        note: COMPARE_NO_PREVIOUS_NOTE,
      };
    case 'in_progress':
      return { kind: 'in_progress', message: COMPARE_IN_PROGRESS };
    case 'unreliable':
      return { kind: 'unreliable', message: COMPARE_UNRELIABLE_TITLE, detail: COMPARE_UNRELIABLE_DETAIL };
    case 'compared':
      return { kind: 'compared' };
  }
}

export interface CompareAbortNotice {
  side: 'previous' | 'this'
  headline: string
  unreached: string | null
  reason: string | null
}

// Whichever side was aborted gets a notice above the counts (PO Q5):
// "Previous run was aborted." or "This run was aborted.", then "N of M steps were
// not reached." ONLY when N (the steps Skipped in that Run) is above 0, then the
// abort reason as the Runner shows it. A sweep-closed Run with every step marked
// has nothing skipped, so it makes no unreached claim. Previous run first.
export function buildAbortNotices(comparison: Pick<RunComparison, 'run' | 'previous'>): CompareAbortNotice[] {
  const notices: CompareAbortNotice[] = [];
  const sides: Array<{ side: 'previous' | 'this', header: CompareRunHeader | null, headline: string }> = [
    { side: 'previous', header: comparison.previous, headline: 'Previous run was aborted.' },
    { side: 'this', header: comparison.run, headline: 'This run was aborted.' },
  ];
  for (const { side, header, headline } of sides) {
    if (header === null || header.status !== 'aborted') {
      continue;
    }
    notices.push({
      side,
      headline,
      unreached: header.skipped_steps > 0 ? `${header.skipped_steps} of ${header.total_steps} steps were not reached.` : null,
      reason: header.abort_reason !== null && header.abort_reason.trim() !== '' ? header.abort_reason : null,
    });
  }
  return notices;
}

// "Nothing changed" is the function's verdict (one shared step, nothing Added,
// Removed or Not comparable, every shared step an unchanged pass or still failing);
// the view only shows it, and never infers it from zero counts.
export function shouldShowNothingChanged(comparison: Pick<RunComparison, 'state' | 'nothing_changed'>): boolean {
  return comparison.state === 'compared' && comparison.nothing_changed === true;
}

export function shouldShowNoCommonSteps(comparison: Pick<RunComparison, 'state' | 'no_common_steps'>): boolean {
  return comparison.state === 'compared' && comparison.no_common_steps === true;
}

// Defensive parse of an API body or an RPC payload: anything that is not one of
// the four documented states is treated as a failed load, never drawn.
export function parseRunComparison(value: unknown): RunComparison | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<RunComparison>;
  const states: readonly string[] = ['compared', 'no_previous', 'in_progress', 'unreliable'];
  if (typeof candidate.state !== 'string' || !states.includes(candidate.state)) {
    return null;
  }
  if (typeof candidate.run !== 'object' || candidate.run === null || typeof candidate.test !== 'object' || candidate.test === null) {
    return null;
  }
  if (candidate.state === 'compared' && (candidate.counts === undefined || !Array.isArray(candidate.rows))) {
    return null;
  }
  return candidate as RunComparison;
}
