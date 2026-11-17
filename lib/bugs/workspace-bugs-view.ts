import type { BugListRow } from '@lib/bugs/list-view';
import type { WorkspaceBugFilters, WorkspaceBugItem } from '@lib/bugs/workspace-bugs-constants';
import { formatBugListRow } from '@lib/bugs/list-view';
import { WORKSPACE_BUGS_PAGE_SIZE } from '@lib/bugs/workspace-bugs-constants';

// BK-555 — the pure half of the workspace Bug Reports index: which state the
// screen is in, the query string a filter set becomes, the copy of each state
// and the row's words. Zero Zod, so the `'use client'` view can import it.

export type WorkspaceBugsViewState = 'error' | 'empty-workspace' | 'empty-no-match' | 'rows';

export const WORKSPACE_BUGS_ERROR_MESSAGE = 'Could not load the workspace\'s defects.';

// No filter applied and no row = nothing to show in the workspace (AC-14). A
// filter applied and no row = nothing matches (AC-15). The two never share
// copy, and neither reads as the error state.
export function resolveWorkspaceBugsViewState(input: { error: boolean, rowCount: number, hasActiveFilters: boolean }): WorkspaceBugsViewState {
  if (input.error) { return 'error'; }
  if (input.rowCount > 0) { return 'rows'; }
  return input.hasActiveFilters ? 'empty-no-match' : 'empty-workspace';
}

export function hasActiveWorkspaceBugFilters(filters: WorkspaceBugFilters): boolean {
  return filters.projectId !== null || filters.statuses.length > 0 || filters.severities.length > 0;
}

// The API query for one page. The filters travel with every page, so "Load
// more defects" never drops them, and Retry re-sends them (AC-17).
export function buildWorkspaceBugsParams(filters: WorkspaceBugFilters, cursor: string | null): URLSearchParams {
  const params = new URLSearchParams({ limit: String(WORKSPACE_BUGS_PAGE_SIZE) });
  if (filters.projectId !== null) { params.set('project_id', filters.projectId); }
  if (filters.statuses.length > 0) { params.set('status', filters.statuses.join(',')); }
  if (filters.severities.length > 0) { params.set('severity', filters.severities.join(',')); }
  if (cursor !== null) { params.set('cursor', cursor); }
  return params;
}

// The empty copy stays true when every defect sits on an archived module
// (AI Product Owner ruling Q3 on BK-555): it never counts the hidden ones.
export const WORKSPACE_BUGS_EMPTY_COPY: Record<'empty-workspace' | 'empty-no-match', { title: string, description: string }> = {
  'empty-workspace': {
    title: 'No defects to show',
    description: 'Defects filed in any project of this workspace are listed here. Defects on archived modules are not.',
  },
  'empty-no-match': {
    title: 'No defects match these filters',
    description: 'Nothing in this workspace matches the current filters. This is not an error.',
  },
};

// The table foot. "Load more defects" sits above it while more pages exist.
export function workspaceBugsFootText(shown: number, filteredTotal: number, hasMore: boolean): string {
  const noun = filteredTotal === 1 ? 'defect' : 'defects';
  if (hasMore) {
    return `${shown} of ${filteredTotal} ${noun} shown, most severe first. More load below.`;
  }
  return `All ${shown} ${shown === 1 ? 'defect' : 'defects'} shown, most severe first.`;
}

export interface WorkspaceBugRow extends BugListRow {
  projectName: string
  href: string | null
  // AC-18: a defect with no Run reads as filed manually, never as a dash.
  originLabel: string
  fromRun: boolean
  assigneeLabel: string
}

// Severity and status words and tokens come from the Project list's own
// formatter, so the two screens can never word the same defect differently.
export function formatWorkspaceBugRow(bug: WorkspaceBugItem): WorkspaceBugRow {
  const base = formatBugListRow(bug);
  return {
    ...base,
    projectName: bug.project_name ?? 'Unknown project',
    href: bug.project_slug === null ? null : `/projects/${bug.project_slug}/bugs/${bug.id}`,
    originLabel: bug.run_id === null ? 'Manual' : `Run ${bug.run_id.slice(0, 8)}`,
    fromRun: bug.run_id !== null,
    assigneeLabel: bug.assignee === null ? 'Unassigned' : (bug.assignee.email ?? 'Assigned'),
  };
}
