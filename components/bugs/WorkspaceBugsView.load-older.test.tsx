import type { WorkspaceBugItem } from '@lib/bugs/workspace-bugs-constants';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import('react');
const { itFocusesTheFootWithoutScrolling } = await import('@components/load-older-focus-test-support');
const { WorkspaceBugsView } = await import('./WorkspaceBugsView');

function bug(n: number): WorkspaceBugItem {
  return {
    id: `bug-${n}`,
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    project_slug: 'checkout',
    project_name: 'Checkout',
    module: { id: 'module-1', name: 'Cart', path: 'Cart' },
    run_id: null,
    title: `Bug ${n}`,
    severity: 'P3',
    status: 'open',
    assignee_user_id: null,
    assignee: null,
    created_at: '2026-11-27T12:00:00.000Z',
  };
}

const aggregates = {
  by_severity: { P1: 0, P2: 0, P3: 3, P4: 0 },
  by_status: { open: 3, in_progress: 0, resolved: 0, closed: 0 },
};

describe('BK-2711 WorkspaceBugsView load more keeps the reading position', () => {
  itFocusesTheFootWithoutScrolling({
    render: () => createElement(WorkspaceBugsView, {
      workspaceId: 'workspace-1',
      projects: [{ id: 'project-1', name: 'Checkout' }],
      initialPage: { data: [bug(1), bug(2)], aggregates, next_cursor: 'cursor-1', workspace_bug_count: 3 },
    }),
    lastPage: { data: [bug(3)], aggregates, next_cursor: null, workspace_bug_count: 3 },
    loadTestId: 'workspace-bugs-load-more',
    footTestId: 'workspace-bugs-table-foot',
    rowsTestId: 'workspace-bugs-rows',
    rowCount: 3,
  });
});
