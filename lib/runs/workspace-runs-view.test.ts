import { EMPTY_WORKSPACE_RUN_FILTERS } from '@lib/runs/workspace-runs-constants';
import {
  buildWorkspaceRunsParams,
  hasActiveWorkspaceRunFilters,
  resolveWorkspaceRunsViewState,
  WORKSPACE_RUNS_EMPTY_COPY,
  workspaceRunsFootText,
} from '@lib/runs/workspace-runs-view';
import { describe, expect, test } from 'bun:test';

// BK-513 — the screen's states, query and copy.

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

describe('resolveWorkspaceRunsViewState', () => {
  test('an error wins over everything, rows or not', () => {
    expect(resolveWorkspaceRunsViewState({ error: true, rowCount: 3, hasActiveFilters: false })).toBe('error');
  });

  test('no filter and no row is the empty workspace (AC-14)', () => {
    expect(resolveWorkspaceRunsViewState({ error: false, rowCount: 0, hasActiveFilters: false })).toBe('empty-workspace');
  });

  test('a filter and no row is the no-match state (AC-15)', () => {
    expect(resolveWorkspaceRunsViewState({ error: false, rowCount: 0, hasActiveFilters: true })).toBe('empty-no-match');
  });

  test('rows render as rows', () => {
    expect(resolveWorkspaceRunsViewState({ error: false, rowCount: 1, hasActiveFilters: true })).toBe('rows');
  });

  test('the two empty states never share copy', () => {
    expect(WORKSPACE_RUNS_EMPTY_COPY['empty-workspace'].title).not.toBe(WORKSPACE_RUNS_EMPTY_COPY['empty-no-match'].title);
  });
});

describe('hasActiveWorkspaceRunFilters', () => {
  test('the empty filter set is inactive and each axis activates it', () => {
    expect(hasActiveWorkspaceRunFilters(EMPTY_WORKSPACE_RUN_FILTERS)).toBe(false);
    expect(hasActiveWorkspaceRunFilters({ ...EMPTY_WORKSPACE_RUN_FILTERS, projectId: PROJECT_ID })).toBe(true);
    expect(hasActiveWorkspaceRunFilters({ ...EMPTY_WORKSPACE_RUN_FILTERS, status: ['passed'] })).toBe(true);
    expect(hasActiveWorkspaceRunFilters({ ...EMPTY_WORKSPACE_RUN_FILTERS, environment: 'staging' })).toBe(true);
    expect(hasActiveWorkspaceRunFilters({ ...EMPTY_WORKSPACE_RUN_FILTERS, mode: 'manual' })).toBe(true);
  });
});

describe('buildWorkspaceRunsParams', () => {
  test('no filter sends only the page size', () => {
    expect(buildWorkspaceRunsParams(EMPTY_WORKSPACE_RUN_FILTERS, null).toString()).toBe('limit=50');
  });

  test('every filter and the cursor travel together (AC-12, AC-13)', () => {
    const params = buildWorkspaceRunsParams(
      { projectId: PROJECT_ID, status: ['passed', 'failed'], environment: 'Staging', mode: 'automated' },
      'cursor-token',
    );
    expect(params.get('project_id')).toBe(PROJECT_ID);
    expect(params.getAll('status')).toEqual(['passed', 'failed']);
    expect(params.get('environment')).toBe('Staging');
    expect(params.get('mode')).toBe('automated');
    expect(params.get('cursor')).toBe('cursor-token');
  });
});

describe('workspaceRunsFootText', () => {
  test('says more runs load below while a next page exists', () => {
    expect(workspaceRunsFootText(50, 120, true)).toBe('50 runs shown, newest first. Older runs load below.');
  });

  test('says "all" once the whole unfiltered workspace is on screen', () => {
    expect(workspaceRunsFootText(3, 3, false)).toBe('All 3 runs in this workspace, newest first.');
  });

  test('a filtered last page states the count only', () => {
    expect(workspaceRunsFootText(1, 9, false)).toBe('1 run, newest first.');
  });
});
