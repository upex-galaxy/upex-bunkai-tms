import {
  evidenceCountLabel,
  formatBugEvidenceRow,
  isModuleArchived,
  resolveBugOriginView,
  severityLabel,
  shortBugId,
  splitStepsToReproduce,
  statusLabel,
} from '@lib/bugs/detail-view';
import { describe, expect, test } from 'bun:test';

describe('shortBugId', () => {
  test('slices the first 8 characters — the list\'s existing identifier treatment', () => {
    expect(shortBugId('8146efbe-3a17-4e8c-9379-52416bc6c90c')).toBe('8146efbe');
  });
});

describe('splitStepsToReproduce', () => {
  test('splits on newlines and numbers from 1 via array index (rendering concern)', () => {
    expect(splitStepsToReproduce('Step 1 - noop\nStep 2 - click submit')).toEqual([
      'Step 1 - noop',
      'Step 2 - click submit',
    ]);
  });

  test('drops blank lines', () => {
    expect(splitStepsToReproduce('First line\n\n\nSecond line\n')).toEqual([
      'First line',
      'Second line',
    ]);
  });

  test('a single-line run-linked step yields exactly one item', () => {
    expect(splitStepsToReproduce('Step 1 - noop')).toEqual(['Step 1 - noop']);
  });

  test('an empty field yields an empty list', () => {
    expect(splitStepsToReproduce('')).toEqual([]);
  });
});

describe('resolveBugOriginView', () => {
  test('a null origin resolves to standalone ("Filed manually")', () => {
    expect(resolveBugOriginView(null)).toEqual({ state: 'standalone' });
  });

  test('a linked origin computes the 1-based failed-step number from the stored 0-based position', () => {
    const view = resolveBugOriginView({
      run_id: 'run-1',
      run_step_position: 3,
      atc_id: 'atc-1',
      atc_title: 'ATC-B: one step fails',
      atc_layer: 'API',
    });
    expect(view).toEqual({
      state: 'linked',
      runId: 'run-1',
      atcId: 'atc-1',
      atcTitle: 'ATC-B: one step fails',
      failedStepNumber: 4,
    });
  });

  test('position 0 (the boundary case) converts to failed-step number 1, not 0', () => {
    const view = resolveBugOriginView({
      run_id: 'run-1',
      run_step_position: 0,
      atc_id: 'atc-1',
      atc_title: 'ATC-A',
      atc_layer: 'UI',
    });
    expect(view.failedStepNumber).toBe(1);
  });

  test('a linked origin with no resolvable run_step_position omits failedStepNumber rather than computing NaN', () => {
    const view = resolveBugOriginView({
      run_id: 'run-1',
      run_step_position: null,
      atc_id: 'atc-1',
      atc_title: 'ATC-A',
      atc_layer: 'UI',
    });
    expect(view.failedStepNumber).toBeUndefined();
  });
});

describe('severityLabel / statusLabel', () => {
  test('maps known severities and statuses to their display labels', () => {
    expect(severityLabel('P1')).toBe('Critical');
    expect(statusLabel('in_progress')).toBe('In progress');
  });

  test('falls back to the raw value for an unrecognized severity/status', () => {
    expect(severityLabel('P9')).toBe('P9');
    expect(statusLabel('archived')).toBe('archived');
  });
});

describe('isModuleArchived', () => {
  test('true when the module carries a non-null archived_at (PO Q3 — render + tag, never 404)', () => {
    expect(isModuleArchived({ id: 'm-1', name: 'M', path: 'm', archived_at: '2026-08-01T00:00:00Z' })).toBe(true);
  });

  test('false for an active module', () => {
    expect(isModuleArchived({ id: 'm-1', name: 'M', path: 'm', archived_at: null })).toBe(false);
  });

  test('false (defensive) when module is null', () => {
    expect(isModuleArchived(null)).toBe(false);
  });
});

describe('formatBugEvidenceRow', () => {
  test('labels an http URL with its last path segment and marks it openable', () => {
    const row = formatBugEvidenceRow('https://example.com/uploads/repro-step-3.png');
    expect(row).toEqual({
      url: 'https://example.com/uploads/repro-step-3.png',
      label: 'repro-step-3.png',
      isOpenable: true,
    });
  });

  test('falls back to the host when the URL has no path segment', () => {
    const row = formatBugEvidenceRow('https://example.com');
    expect(row.label).toBe('example.com');
    expect(row.isOpenable).toBe(true);
  });

  test('a javascript: entry is never openable, regardless of label (Scenario 3.4)', () => {
    const row = formatBugEvidenceRow('javascript:alert(1)');
    expect(row.isOpenable).toBe(false);
  });

  test('a data: entry is never openable', () => {
    const row = formatBugEvidenceRow('data:text/html,<script>alert(1)</script>');
    expect(row.isOpenable).toBe(false);
  });
});

describe('evidenceCountLabel', () => {
  test('reads "N / 10" at zero, mid-count, and the hard cap', () => {
    expect(evidenceCountLabel(0, 10)).toBe('0 / 10');
    expect(evidenceCountLabel(6, 10)).toBe('6 / 10');
    expect(evidenceCountLabel(10, 10)).toBe('10 / 10');
  });
});
