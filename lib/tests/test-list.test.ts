import type { TestListItem } from './test-list';
import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_TEST_LIST_SORT,
  filterTestsByTag,
  formatChainLength,
  formatTestCreatedDate,
  formatTestListCount,
  isDefaultTestListSort,
  nextTestListSort,
  parseTestListSort,
  resolveTestListViewState,
  sortTestList,
  testListNoMatchDescription,
  testListSortSearch,
} from './test-list';

// BK-666 — the Project Tests list's rules. The view only draws what these
// return, so the state discrimination (AC-09), the filter (AC-04, AC-07) and
// the sort (AC-05) are pinned here.

function item(id: string, title: string, stepCount: number, createdAt: string, tags: string[] = []): TestListItem {
  return { id, title, step_count: stepCount, created_at: createdAt, tags };
}

// Shell order: newest first.
const TESTS: TestListItem[] = [
  item('t5', 'Checkout happy path', 7, '2026-10-05T10:00:00Z', ['smoke']),
  item('t4', 'login negative', 2, '2026-10-04T10:00:00Z'),
  item('t3', 'Login 10 retries', 2, '2026-10-03T10:00:00Z', ['nightly']),
  item('t2', 'Login 2 retries', 0, '2026-10-02T10:00:00Z'),
  item('t1', 'API smoke', 2, '2026-10-01T10:00:00Z', ['smoke', 'Nightly-EU']),
];

const ids = (tests: readonly { id: string }[]) => tests.map(t => t.id);

describe('resolveTestListViewState', () => {
  const base = { totalCount: 5, visibleCount: 5, appliedTag: null, typedTag: '', lookupFailed: false };

  it('shows the rows when nothing is filtered', () => {
    expect(resolveTestListViewState(base)).toBe('rows');
  });

  it('says "no Tests yet" for a Project with no Tests, filter or not (AC-09)', () => {
    expect(resolveTestListViewState({ ...base, totalCount: 0, visibleCount: 0 })).toBe('empty-never');
    expect(resolveTestListViewState({ ...base, totalCount: 0, visibleCount: 0, appliedTag: 'smoke', typedTag: 'smoke' })).toBe('empty-never');
  });

  it('keeps "no match" distinct from "no Tests yet" (AC-04)', () => {
    expect(resolveTestListViewState({ ...base, visibleCount: 0, appliedTag: 'nightly', typedTag: 'nightly' })).toBe('empty-no-match');
  });

  it('reports a failed lookup as a failure, never as a match or an empty Project (AC-09)', () => {
    expect(resolveTestListViewState({ ...base, visibleCount: 0, appliedTag: 'smoke', typedTag: 'smoke', lookupFailed: true })).toBe('failed');
    expect(resolveTestListViewState({ ...base, totalCount: 0, visibleCount: 0, appliedTag: 'smoke', typedTag: 'smoke', lookupFailed: true })).toBe('failed');
  });

  it('shows a loading state while a typed tag has not been looked up yet, never the previous rows', () => {
    expect(resolveTestListViewState({ ...base, typedTag: 'smo' })).toBe('pending');
    expect(resolveTestListViewState({ ...base, visibleCount: 1, appliedTag: 'smoke', typedTag: 'smoke-eu' })).toBe('pending');
    // A new tag typed after a failure is a new lookup in flight, not the old failure.
    expect(resolveTestListViewState({ ...base, appliedTag: 'smoke', typedTag: 'nightly', lookupFailed: true })).toBe('pending');
  });

  it('compares the typed tag trimmed, the way the toolbar control looks it up', () => {
    expect(resolveTestListViewState({ ...base, visibleCount: 2, appliedTag: 'smoke', typedTag: '  smoke ' })).toBe('rows');
    expect(resolveTestListViewState({ ...base, typedTag: '   ' })).toBe('rows');
  });
});

describe('filterTestsByTag', () => {
  it('returns every Test when no filter is applied', () => {
    expect(ids(filterTestsByTag(TESTS, null))).toEqual(['t5', 't4', 't3', 't2', 't1']);
  });

  it('keeps only the matched Tests, in the shell order', () => {
    expect(ids(filterTestsByTag(TESTS, ['t1', 't5']))).toEqual(['t5', 't1']);
  });

  it('never widens the Project set: a matched id outside the Project is dropped (AC-07)', () => {
    expect(ids(filterTestsByTag(TESTS, ['t1', 'other-project-test', 'other-workspace-test']))).toEqual(['t1']);
  });

  it('returns nothing for an empty match set', () => {
    expect(filterTestsByTag(TESTS, [])).toEqual([]);
  });
});

describe('sortTestList', () => {
  it('keeps the shell order (newest first) by default', () => {
    expect(ids(sortTestList(TESTS, DEFAULT_TEST_LIST_SORT))).toEqual(['t5', 't4', 't3', 't2', 't1']);
  });

  it('sorts by name, case-insensitive and number-aware, and reverses', () => {
    expect(ids(sortTestList(TESTS, { column: 'name', direction: 'asc' }))).toEqual(['t1', 't5', 't2', 't3', 't4']);
    expect(ids(sortTestList(TESTS, { column: 'name', direction: 'desc' }))).toEqual(['t4', 't3', 't2', 't5', 't1']);
  });

  it('puts the smallest chain first, zero included (AC-05)', () => {
    const sorted = sortTestList(TESTS, { column: 'chain', direction: 'asc' });
    expect(sorted[0].id).toBe('t2');
    expect(sorted[0].step_count).toBe(0);
    expect(sorted.at(-1)?.id).toBe('t5');
  });

  it('keeps tied rows in the shell order in both directions (E10)', () => {
    expect(ids(sortTestList(TESTS, { column: 'chain', direction: 'asc' }))).toEqual(['t2', 't4', 't3', 't1', 't5']);
    expect(ids(sortTestList(TESTS, { column: 'chain', direction: 'desc' }))).toEqual(['t5', 't4', 't3', 't1', 't2']);
  });

  it('sorts by creation date both ways', () => {
    expect(ids(sortTestList(TESTS, { column: 'created', direction: 'asc' }))).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('composes with the tag filter: only matching Tests, ordered by chain (AC-05)', () => {
    const smoke = filterTestsByTag(TESTS, ['t5', 't1']);
    expect(ids(sortTestList(smoke, { column: 'chain', direction: 'asc' }))).toEqual(['t1', 't5']);
  });

  it('orders the whole set, not a window of it', () => {
    const many = Array.from({ length: 1200 }, (_, i) => item(`m${i}`, `Test ${i}`, (i * 7919) % 1000 + 1, '2026-01-01T00:00:00Z'));
    many.push(item('smallest', 'Last in, smallest chain', 0, '2026-01-01T00:00:00Z'));
    expect(sortTestList(many, { column: 'chain', direction: 'asc' })[0].id).toBe('smallest');
  });

  it('does not mutate its input', () => {
    const input = [...TESTS];
    sortTestList(input, { column: 'name', direction: 'asc' });
    expect(ids(input)).toEqual(ids(TESTS));
  });
});

describe('nextTestListSort', () => {
  it('starts a new column ascending', () => {
    expect(nextTestListSort(DEFAULT_TEST_LIST_SORT, 'chain')).toEqual({ column: 'chain', direction: 'asc' });
  });

  it('reverses the active column on a second click (AC-05)', () => {
    expect(nextTestListSort({ column: 'name', direction: 'asc' }, 'name')).toEqual({ column: 'name', direction: 'desc' });
    expect(nextTestListSort({ column: 'name', direction: 'desc' }, 'name')).toEqual({ column: 'name', direction: 'asc' });
    expect(nextTestListSort(DEFAULT_TEST_LIST_SORT, 'created')).toEqual({ column: 'created', direction: 'asc' });
  });
});

describe('parseTestListSort', () => {
  const params = (entries: Record<string, string>) => new URLSearchParams(entries);

  it('reads a valid sort from the address', () => {
    expect(parseTestListSort(params({ sort: 'chain', dir: 'asc' }))).toEqual({ column: 'chain', direction: 'asc' });
  });

  it('falls back to the default on anything unrecognised', () => {
    expect(parseTestListSort(params({}))).toEqual(DEFAULT_TEST_LIST_SORT);
    expect(parseTestListSort(params({ sort: 'tags', dir: 'asc' }))).toEqual(DEFAULT_TEST_LIST_SORT);
    expect(parseTestListSort(params({ sort: 'name', dir: 'sideways' }))).toEqual(DEFAULT_TEST_LIST_SORT);
    expect(parseTestListSort(params({ sort: 'name' }))).toEqual(DEFAULT_TEST_LIST_SORT);
  });

  it('knows the default', () => {
    expect(isDefaultTestListSort(DEFAULT_TEST_LIST_SORT)).toBe(true);
    expect(isDefaultTestListSort({ column: 'created', direction: 'asc' })).toBe(false);
  });
});

describe('testListSortSearch', () => {
  it('writes a non-default sort into the address', () => {
    expect(testListSortSearch('', { column: 'chain', direction: 'asc' })).toBe('?sort=chain&dir=asc');
  });

  it('drops sort and dir when the order is back to the default', () => {
    expect(testListSortSearch('sort=created&dir=asc', DEFAULT_TEST_LIST_SORT)).toBe('');
  });

  it('keeps every other parameter', () => {
    expect(testListSortSearch('module=m1&sort=name&dir=asc', { column: 'name', direction: 'desc' })).toBe('?module=m1&sort=name&dir=desc');
    expect(testListSortSearch('module=m1&sort=name&dir=asc', DEFAULT_TEST_LIST_SORT)).toBe('?module=m1');
  });
});

describe('copy', () => {
  it('states the chain length as a count of ATCs, zero included (AC-03)', () => {
    expect(formatChainLength(7)).toBe('7 ATCs');
    expect(formatChainLength(1)).toBe('1 ATC');
    expect(formatChainLength(0)).toBe('0 ATCs');
  });

  it('counts what is on screen, with the total beside it when filtered', () => {
    expect(formatTestListCount(12, 12, null)).toBe('12 Tests in this project');
    expect(formatTestListCount(1, 1, null)).toBe('1 Test in this project');
    expect(formatTestListCount(3, 12, 'smoke')).toBe('3 of 12 Tests carry smoke');
    expect(formatTestListCount(1, 12, 'smoke')).toBe('1 of 12 Tests carries smoke');
    expect(formatTestListCount(0, 12, 'smoke')).toBe('0 of 12 Tests carry smoke');
  });

  it('formats the creation day in UTC so server and browser agree', () => {
    expect(formatTestCreatedDate('2026-10-05T23:30:00-03:00')).toBe('2026-10-06');
    expect(formatTestCreatedDate('not a date')).toBe('—');
  });

  it('names the tag and the total in the no-match copy, and says it is not an error', () => {
    const copy = testListNoMatchDescription('nightly', 5);
    expect(copy).toContain('"nightly"');
    expect(copy).toContain('5 Tests');
    expect(copy).toContain('not an error');
  });
});
