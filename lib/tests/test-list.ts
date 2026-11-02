// BK-666 — the Project Tests list's view model: which Tests it shows, in what
// order, which of its five states it is in, and the words it uses. Pure, so the
// rules are pinned by unit tests and the view only draws.
//
// The list never resolves its own set. It receives the exact array the project
// shell already resolved for the explorer's Tests group (BK-620's ALL-match
// scoping), and narrows it with the toolbar tag filter's id set. That is what
// keeps AC-07's "one scoping rule" mechanically true.

export interface TestListItem {
  id: string
  title: string
  created_at: string
  step_count: number
  tags: string[]
}

export type TestListSortColumn = 'name' | 'chain' | 'created';
export type TestListSortDirection = 'asc' | 'desc';

export interface TestListSort {
  column: TestListSortColumn
  direction: TestListSortDirection
}

// The shell hands the Tests over newest first (created_at desc, id desc), so the
// default order IS the input order and needs no reshuffle.
export const DEFAULT_TEST_LIST_SORT: TestListSort = { column: 'created', direction: 'desc' };

const SORT_COLUMNS: readonly TestListSortColumn[] = ['name', 'chain', 'created'];

export type TestListViewState
  = | 'failed' // the tag lookup failed: say so, offer Retry, never show the unfiltered set
    | 'pending' // a tag is typed but its lookup has not answered: never show stale rows
    | 'empty-never' // the Project has no Tests at all
    | 'empty-no-match' // Tests exist, none carries the tag
    | 'rows';

export interface TestListViewStateInput {
  totalCount: number
  visibleCount: number
  // The tag the lookup last answered for (null = no filter applied).
  appliedTag: string | null
  // What the toolbar control currently holds, untrimmed.
  typedTag: string
  lookupFailed: boolean
}

// Order matters: a failure outranks everything (AC-09, the list must never pass
// off the unfiltered set as a match); a typed tag that has not been looked up
// yet outranks the rows of the previous filter; and "no Tests yet" outranks
// "no match", because a filter over an empty Project still describes an empty
// Project.
export function resolveTestListViewState(input: TestListViewStateInput): TestListViewState {
  const typed = input.typedTag.trim();
  if (typed !== (input.appliedTag ?? '')) {
    return 'pending';
  }
  if (input.lookupFailed) {
    return 'failed';
  }
  if (input.totalCount === 0) {
    return 'empty-never';
  }
  if (input.visibleCount === 0) {
    return 'empty-no-match';
  }
  return 'rows';
}

// Narrows the Project's Tests to the tag lookup's id set. The lookup is
// workspace-scoped, so an id it returns that is not in the Project set is
// dropped: the list never widens what the Project exposes (AC-07, AC-08).
// `null` = no filter.
export function filterTestsByTag<T extends { id: string }>(tests: readonly T[], matchedIds: readonly string[] | null): T[] {
  if (matchedIds === null) {
    return [...tests];
  }
  const matched = new Set(matchedIds);
  return tests.filter(t => matched.has(t.id));
}

const NAME_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function compareBy(column: TestListSortColumn, a: TestListItem, b: TestListItem): number {
  if (column === 'name') {
    return NAME_COLLATOR.compare(a.title, b.title);
  }
  if (column === 'chain') {
    return a.step_count - b.step_count;
  }
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

// Orders the WHOLE filtered set (AC-05): the caller passes every visible Test,
// never a page of them. Ties keep the input order whatever the direction, so
// rows that compare equal never reshuffle (E10).
export function sortTestList<T extends TestListItem>(tests: readonly T[], sort: TestListSort): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return tests
    .map((test, index) => ({ test, index }))
    .sort((a, b) => (compareBy(sort.column, a.test, b.test) * sign) || (a.index - b.index))
    .map(entry => entry.test);
}

// A header click: a new column starts ascending (smallest chain first, A to Z,
// oldest first); the active column flips.
export function nextTestListSort(current: TestListSort, column: TestListSortColumn): TestListSort {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: 'asc' };
}

// The sort lives in the address (`?sort=chain&dir=asc`) so Back from a Test
// restores it. Anything unrecognised falls back to the default order.
export function parseTestListSort(params: { get: (key: string) => string | null }): TestListSort {
  const column = params.get('sort');
  const direction = params.get('dir');
  if (!SORT_COLUMNS.includes(column as TestListSortColumn) || (direction !== 'asc' && direction !== 'desc')) {
    return DEFAULT_TEST_LIST_SORT;
  }
  return { column: column as TestListSortColumn, direction };
}

// The address after a sort change: `sort` / `dir` set, or dropped when the
// order is back to the default; every other parameter is kept. Returns the
// search string with its leading `?`, or '' when nothing is left.
export function testListSortSearch(currentSearch: string, next: TestListSort): string {
  const params = new URLSearchParams(currentSearch);
  if (isDefaultTestListSort(next)) {
    params.delete('sort');
    params.delete('dir');
  }
  else {
    params.set('sort', next.column);
    params.set('dir', next.direction);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function isDefaultTestListSort(sort: TestListSort): boolean {
  return sort.column === DEFAULT_TEST_LIST_SORT.column && sort.direction === DEFAULT_TEST_LIST_SORT.direction;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

// AC-03 — the chain length, stated as a count of ATCs; zero is a legitimate
// value and reads as zero.
export function formatChainLength(stepCount: number): string {
  return `${stepCount} ${plural(stepCount, 'ATC', 'ATCs')}`;
}

// The count follows the filter (business rule): the first number is what is on
// screen; with a tag applied the Project total stays beside it.
export function formatTestListCount(visibleCount: number, totalCount: number, appliedTag: string | null): string {
  if (appliedTag === null) {
    return `${visibleCount} ${plural(visibleCount, 'Test', 'Tests')} in this project`;
  }
  return `${visibleCount} of ${totalCount} ${plural(totalCount, 'Test', 'Tests')} ${plural(visibleCount, 'carries', 'carry')} ${appliedTag}`;
}

// The creation date as a UTC calendar day: the same text on the server render
// and in the browser, whatever the viewer's time zone.
export function formatTestCreatedDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return '—';
  }
  return new Date(time).toISOString().slice(0, 10);
}

export const TEST_LIST_EMPTY_TITLE = 'No Tests yet';
export const TEST_LIST_EMPTY_DESCRIPTION_CAN_CREATE
  = 'A Test chains this project\'s ATCs into one ordered run. Build the first one from the ATCs you already have.';
export const TEST_LIST_EMPTY_DESCRIPTION_READ_ONLY = 'No Test has been built for this project yet.';
export const TEST_LIST_NO_MATCH_TITLE = 'No Test carries this tag';
export function testListNoMatchDescription(tag: string, totalCount: number): string {
  return `None of this project's ${totalCount} ${plural(totalCount, 'Test', 'Tests')} carries "${tag}". This is a filter result, not an error. Clear the tag to see every Test again.`;
}
export const TEST_LIST_FAILED_TITLE = 'Could not load the Tests with this tag.';
export const TEST_LIST_FAILED_DESCRIPTION
  = 'The tag lookup did not answer, so this list is not showing a filtered result. Nothing was changed.';
