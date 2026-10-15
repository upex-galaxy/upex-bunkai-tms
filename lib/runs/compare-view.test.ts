import type { CompareCounts, CompareGroup, CompareRow, CompareRunHeader, CompareStepStatus, RunComparison } from './compare-view';
import { describe, expect, it } from 'bun:test';
import {
  buildAbortNotices,
  buildCountItems,
  buildGroupBlocks,
  COMPARE_GROUP_LABEL,
  COMPARE_GROUP_ORDER,
  COMPARE_IN_PROGRESS,
  COMPARE_LOAD_ERROR,
  COMPARE_NO_COMMON_STEPS,
  COMPARE_NO_PREVIOUS_NOTE,
  COMPARE_NOTHING_CHANGED,
  COMPARE_REWORDED_NOTE,
  COMPARE_UNRELIABLE_DETAIL,
  COMPARE_UNRELIABLE_TITLE,
  compareHref,
  compareNoPreviousMessage,
  durationText,
  executorLabel,
  formatUtcMinute,
  parseRunComparison,
  resolveCompareViewState,
  rowOutcomeText,
  runChipToken,
  runHref,
  sharedStepsLine,
  shortRunId,
  shouldShowCompareControl,
  shouldShowNoCommonSteps,
  shouldShowNothingChanged,
  startedLine,
  stepChipToken,
  stepStatusWord,
  testHistoryHref,
} from './compare-view';

// BK-442 — the view model of the Run comparison. The RULES (matrix, pairing,
// baseline) are tested against the real database in `compare-isolation.test.ts`;
// this file pins the WORDS and the draw decisions, which are the PO's ratified copy.

const RUN_ID = '11111111-2222-3333-4444-555555555555';

function header(overrides: Partial<CompareRunHeader> = {}): CompareRunHeader {
  return {
    id: RUN_ID,
    status: 'passed',
    started_at: '2026-10-02T09:00:00+00:00',
    finished_at: '2026-10-02T09:25:00+00:00',
    environment_id: 'env-1',
    environment_name: 'Staging',
    executor_mode: 'human',
    abort_reason: null,
    total_steps: 7,
    skipped_steps: 0,
    ...overrides,
  };
}

function row(group: CompareGroup, content: string, previous: CompareStepStatus | null, status: CompareStepStatus | null): CompareRow {
  return {
    group,
    atc_position: 1,
    atc_title: 'ATC',
    content,
    input_data: null,
    expected: null,
    step_id: status === null ? null : `s-${content}`,
    previous_step_id: previous === null ? null : `p-${content}`,
    status,
    previous_status: previous,
  };
}

const COUNTS: CompareCounts = { new_failure: 1, still_failing: 0, newly_fixed: 1, unchanged_pass: 2, not_comparable: 2, shared: 6, added: 0, removed: 0 };

function comparison(overrides: Partial<RunComparison> = {}): RunComparison {
  return {
    state: 'compared',
    test: { id: 'test-1', title: 'Checkout flow' },
    environment: { id: 'env-1', name: 'Staging' },
    run: header(),
    previous: header({ id: 'prev-run-id', started_at: '2026-10-01T09:00:00+00:00' }),
    counts: COUNTS,
    nothing_changed: false,
    no_common_steps: false,
    rows: [],
    ...overrides,
  };
}

describe('group order and labels (PO Q6)', () => {
  it('draws groups in the fixed order: what broke first, passes last', () => {
    expect(COMPARE_GROUP_ORDER.map(g => COMPARE_GROUP_LABEL[g])).toEqual([
      'New failures',
      'Still failing',
      'Newly fixed',
      'Not comparable',
      'Added',
      'Removed',
      'Unchanged passes',
    ]);
  });

  it('shows seven labelled counts in that order, zero included', () => {
    const items = buildCountItems({ ...COUNTS, new_failure: 0, added: 0, removed: 0 });
    expect(items.map(i => `${i.label}:${i.value}`)).toEqual([
      'New failures:0',
      'Still failing:0',
      'Newly fixed:1',
      'Not comparable:2',
      'Added:0',
      'Removed:0',
      'Unchanged passes:2',
    ]);
  });

  it('words the shared-step total with the right plural', () => {
    expect(sharedStepsLine(7)).toBe('7 steps in both runs');
    expect(sharedStepsLine(1)).toBe('1 step in both runs');
    expect(sharedStepsLine(0)).toBe('0 steps in both runs');
  });
});

describe('buildGroupBlocks', () => {
  const rows = [
    row('unchanged_pass', 'A1', 'passed', 'passed'),
    row('new_failure', 'A2', 'passed', 'failed'),
    row('removed', 'old', 'passed', null),
    row('added', 'new', null, 'failed'),
    row('unchanged_pass', 'B1', 'passed', 'passed'),
  ];

  it('orders the groups, keeps each group\'s row order and does not draw empty groups', () => {
    const blocks = buildGroupBlocks(rows);
    expect(blocks.map(b => b.group)).toEqual(['new_failure', 'added', 'removed', 'unchanged_pass']);
    expect(blocks.find(b => b.group === 'unchanged_pass')!.rows.map(r => r.content)).toEqual(['A1', 'B1']);
  });

  it('starts only Unchanged passes collapsed', () => {
    expect(buildGroupBlocks(rows).filter(b => b.collapsed).map(b => b.group)).toEqual(['unchanged_pass']);
  });

  it('puts the reworded-step line under Added and Removed only, whenever either is drawn', () => {
    const blocks = buildGroupBlocks(rows);
    expect(blocks.filter(b => b.showRewordedNote).map(b => b.group)).toEqual(['added', 'removed']);
    expect(COMPARE_REWORDED_NOTE).toBe('A step whose wording changed appears as Removed and Added.');
    expect(buildGroupBlocks([row('new_failure', 'x', 'passed', 'failed')]).some(b => b.showRewordedNote)).toBe(false);
  });

  it('draws nothing for no rows', () => {
    expect(buildGroupBlocks([])).toEqual([]);
  });
});

describe('outcome wording (no meaning by colour alone)', () => {
  it('states both outcomes in words for a shared step, including every not-comparable pair', () => {
    const statuses: CompareStepStatus[] = ['passed', 'failed', 'blocked', 'skipped'];
    for (const previous of statuses) {
      for (const current of statuses) {
        expect(rowOutcomeText({ group: 'not_comparable', previous_status: previous, status: current }))
          .toBe(`${stepStatusWord(previous)} → ${stepStatusWord(current)}`);
      }
    }
    expect(rowOutcomeText({ group: 'not_comparable', previous_status: 'blocked', status: 'passed' })).toBe('Blocked → Passed');
    expect(rowOutcomeText({ group: 'not_comparable', previous_status: 'failed', status: 'blocked' })).toBe('Failed → Blocked');
    expect(rowOutcomeText({ group: 'new_failure', previous_status: 'passed', status: 'failed' })).toBe('Passed → Failed');
  });

  it('shows only the own outcome for an Added or Removed step', () => {
    expect(rowOutcomeText({ group: 'added', previous_status: null, status: 'failed' })).toBe('Failed');
    expect(rowOutcomeText({ group: 'removed', previous_status: 'passed', status: null })).toBe('Passed');
  });

  it('maps every status to a chip token that exists in globals.css', () => {
    expect(stepChipToken('passed')).toBe('pass');
    expect(stepChipToken('failed')).toBe('fail');
    expect(stepChipToken('blocked')).toBe('blocked');
    expect(stepChipToken('skipped')).toBe('skipped');
    expect(stepChipToken('pending')).toBe('skipped');
    expect([runChipToken('passed'), runChipToken('failed'), runChipToken('aborted'), runChipToken('running')]).toEqual(['pass', 'fail', 'aborted', 'running']);
  });
});

describe('header cards', () => {
  it('renders the start in deterministic UTC, whatever the offset the database used', () => {
    expect(formatUtcMinute('2026-10-02T09:00:00+00:00')).toBe('2026-10-02 09:00 UTC');
    expect(formatUtcMinute('2026-10-02T11:00:00+02:00')).toBe('2026-10-02 09:00 UTC');
    expect(startedLine({ started_at: '2026-10-01T09:00:00Z' })).toBe('Started 2026-10-01 09:00 UTC');
  });

  it('never breaks a render on an unparseable timestamp', () => {
    expect(formatUtcMinute('not a date')).toBe('not a date');
  });

  it('shows the first 8 characters of the Run id, the executor in words and a duration', () => {
    expect(shortRunId(RUN_ID)).toBe('11111111');
    expect([executorLabel('human'), executorLabel('agent'), executorLabel('ci'), executorLabel('other')]).toEqual(['Human', 'Agent', 'CI', 'other']);
    expect(durationText({ started_at: '2026-10-02T09:00:00Z', finished_at: '2026-10-02T09:25:00Z' })).toBe('25m 00s');
    expect(durationText({ started_at: '2026-10-02T09:00:00Z', finished_at: null })).toBe('—');
  });

  it('builds the three routes the page links to', () => {
    expect(compareHref('acme', RUN_ID)).toBe(`/projects/acme/runs/${RUN_ID}/compare`);
    expect(runHref('acme', RUN_ID)).toBe(`/projects/acme/runs/${RUN_ID}`);
    expect(testHistoryHref('acme', 'test-1')).toBe('/projects/acme/tests/test-1/runs');
  });

  it('offers the control on Passed, Failed and Aborted Runs and never while running', () => {
    expect(shouldShowCompareControl('passed')).toBe(true);
    expect(shouldShowCompareControl('failed')).toBe(true);
    expect(shouldShowCompareControl('aborted')).toBe(true);
    expect(shouldShowCompareControl('running')).toBe(false);
  });
});

describe('resolveCompareViewState', () => {
  it('a load failure wins over any comparison', () => {
    expect(resolveCompareViewState({ comparison: comparison(), error: 'boom' })).toEqual({ kind: 'error', message: 'boom' });
    expect(resolveCompareViewState({ comparison: null, error: null })).toEqual({ kind: 'error', message: COMPARE_LOAD_ERROR });
  });

  it('no earlier Run names the Environment and adds the other-environments note', () => {
    const state = resolveCompareViewState({ comparison: comparison({ state: 'no_previous', previous: null, environment: { id: 'e', name: 'Production' } }), error: null });
    expect(state).toEqual({
      kind: 'no_previous',
      message: 'No earlier run of this Test in Production to compare with.',
      note: 'Runs in other environments are not compared.',
    });
    expect(COMPARE_NO_PREVIOUS_NOTE).toBe('Runs in other environments are not compared.');
    expect(compareNoPreviousMessage(null)).toBe('No earlier run of this Test in this environment to compare with.');
  });

  it('in progress and unreliable carry the fixed copy', () => {
    expect(resolveCompareViewState({ comparison: comparison({ state: 'in_progress', previous: null }), error: null }))
      .toEqual({ kind: 'in_progress', message: COMPARE_IN_PROGRESS });
    expect(COMPARE_IN_PROGRESS).toBe('This run is still in progress. Comparison is available once it is finished or aborted.');
    expect(resolveCompareViewState({ comparison: comparison({ state: 'unreliable' }), error: null }))
      .toEqual({ kind: 'unreliable', message: COMPARE_UNRELIABLE_TITLE, detail: COMPARE_UNRELIABLE_DETAIL });
    expect(COMPARE_UNRELIABLE_TITLE).toBe('These two runs cannot be compared reliably.');
    expect(COMPARE_UNRELIABLE_DETAIL).toBe('Bunkai cannot tell which ATC one of their steps came from, so it shows no comparison instead of a wrong one.');
  });

  it('compared draws the counts and groups', () => {
    expect(resolveCompareViewState({ comparison: comparison(), error: null })).toEqual({ kind: 'compared' });
  });
});

describe('abort notices (PO Q5)', () => {
  it('names the aborted side, the unreached steps and the reason', () => {
    const notices = buildAbortNotices({ run: header(), previous: header({ status: 'aborted', abort_reason: 'environment down', skipped_steps: 4, total_steps: 7 }) });
    expect(notices).toEqual([{ side: 'previous', headline: 'Previous run was aborted.', unreached: '4 of 7 steps were not reached.', reason: 'environment down' }]);
  });

  it('makes no unreached claim when nothing was skipped (a sweep-closed Run with every step marked)', () => {
    const [notice] = buildAbortNotices({ run: header(), previous: header({ status: 'aborted', abort_reason: 'inactivity', skipped_steps: 0 }) });
    expect(notice).toEqual({ side: 'previous', headline: 'Previous run was aborted.', unreached: null, reason: 'inactivity' });
  });

  it('puts a notice on This run when it is the aborted side, Previous run first when both are', () => {
    const both = buildAbortNotices({
      run: header({ status: 'aborted', skipped_steps: 1, total_steps: 3, abort_reason: 'stopped' }),
      previous: header({ status: 'aborted', skipped_steps: 2, total_steps: 3, abort_reason: null }),
    });
    expect(both.map(n => n.headline)).toEqual(['Previous run was aborted.', 'This run was aborted.']);
    expect(both[0].reason).toBeNull();
    expect(both[1].unreached).toBe('1 of 3 steps were not reached.');
  });

  it('draws no notice for passed or failed Runs, or with no Previous run', () => {
    expect(buildAbortNotices({ run: header(), previous: header({ status: 'failed' }) })).toEqual([]);
    expect(buildAbortNotices({ run: header(), previous: null })).toEqual([]);
  });

  it('treats a blank reason as no reason', () => {
    expect(buildAbortNotices({ run: header(), previous: header({ status: 'aborted', abort_reason: '   ' }) })[0].reason).toBeNull();
  });
});

describe('verdict sentences are the function\'s, never inferred from counts', () => {
  it('shows "nothing changed" only for a compared state the function flagged', () => {
    expect(shouldShowNothingChanged(comparison({ nothing_changed: true }))).toBe(true);
    expect(shouldShowNothingChanged(comparison({ nothing_changed: false, counts: { ...COUNTS, new_failure: 0, newly_fixed: 0, not_comparable: 0 } }))).toBe(false);
    expect(shouldShowNothingChanged(comparison({ state: 'no_previous', nothing_changed: true }))).toBe(false);
    expect(COMPARE_NOTHING_CHANGED).toBe('Nothing changed since the previous run.');
  });

  it('shows "no step in common" only for a compared state the function flagged', () => {
    expect(shouldShowNoCommonSteps(comparison({ no_common_steps: true }))).toBe(true);
    expect(shouldShowNoCommonSteps(comparison({ state: 'unreliable', no_common_steps: true }))).toBe(false);
    expect(COMPARE_NO_COMMON_STEPS).toBe('These two runs have no step in common. Every step is listed as Added or Removed.');
  });
});

describe('parseRunComparison', () => {
  it('accepts each documented state', () => {
    for (const state of ['no_previous', 'in_progress', 'unreliable'] as const) {
      expect(parseRunComparison(comparison({ state }))).not.toBeNull();
    }
    expect(parseRunComparison(comparison())).not.toBeNull();
  });

  it('rejects anything else as a failed load', () => {
    expect(parseRunComparison(null)).toBeNull();
    expect(parseRunComparison('x')).toBeNull();
    expect(parseRunComparison({})).toBeNull();
    expect(parseRunComparison({ ...comparison(), state: 'surprise' })).toBeNull();
    expect(parseRunComparison({ state: 'compared', test: {}, run: {} })).toBeNull();
    expect(parseRunComparison({ ...comparison(), counts: undefined })).toBeNull();
    expect(parseRunComparison({ ...comparison(), rows: undefined })).toBeNull();
  });
});
