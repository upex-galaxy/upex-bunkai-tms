import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-1618 — the workbench context value keeps one identity across the
// provider's own mount effects. A new value on that re-render is a context
// change above every Suspense boundary of the page; on a full page load React
// renders a boundary it has not hydrated yet again on the client, next to the
// server copy still waiting in its hidden streaming container (two Tests lists).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stable doubles, like Next's: a fresh object per render loops any hook that lists them.
const router = { push: () => {}, replace: () => {}, refresh: () => {} };
const params = {};
void mock.module('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/projects/web/tests',
  useParams: () => params,
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { WorkbenchProvider, useWorkbench } = await import('./workbench-context');

type Workbench = ReturnType<typeof useWorkbench>;

// Props are module constants so the provider sees the same data on every render,
// as it does under the layout that loads them once.
const DATA = {
  projectId: 'p1',
  projectSlug: 'web',
  projectName: 'Web',
  workspaceName: 'Acme',
  tree: [],
  rows: [],
  tests: [],
  environments: [],
  canCreate: true,
};

let mounted: { container: HTMLElement, root: { unmount: () => void } } | null = null;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

async function renderProbe() {
  const seen: Workbench[] = [];
  function Probe() {
    seen.push(useWorkbench());
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(createElement(WorkbenchProvider, { ...DATA, children: createElement(Probe) }));
  });
  return seen;
}

describe('WorkbenchProvider context value', () => {
  test('keeps one identity across the provider\'s mount effects', async () => {
    const seen = await renderProbe();
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(1);
  });

  test('still hands consumers a new value when workbench state changes', async () => {
    const seen = await renderProbe();
    const first = seen[seen.length - 1];
    await act(async () => { first.setView('table'); });
    const last = seen[seen.length - 1];
    expect(last).not.toBe(first);
    expect(last.view).toBe('table');
  });
});
