import type { TestListItem, TestListViewState } from '@lib/tests/test-list';
import type { TestsListViewProps } from './TestsListView';
import { DEFAULT_TEST_LIST_SORT, TEST_LIST_EMPTY_TITLE, TEST_LIST_FAILED_TITLE, TEST_LIST_NO_MATCH_TITLE } from '@lib/tests/test-list';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestsListView } from './TestsListView';

// BK-666 — the Tests list view, rendered on the server (its first paint). This
// pins which block each state draws, that the states never share a block, what
// a row carries (AC-03), the header's sort semantics (AC-05) and the viewer's
// missing create affordance (AC-08). The rules themselves are
// `lib/tests/test-list.test.ts`'s. No browser is involved, so this is NOT
// live-UI evidence.

const ROWS: TestListItem[] = [
  { id: 't1', title: 'Checkout happy path', step_count: 7, created_at: '2026-10-05T10:00:00Z', tags: ['smoke', 'Nightly-EU'] },
  { id: 't2', title: 'Empty chain', step_count: 0, created_at: '2026-10-04T10:00:00Z', tags: [] },
];

function render(viewState: TestListViewState, overrides: Partial<TestsListViewProps> = {}): string {
  const noop = () => {};
  return renderToStaticMarkup(
    <TestsListView
      projectSlug="checkout"
      rows={viewState === 'rows' ? ROWS : []}
      totalCount={viewState === 'empty-never' ? 0 : 5}
      viewState={viewState}
      appliedTag={null}
      sort={DEFAULT_TEST_LIST_SORT}
      canCreate
      onSort={noop}
      onClearTag={noop}
      onRetry={noop}
      {...overrides}
    />,
  );
}

const STATE_BLOCKS = ['tests-list-loading', 'tests-list-error', 'tests-list-empty', 'tests-list-no-match', 'tests-list-table'];

function blocksIn(html: string): string[] {
  return STATE_BLOCKS.filter(id => html.includes(`data-testid="${id}"`));
}

describe('TestsListView', () => {
  it('draws exactly one block per state', () => {
    expect(blocksIn(render('pending', { appliedTag: 'smoke' }))).toEqual(['tests-list-loading']);
    expect(blocksIn(render('failed', { appliedTag: 'smoke' }))).toEqual(['tests-list-error']);
    expect(blocksIn(render('empty-never'))).toEqual(['tests-list-empty']);
    expect(blocksIn(render('empty-no-match', { appliedTag: 'nightly' }))).toEqual(['tests-list-no-match']);
    expect(blocksIn(render('rows'))).toEqual(['tests-list-table']);
  });

  it('renders each row with its name, chain length, tags and creation day (AC-03)', () => {
    const html = render('rows');
    expect(html).toContain('Checkout happy path');
    expect(html).toContain('7 ATCs');
    expect(html).toContain('smoke');
    expect(html).toContain('Nightly-EU');
    expect(html).toContain('2026-10-05');
    expect(html).toContain('href="/projects/checkout/tests/t1"');
  });

  it('states an empty chain as zero instead of hiding the row (AC-03)', () => {
    const html = render('rows');
    expect(html).toContain('data-testid="tests-list-row-t2"');
    expect(html).toContain('0 ATCs');
  });

  it('marks the active sort column for assistive tech and leaves Tags unsortable (AC-05)', () => {
    const html = render('rows', { sort: { column: 'chain', direction: 'asc' } });
    expect(html).toMatch(/aria-sort="ascending"[^>]*>\s*<button[^>]*data-testid="tests-list-sort-chain"/);
    expect(html).toContain('data-testid="tests-list-sort-name"');
    expect(html).toContain('data-testid="tests-list-sort-created"');
    expect(html).not.toContain('data-testid="tests-list-sort-tags"');
  });

  it('counts what is on screen and names the tag when filtered', () => {
    expect(render('rows')).toContain('2 Tests in this project');
    expect(render('rows', { appliedTag: 'smoke' })).toContain('2 of 5 Tests carry smoke');
  });

  it('shows no count while a lookup is pending or failed', () => {
    expect(render('pending', { appliedTag: 'smoke' })).not.toContain('data-testid="tests-list-count"');
    expect(render('failed', { appliedTag: 'smoke' })).not.toContain('data-testid="tests-list-count"');
  });

  it('names the failure, offers Retry and is announced (AC-09)', () => {
    const html = render('failed', { appliedTag: 'smoke' });
    expect(html).toContain(TEST_LIST_FAILED_TITLE);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="tests-list-retry"');
  });

  it('keeps "no Tests yet" and "no match" visibly different, neither as an error (AC-04, AC-09)', () => {
    const empty = render('empty-never');
    const noMatch = render('empty-no-match', { appliedTag: 'nightly' });
    expect(empty).toContain(TEST_LIST_EMPTY_TITLE);
    expect(noMatch).toContain(TEST_LIST_NO_MATCH_TITLE);
    expect(noMatch).toContain('&quot;nightly&quot;');
    expect(noMatch).toContain('data-testid="tests-list-no-match-clear"');
    expect(empty).not.toContain('role="alert"');
    expect(noMatch).not.toContain('role="alert"');
  });

  it('points a creator at New Test from the empty state', () => {
    expect(render('empty-never')).toContain('href="/projects/checkout/tests/new"');
  });

  it('offers a viewer no create affordance (AC-08)', () => {
    const empty = render('empty-never', { canCreate: false });
    expect(empty).not.toContain('tests-list-empty-new-test');
    expect(empty).not.toContain('/tests/new');
  });

  it('marks the loading state busy', () => {
    expect(render('pending', { appliedTag: 'smoke' })).toContain('aria-busy="true"');
  });
});
