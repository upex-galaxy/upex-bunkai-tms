import type { CompareGroup, CompareRow, CompareRunHeader, CompareStepStatus, RunComparison } from '@lib/runs/compare-view';
import { readFileSync } from 'node:fs';
import { COMPARE_LOAD_ERROR, compareNoPreviousMessage } from '@lib/runs/compare-view';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunCompareView } from './RunCompareView';

// BK-442 — the comparison view, rendered on the server (the same path its first
// paint takes). This pins what the view model cannot: the document structure
// (a real h1 and h2 headings, a labelled icon-only link), the one error copy, and
// which block each state draws. The rules themselves are the database function's
// (`compare-isolation.test.ts`); the words are `compare-view.test.ts`'s. No browser
// is involved, so this is NOT live-UI evidence.

const RUN_ID = 'aaaaaaaa-1111-2222-3333-444444444444';

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
    total_steps: 3,
    skipped_steps: 0,
    ...overrides,
  };
}

function row(group: CompareGroup, content: string, previous: CompareStepStatus | null, status: CompareStepStatus | null): CompareRow {
  return {
    group,
    atc_position: 1,
    atc_title: 'Add item',
    content,
    input_data: null,
    expected: null,
    step_id: status === null ? null : `s-${content}`,
    previous_step_id: previous === null ? null : `p-${content}`,
    status,
    previous_status: previous,
  };
}

const BASE = { test: { id: 't1', title: 'Checkout flow' }, environment: { id: 'env-1', name: 'Staging' } };

const COMPARED: RunComparison = {
  ...BASE,
  state: 'compared',
  run: header(),
  previous: header({ id: 'bbbbbbbb-1111-2222-3333-444444444444', status: 'aborted', abort_reason: 'env down', skipped_steps: 2 }),
  counts: { new_failure: 1, still_failing: 0, newly_fixed: 0, unchanged_pass: 1, not_comparable: 0, shared: 2, added: 1, removed: 0 },
  nothing_changed: false,
  no_common_steps: false,
  rows: [row('new_failure', 'A2', 'passed', 'failed'), row('added', 'NEW', null, 'failed'), row('unchanged_pass', 'A1', 'passed', 'passed')],
};

function render(props: { initialComparison: RunComparison | null, initialError?: string | null }): string {
  return renderToStaticMarkup(<RunCompareView projectSlug="acme" runId={RUN_ID} {...props} />);
}

describe('RunCompareView document structure', () => {
  const html = render({ initialComparison: COMPARED });

  it('has one h1 (the Test title) and an h2 for every group it draws, none for an empty group', () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Checkout flow');
    const headings = [...html.matchAll(/<h2[^>]*data-testid="run-compare-heading-([a-z_]+)"[^>]*>(.*?)<\/h2>/g)];
    expect(headings.map(m => m[1])).toEqual(['new_failure', 'added', 'unchanged_pass']);
    expect(headings.map(m => m[2].replace(/<[^>]+>/g, ''))).toEqual(['New failures1', 'Added1', 'Unchanged passes1']);
    expect(html).not.toContain('run-compare-heading-still_failing');
  });

  it('puts the collapsed group\'s heading inside its <details>, the others outside any', () => {
    const detailsAt = html.indexOf('<details');
    expect(detailsAt).toBeGreaterThan(-1);
    expect(html.indexOf('run-compare-heading-unchanged_pass')).toBeGreaterThan(detailsAt);
    expect(html.indexOf('run-compare-heading-new_failure')).toBeLessThan(detailsAt);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toContain('<details open');
  });

  it('labels the icon-only back link', () => {
    expect(html).toMatch(/<a[^>]*data-testid="run-compare-back"[^>]*aria-label="Back to this run"|<a[^>]*aria-label="Back to this run"[^>]*data-testid="run-compare-back"/);
  });

  it('draws the seven counts including zeros, the aborted notice above them and the reworded line under Added', () => {
    for (const group of ['new_failure', 'still_failing', 'newly_fixed', 'not_comparable', 'added', 'removed', 'unchanged_pass']) {
      expect(html).toContain(`data-testid="run-compare-count-${group}"`);
    }
    expect(html.indexOf('run-compare-aborted-previous')).toBeLessThan(html.indexOf('run-compare-counts'));
    expect(html).toContain('run-compare-reworded-added');
    expect(html).not.toContain('run-compare-reworded-new_failure');
  });
});

describe('RunCompareView states', () => {
  it('draws a plain statement, no counts and no groups, when there is no earlier Run (the cards stay)', () => {
    const html = render({ initialComparison: { ...BASE, state: 'no_previous', run: header(), previous: null } });
    expect(html).toContain(compareNoPreviousMessage('Staging'));
    expect(html).toContain('Runs in other environments are not compared.');
    expect(html).toContain('run-compare-card-this');
    expect(html).toContain('run-compare-card-previous');
    expect(html).not.toContain('run-compare-counts');
    expect(html).not.toMatch(/<h2/);
  });

  it('draws the in-progress and unreliable statements instead of counts', () => {
    const progress = render({ initialComparison: { ...BASE, state: 'in_progress', run: header({ status: 'running', finished_at: null }), previous: null } });
    expect(progress).toContain('This run is still in progress. Comparison is available once it is finished or aborted.');
    const unreliable = render({ initialComparison: { ...BASE, state: 'unreliable', run: header(), previous: header({ id: 'cccccccc-1' }) } });
    expect(unreliable).toContain('These two runs cannot be compared reliably.');
    expect(unreliable).toContain('Bunkai cannot tell which ATC one of their steps came from, so it shows no comparison instead of a wrong one.');
    expect(unreliable).not.toContain('run-compare-counts');
  });
});

describe('RunCompareView error copy', () => {
  it('shows the one error copy and a Retry on a first-load failure', () => {
    const html = render({ initialComparison: null, initialError: COMPARE_LOAD_ERROR });
    expect(html).toContain('Could not compare these runs.');
    expect(html).toContain('data-testid="run-compare-retry"');
  });

  it('uses that same copy for every failed Retry: the view never renders the server\'s own message', () => {
    const source = readFileSync(new URL('./RunCompareView.tsx', import.meta.url), 'utf8');
    const code = source.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    // Every failure branch of the Retry sets the shared constant, and nothing reads the body's message.
    expect(code.match(/setError\(COMPARE_LOAD_ERROR\)/g)).toHaveLength(3);
    expect(code).not.toMatch(/setError\((?!COMPARE_LOAD_ERROR\)|null\))/);
    expect(code).not.toContain('error?.message');
  });
});
