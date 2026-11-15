import {
  bugEvidenceContentPath,
  buildBugEvidenceRows,
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

// BK-594 — links and filed images in one list, by position.
describe('buildBugEvidenceRows', () => {
  const BUG = 'b0000000-0000-4000-8000-000000000001';
  const img = (id: string, position: number) => ({ id, position, filename: `${id}.png`, content_type: 'image/png', byte_size: 2048 });

  test('places images at their positions and links in the free ones, in order (AC-09)', () => {
    const rows = buildBugEvidenceRows({
      id: BUG,
      evidence_urls: ['https://example.com/log', 'https://example.com/video.mp4'],
      evidence_attachments: [img('a', 0), img('b', 2)],
    });
    expect(rows.map(r => (r.kind === 'image' ? `img:${r.id}` : `link:${r.url}`))).toEqual([
      'img:a',
      'link:https://example.com/log',
      'img:b',
      'link:https://example.com/video.mp4',
    ]);
    expect(rows).toHaveLength(4);
  });

  test('an image row opens the authorized content route, never a stored URL (AC-01)', () => {
    const [row] = buildBugEvidenceRows({ id: BUG, evidence_urls: [], evidence_attachments: [img('a', 0)] });
    expect(row).toEqual({ kind: 'image', id: 'a', label: 'a.png', href: bugEvidenceContentPath(BUG, 'a'), byteSize: 2048 });
    expect(bugEvidenceContentPath(BUG, 'a')).toBe(`/api/v1/bugs/${BUG}/evidence/a/content`);
  });

  test('links only, as before 0131, when no image is present (AC-08)', () => {
    const rows = buildBugEvidenceRows({ id: BUG, evidence_urls: ['javascript:alert(1)', 'https://example.com/x'] });
    expect(rows.map(r => r.kind)).toEqual(['link', 'link']);
    expect(rows[0]).toMatchObject({ kind: 'link', isOpenable: false });
    expect(rows[1]).toMatchObject({ kind: 'link', isOpenable: true });
  });

  test('no evidence is an empty list, not an error (AC-10)', () => {
    expect(buildBugEvidenceRows({ id: BUG, evidence_urls: [], evidence_attachments: [] })).toEqual([]);
  });

  test('never drops a row, even with an out-of-range position', () => {
    const rows = buildBugEvidenceRows({ id: BUG, evidence_urls: ['https://example.com/1'], evidence_attachments: [img('a', 7)] });
    expect(rows).toHaveLength(2);
  });
});
