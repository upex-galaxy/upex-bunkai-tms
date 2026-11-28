import type { BugsListItemResponse } from '@app/api/v1/bugs/list-response';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import('react');
const { itFocusesTheFootWithoutScrolling } = await import('@components/load-older-focus-test-support');
const { BugsListView } = await import('./BugsListView');

function bug(n: number): BugsListItemResponse {
  return {
    id: `bug-${n}`,
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    module_id: 'module-1',
    module: { id: 'module-1', name: 'Checkout', path: 'Checkout' },
    run_id: null,
    run_step_id: null,
    atc_id: null,
    title: `Bug ${n}`,
    severity: 'P3',
    status: 'open',
    description: null,
    steps_to_reproduce: 'Open the cart',
    evidence_urls: [],
    assignee_user_id: null,
    content_version: 1,
    created_by: null,
    created_at: '2026-11-27T12:00:00.000Z',
    updated_at: '2026-11-27T12:00:00.000Z',
    assignee: null,
  };
}

const aggregates = {
  by_severity: { P1: 0, P2: 0, P3: 3, P4: 0 },
  by_status: { open: 3, in_progress: 0, resolved: 0, closed: 0 },
};

describe('BK-2711 BugsListView load more keeps the reading position', () => {
  itFocusesTheFootWithoutScrolling({
    render: () => createElement(BugsListView, {
      projectId: 'project-1',
      projectSlug: 'checkout',
      modules: [],
      canCreateBug: false,
      workspaceMembers: [],
      initialPage: { data: [bug(1), bug(2)], aggregates, next_cursor: 'cursor-1' },
    }),
    lastPage: { data: [bug(3)], aggregates, next_cursor: null },
    loadTestId: 'bugs-list-load-more',
    footTestId: 'bugs-list-foot',
    rowsTestId: 'bugs-list-rows',
    rowCount: 3,
  });
});
