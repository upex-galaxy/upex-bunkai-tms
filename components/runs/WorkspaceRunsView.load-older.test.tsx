import type { WorkspaceRunItem } from '@lib/runs/workspace-runs-constants';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import('react');
const { itFocusesTheFootWithoutScrolling } = await import('@components/load-older-focus-test-support');
const { WorkspaceRunsView } = await import('./WorkspaceRunsView');

function run(n: number): WorkspaceRunItem {
  return {
    id: `run-${n}`,
    project_id: 'project-1',
    project_slug: 'checkout',
    project_name: 'Checkout',
    test_id: 'test-1',
    test_title: 'Checkout pays by card',
    environment_name: 'Staging',
    executor_mode: 'human',
    status: 'passed',
    started_at: '2026-11-27T12:00:00.000Z',
    finished_at: '2026-11-27T12:05:00.000Z',
    passed_steps: 2,
    failed_steps: 0,
    blocked_steps: 0,
  };
}

describe('BK-2711 WorkspaceRunsView load older keeps the reading position', () => {
  itFocusesTheFootWithoutScrolling({
    render: () => createElement(WorkspaceRunsView, {
      workspaceId: 'workspace-1',
      projects: [{ id: 'project-1', name: 'Checkout' }],
      environments: ['Staging'],
      initialPage: { items: [run(1), run(2)], next_cursor: 'cursor-1', workspace_run_count: 3 },
    }),
    lastPage: { items: [run(3)], next_cursor: null, workspace_run_count: 3 },
    loadTestId: 'workspace-runs-load-older',
    footTestId: 'workspace-runs-table-foot',
    rowsTestId: 'workspace-runs-rows',
    rowCount: 3,
  });
});
