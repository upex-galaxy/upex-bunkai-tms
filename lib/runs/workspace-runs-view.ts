import type { WorkspaceRunFilters } from '@lib/runs/workspace-runs-constants';
import { WORKSPACE_RUNS_PAGE_SIZE } from '@lib/runs/workspace-runs-constants';

// BK-513 — the pure half of the workspace Runs index screen: which state it is
// in, the query string a filter set becomes, and the copy of each state. Zero
// Zod, so the `'use client'` view can import it.

export type WorkspaceRunsViewState = 'error' | 'empty-workspace' | 'empty-no-match' | 'rows';

export const WORKSPACE_RUNS_ERROR_MESSAGE = 'Could not load the workspace\'s runs.';

// No filter applied and no row = a workspace that never ran anything (AC-14).
// A filter applied and no row = nothing matches (AC-15). The two never share
// copy, and neither reads as the error state.
export function resolveWorkspaceRunsViewState(input: { error: boolean, rowCount: number, hasActiveFilters: boolean }): WorkspaceRunsViewState {
  if (input.error) { return 'error'; }
  if (input.rowCount > 0) { return 'rows'; }
  return input.hasActiveFilters ? 'empty-no-match' : 'empty-workspace';
}

export function hasActiveWorkspaceRunFilters(filters: WorkspaceRunFilters): boolean {
  return filters.projectId !== null || filters.status.length > 0 || filters.environment !== null || filters.mode !== null;
}

// The API query for one page. The filters travel with every page, so "load
// older" never drops them.
export function buildWorkspaceRunsParams(filters: WorkspaceRunFilters, cursor: string | null): URLSearchParams {
  const params = new URLSearchParams({ limit: String(WORKSPACE_RUNS_PAGE_SIZE) });
  if (filters.projectId !== null) { params.set('project_id', filters.projectId); }
  for (const status of filters.status) { params.append('status', status); }
  if (filters.environment !== null) { params.set('environment', filters.environment); }
  if (filters.mode !== null) { params.set('mode', filters.mode); }
  if (cursor !== null) { params.set('cursor', cursor); }
  return params;
}

export const WORKSPACE_RUNS_EMPTY_COPY: Record<'empty-workspace' | 'empty-no-match', { title: string, description: string }> = {
  'empty-workspace': {
    title: 'No runs yet',
    description: 'Runs from every project in this workspace will be listed here once someone starts one.',
  },
  'empty-no-match': {
    title: 'No runs match these filters',
    description: 'Nothing in this workspace matches the current filters. This is not an error.',
  },
};

// The table foot. "Load older runs" sits above it while more pages exist, so
// the count is always "so far" until the last page arrives.
export function workspaceRunsFootText(shown: number, total: number | null, hasMore: boolean): string {
  const noun = shown === 1 ? 'run' : 'runs';
  if (hasMore) {
    return `${shown} ${noun} shown, newest first. Older runs load below.`;
  }
  if (total !== null && total === shown) {
    return `All ${shown} ${noun} in this workspace, newest first.`;
  }
  return `${shown} ${noun}, newest first.`;
}
