import type { SavedViewState } from '@lib/saved-views/state';
import type { BugSeverity, BugStatus } from './constants';
import { stateFromParams } from '@lib/saved-views/state';
import { BUG_SEVERITY_VALUES, BUG_STATUS_VALUES } from './constants';

// BK-443 — the Bugs list's filters as URL parameters (`module`, `status`,
// `severity`), the convention Traceability (BK-48) and Run history (BK-37)
// already follow. Shared by the server page (so a reload or a shared link
// renders the filtered first page) and the client view (which writes the
// address and builds the saved-view state). Pure, no framework imports.

export interface BugsListFilters {
  moduleId: string | null
  statuses: BugStatus[]
  severities: BugSeverity[]
}

export const EMPTY_BUGS_FILTERS: BugsListFilters = { moduleId: null, statuses: [], severities: [] };

function pick<T extends string>(csv: string | undefined, allowed: readonly T[]): T[] {
  const wanted = new Set((csv ?? '').split(','));
  return allowed.filter(v => wanted.has(v));
}

// Saved-view state (canonical, already validated) -> the view's filters.
export function bugsFiltersFromState(state: SavedViewState): BugsListFilters {
  return {
    moduleId: state.module ?? null,
    statuses: pick(state.status, BUG_STATUS_VALUES),
    severities: pick(state.severity, BUG_SEVERITY_VALUES),
  };
}

// The view's filters -> canonical saved-view state (what "Save current view"
// stores and what the address carries). Empty filters give an empty state.
export function bugsStateFromFilters(filters: BugsListFilters): SavedViewState {
  const params = new URLSearchParams();
  if (filters.moduleId !== null) { params.set('module', filters.moduleId); }
  if (filters.statuses.length > 0) { params.set('status', filters.statuses.join(',')); }
  if (filters.severities.length > 0) { params.set('severity', filters.severities.join(',')); }
  return stateFromParams('bugs', params);
}

// Next's `searchParams` (values may be arrays when a key repeats) -> filters.
// Lenient: junk is ignored, and a module that is not one of the project's
// active modules falls back to "all modules" rather than an empty list the
// member cannot explain.
export function bugsFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  knownModuleIds: ReadonlySet<string>,
): BugsListFilters {
  const params = new URLSearchParams();
  for (const key of ['module', 'status', 'severity']) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined) { params.set(key, value); }
  }
  const filters = bugsFiltersFromState(stateFromParams('bugs', params));
  return {
    ...filters,
    moduleId: filters.moduleId !== null && knownModuleIds.has(filters.moduleId) ? filters.moduleId : null,
  };
}
