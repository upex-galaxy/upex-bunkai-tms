import type { WorkspaceBugItem } from '@lib/bugs/workspace-bugs-constants';
import { EMPTY_WORKSPACE_BUG_FILTERS } from '@lib/bugs/workspace-bugs-constants';
import {
  buildWorkspaceBugsParams,
  formatWorkspaceBugRow,
  hasActiveWorkspaceBugFilters,
  resolveWorkspaceBugsViewState,
  WORKSPACE_BUGS_EMPTY_COPY,
  WORKSPACE_BUGS_ERROR_MESSAGE,
  workspaceBugsFootText,
} from '@lib/bugs/workspace-bugs-view';
import { describe, expect, test } from 'bun:test';

// BK-555 — the pure half of the `/bugs` screen: state selection, the query a
// filter set becomes, the copy, and the words on each row.

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function bug(overrides: Partial<WorkspaceBugItem> = {}): WorkspaceBugItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    workspace_id: '11111111-1111-4111-8111-111111111111',
    project_id: PROJECT_ID,
    project_slug: 'checkout',
    project_name: 'Checkout',
    module: { id: '55555555-5555-4555-8555-555555555555', name: 'Card', path: 'payments/card' },
    run_id: null,
    title: 'Card form rejects a valid card',
    severity: 'P1',
    status: 'in_progress',
    assignee_user_id: null,
    assignee: null,
    created_at: '2026-11-17T10:00:00+00:00',
    ...overrides,
  };
}

describe('resolveWorkspaceBugsViewState', () => {
  test('an error wins over everything (AC-17)', () => {
    expect(resolveWorkspaceBugsViewState({ error: true, rowCount: 5, hasActiveFilters: true })).toBe('error');
  });

  test('rows, then empty workspace vs no match by whether a filter is applied (AC-14, AC-15)', () => {
    expect(resolveWorkspaceBugsViewState({ error: false, rowCount: 1, hasActiveFilters: true })).toBe('rows');
    expect(resolveWorkspaceBugsViewState({ error: false, rowCount: 0, hasActiveFilters: false })).toBe('empty-workspace');
    expect(resolveWorkspaceBugsViewState({ error: false, rowCount: 0, hasActiveFilters: true })).toBe('empty-no-match');
  });

  test('the empty, no-match and error copy never coincide, and none of the empty copy reads as an error', () => {
    const empty = WORKSPACE_BUGS_EMPTY_COPY['empty-workspace'];
    const noMatch = WORKSPACE_BUGS_EMPTY_COPY['empty-no-match'];
    expect(new Set([empty.title, noMatch.title, WORKSPACE_BUGS_ERROR_MESSAGE]).size).toBe(3);
    expect(`${empty.title} ${empty.description}`).not.toMatch(/could not|failed|error/i);
    expect(empty.description).toContain('archived modules');
  });
});

describe('hasActiveWorkspaceBugFilters', () => {
  test('any one of the three groups counts as a filter', () => {
    expect(hasActiveWorkspaceBugFilters(EMPTY_WORKSPACE_BUG_FILTERS)).toBe(false);
    expect(hasActiveWorkspaceBugFilters({ ...EMPTY_WORKSPACE_BUG_FILTERS, projectId: PROJECT_ID })).toBe(true);
    expect(hasActiveWorkspaceBugFilters({ ...EMPTY_WORKSPACE_BUG_FILTERS, statuses: ['open'] })).toBe(true);
    expect(hasActiveWorkspaceBugFilters({ ...EMPTY_WORKSPACE_BUG_FILTERS, severities: ['P4'] })).toBe(true);
  });
});

describe('buildWorkspaceBugsParams', () => {
  test('unfiltered first page asks only for the page size', () => {
    expect(buildWorkspaceBugsParams(EMPTY_WORKSPACE_BUG_FILTERS, null).toString()).toBe('limit=50');
  });

  test('every filter travels with the cursor, as the API\'s comma lists', () => {
    const params = buildWorkspaceBugsParams({ projectId: PROJECT_ID, statuses: ['open', 'resolved'], severities: ['P1', 'P2'] }, 'tok');
    expect(params.get('project_id')).toBe(PROJECT_ID);
    expect(params.get('status')).toBe('open,resolved');
    expect(params.get('severity')).toBe('P1,P2');
    expect(params.get('cursor')).toBe('tok');
  });
});

describe('workspaceBugsFootText', () => {
  test('while more pages exist it says how many of the filtered total are shown', () => {
    expect(workspaceBugsFootText(50, 120, true)).toBe('50 of 120 defects shown, most severe first. More load below.');
  });

  test('on the last page it says all are shown', () => {
    expect(workspaceBugsFootText(1, 1, false)).toBe('All 1 defect shown, most severe first.');
    expect(workspaceBugsFootText(3, 3, false)).toBe('All 3 defects shown, most severe first.');
  });
});

describe('formatWorkspaceBugRow', () => {
  test('carries the Project, the full module path, severity and status in words (AC-05)', () => {
    const row = formatWorkspaceBugRow(bug());
    expect(row.projectName).toBe('Checkout');
    expect(row.modulePath).toBe('payments/card');
    expect(row.severityLabel).toBe('Critical');
    expect(row.statusLabel).toBe('In progress');
  });

  test('opens the record inside its owning Project (AC-23)', () => {
    expect(formatWorkspaceBugRow(bug()).href).toBe('/projects/checkout/bugs/33333333-3333-4333-8333-333333333333');
    expect(formatWorkspaceBugRow(bug({ project_slug: null })).href).toBeNull();
  });

  test('a defect with no Run reads as filed manually; a run-linked one names its Run (AC-18)', () => {
    expect(formatWorkspaceBugRow(bug()).originLabel).toBe('Manual');
    const fromRun = formatWorkspaceBugRow(bug({ run_id: 'abcdef12-3456-4789-8abc-def123456789' }));
    expect(fromRun.originLabel).toBe('Run abcdef12');
    expect(fromRun.fromRun).toBe(true);
  });

  test('the assignee reads as an email, Assigned when it cannot be resolved, or Unassigned', () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    expect(formatWorkspaceBugRow(bug()).assigneeLabel).toBe('Unassigned');
    expect(formatWorkspaceBugRow(bug({ assignee_user_id: userId, assignee: { user_id: userId, email: 'mateo@example.com' } })).assigneeLabel).toBe('mateo@example.com');
    expect(formatWorkspaceBugRow(bug({ assignee_user_id: userId, assignee: { user_id: userId, email: null } })).assigneeLabel).toBe('Assigned');
  });
});
