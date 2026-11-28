import type { RunHistoryItem } from './RunHistoryView';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, mock } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: () => {}, replace: () => {}, refresh: () => {} };
const workbench = { projectId: 'project-1' };
void mock.module('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/projects/checkout/tests/test-1/runs' }));
void mock.module('@app/(app)/projects/[projectSlug]/workbench-context', () => ({ useWorkbench: () => workbench }));

const { createElement } = await import('react');
const { itFocusesTheFootWithoutScrolling } = await import('@components/load-older-focus-test-support');
const { RunHistoryView } = await import('./RunHistoryView');

function run(n: number): RunHistoryItem {
  return {
    id: `run-${n}`,
    status: 'passed',
    environment_id: 'environment-1',
    environment_name: 'Staging',
    executor_mode: 'human',
    started_at: '2026-11-27T12:00:00.000Z',
    finished_at: '2026-11-27T12:05:00.000Z',
  };
}

const totals = { passed: 3, failed: 0, aborted: 0 };
const flakiness = { sample: 3, flips: 0, aborted_skipped: 0 };

describe('BK-2711 RunHistoryView load older keeps the reading position', () => {
  itFocusesTheFootWithoutScrolling({
    render: () => createElement(RunHistoryView, {
      testId: 'test-1',
      initialOutcome: null,
      initialPage: { items: [run(1), run(2)], totals, flakiness, next_cursor: 'cursor-1' },
    }),
    lastPage: { items: [run(3)], totals, flakiness, next_cursor: null },
    loadTestId: 'run-history-load-older',
    footTestId: 'run-history-foot',
    rowsTestId: 'run-history-rows',
    rowCount: 3,
  });
});
