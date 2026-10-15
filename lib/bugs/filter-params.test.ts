import { describe, expect, test } from 'bun:test';
import {
  bugsFiltersDiffer,
  bugsFiltersFromSearchParams,
  bugsFiltersFromState,
  bugsStateFromFilters,
  EMPTY_BUGS_FILTERS,
} from './filter-params';

// BK-443 — the Bugs list filters as URL parameters.

const MOD = '3f2b8c1e-9d4a-4b7e-8a61-2c5d9e0f7a13';
const OTHER = '7a1c5e90-2b3d-4f68-9c0e-1d2e3f4a5b6c';

describe('bugsStateFromFilters', () => {
  test('no filters is an empty state', () => {
    expect(bugsStateFromFilters(EMPTY_BUGS_FILTERS)).toEqual({});
  });

  test('writes only the axes that are set, in canonical order', () => {
    expect(bugsStateFromFilters({ moduleId: MOD, statuses: ['closed', 'open'], severities: ['P2', 'P1'] })).toEqual({
      module: MOD,
      status: 'open,closed',
      severity: 'P1,P2',
    });
  });
});

describe('bugsFiltersFromState', () => {
  test('reads the saved axes and leaves the rest empty', () => {
    expect(bugsFiltersFromState({ severity: 'P1' })).toEqual({ moduleId: null, statuses: [], severities: ['P1'] });
  });

  test('round-trips with bugsStateFromFilters', () => {
    const filters = { moduleId: MOD, statuses: ['open' as const, 'resolved' as const], severities: ['P3' as const] };
    expect(bugsFiltersFromState(bugsStateFromFilters(filters))).toEqual(filters);
  });
});

describe('bugsFiltersFromSearchParams (the server page)', () => {
  const known = new Set([MOD]);

  test('an address without filters is the unfiltered list', () => {
    expect(bugsFiltersFromSearchParams({}, known)).toEqual(EMPTY_BUGS_FILTERS);
  });

  test('reads module, status and severity from the address', () => {
    expect(bugsFiltersFromSearchParams({ module: MOD, status: 'open,in_progress', severity: 'P1' }, known)).toEqual({
      moduleId: MOD,
      statuses: ['open', 'in_progress'],
      severities: ['P1'],
    });
  });

  test('a module that is not an active module of the project falls back to all modules', () => {
    expect(bugsFiltersFromSearchParams({ module: OTHER, severity: 'P2' }, known)).toEqual({ moduleId: null, statuses: [], severities: ['P2'] });
  });

  test('junk values are ignored instead of breaking the page', () => {
    expect(bugsFiltersFromSearchParams({ module: 'nope', status: 'bogus', severity: 'P9' }, known)).toEqual(EMPTY_BUGS_FILTERS);
  });

  test('a repeated key takes its first value', () => {
    expect(bugsFiltersFromSearchParams({ severity: ['P1', 'P4'] }, known).severities).toEqual(['P1']);
  });

  test('keeps the valid items of a list and drops the invalid ones', () => {
    expect(bugsFiltersFromSearchParams({ status: 'open,bogus,closed' }, known).statuses).toEqual(['open', 'closed']);
  });

  test('ignores parameters that are not bug filters', () => {
    expect(bugsFiltersFromSearchParams({ view: 'heatmap', story: 'x' }, known)).toEqual(EMPTY_BUGS_FILTERS);
  });
});

// Back after opening a bug re-mounts the list from the server props the history
// entry was rendered with, which can be the UNFILTERED first page while the
// address (rewritten with replaceState) still carries the filters. The view
// reconciles on mount: it compares the address with the props it was given.
describe('bugsFiltersDiffer (mount reconcile)', () => {
  const known = new Set([MOD]);

  test('stale unfiltered props against a filtered address differ, so the list refetches', () => {
    const fromAddress = bugsFiltersFromSearchParams({ severity: 'P1', module: MOD }, known);
    expect(bugsFiltersDiffer(fromAddress, EMPTY_BUGS_FILTERS)).toBe(true);
  });

  test('props that already match the address do not trigger a refetch', () => {
    const fromAddress = bugsFiltersFromSearchParams({ status: 'closed,open' }, known);
    expect(bugsFiltersDiffer(fromAddress, { moduleId: null, statuses: ['open', 'closed'], severities: [] })).toBe(false);
  });

  test('an address with junk reconciles to unfiltered, matching empty props', () => {
    expect(bugsFiltersDiffer(bugsFiltersFromSearchParams({ severity: 'P9' }, known), EMPTY_BUGS_FILTERS)).toBe(false);
  });
});
