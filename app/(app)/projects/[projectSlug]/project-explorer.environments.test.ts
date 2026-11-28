import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: () => {}, refresh: () => {} };
const searchParams = new URLSearchParams();
void mock.module('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));
const workbench = { testTagFilter: null, filteredTestIds: null, testTagLookupFailed: false, retryTestTagLookup: () => {} };
void mock.module('./workbench-context', () => ({
  useWorkbench: () => workbench,
}));
void mock.module('sonner', () => ({
  toast: { success: () => {}, error: () => {} },
}));
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {},
  revalidateAfterAtcCreated: async () => {},
}));

const { act, createElement } = await import('react');
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));

const { createRoot } = await import('react-dom/client');
const { ProjectExplorer } = await import('./project-explorer');

const ENVIRONMENT = { id: 'env-1', name: 'Staging', created_at: '2026-11-05T10:30:00+00:00' };

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

async function render(flags: { canCreate: boolean, canRemoveEnvironments: boolean }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(ProjectExplorer, {
      projectId: 'p1',
      projectSlug: 'web',
      projectName: 'Web',
      tree: [],
      environments: [ENVIRONMENT],
      ...flags,
    }));
  });
  await act(async () => {
    container.querySelector('[data-testid="explorer-environments-group"] button[aria-expanded]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  mounted.push({ container, root });
  return container;
}

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function openMenu(container: HTMLElement) {
  await act(async () => {
    byTestId(container, 'environment-menu-env-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(async () => {
  for (const { container, root } of mounted) {
    await act(async () => { root.unmount(); });
    container.remove();
  }
  mounted = [];
});

describe('BK-2712 environment menu on a read-only project', () => {
  test('offers Remove, which the server allows, and not Rename, which it refuses', async () => {
    const container = await render({ canCreate: false, canRemoveEnvironments: true });

    expect(byTestId(container, 'environment-menu-env-1')).not.toBeNull();
    await openMenu(container);

    expect(byTestId(container, 'environment-remove-env-1')).not.toBeNull();
    expect(byTestId(container, 'environment-rename-env-1')).toBeNull();
    expect(byTestId(container, 'environment-add')).toBeNull();
  });

  test('offers no menu to a viewer', async () => {
    const container = await render({ canCreate: false, canRemoveEnvironments: false });

    expect(byTestId(container, 'explorer-environment-env-1')).not.toBeNull();
    expect(byTestId(container, 'environment-menu-env-1')).toBeNull();
  });

  test('keeps Rename and Remove on a writable project', async () => {
    const container = await render({ canCreate: true, canRemoveEnvironments: true });

    await openMenu(container);

    expect(byTestId(container, 'environment-rename-env-1')).not.toBeNull();
    expect(byTestId(container, 'environment-remove-env-1')).not.toBeNull();
  });
});
