import type { RunReportItem } from './ProjectRunsReportView';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import('react');
const { itFocusesTheFootWithoutScrolling } = await import('@components/load-older-focus-test-support');
const { ProjectRunsReportView } = await import('./ProjectRunsReportView');

function run(n: number): RunReportItem {
  return {
    id: `run-${n}`,
    test_id: 'test-1',
    test_title: 'Checkout pays by card',
    module_id: null,
    module_name: null,
    environment_id: 'environment-1',
    environment_name: 'Staging',
    executor_mode: 'human',
    status: 'passed',
    started_at: '2026-11-27T12:00:00.000Z',
    finished_at: '2026-11-27T12:05:00.000Z',
  };
}

const totals = { passed: 3, failed: 0, manual: 3, automated: 0 };

describe('BK-2711 ProjectRunsReportView load older keeps the reading position', () => {
  itFocusesTheFootWithoutScrolling({
    render: () => createElement(ProjectRunsReportView, {
      projectId: 'project-1',
      modules: [],
      initialPage: { items: [run(1), run(2)], totals, next_cursor: 'cursor-1' },
    }),
    lastPage: { items: [run(3)], totals, next_cursor: null },
    loadTestId: 'report-load-older',
    footTestId: 'report-table-foot',
    rowsTestId: 'report-rows',
    rowCount: 3,
  });
});
