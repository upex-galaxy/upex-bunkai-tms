import type { ModuleTreeNode } from '@lib/types';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-601 — the explorer's wiring of the archived opt-in: its notices, and the archive
// confirmation still reading the live tree with archived rows on screen (AC-10).
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stable doubles, like Next's: a fresh object per render loops any hook that lists them.
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
}));

const { act, createElement } = await import('react');
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));

const { createRoot } = await import('react-dom/client');
const { ProjectExplorer } = await import('./project-explorer');

const AT = '2026-11-05T10:30:00+00:00';
const PROJECT = 'p1';

function node(id: string, name: string, parent: string | null, archivedAt: string | null): ModuleTreeNode {
  return {
    id,
    project_id: PROJECT,
    parent_module_id: parent,
    path: id,
    name,
    position: 0,
    description: null,
    created_at: AT,
    archived_at: archivedAt,
    children: [],
    user_stories: [],
    atcs: [],
  };
}

const LIVE_TREE = [node('live', 'Billing', null, null)];

function row(id: string, name: string, parent: string | null, archivedAt: string | null) {
  const { children: _c, user_stories: _s, atcs: _a, ...rest } = node(id, name, parent, archivedAt);
  return { ...rest, archive: archivedAt === null ? null : { archived_at: archivedAt, archived_by: null, archived_with: null } };
}

const realFetch = globalThis.fetch;
let responses: Response[] = [];
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(ProjectExplorer, {
      projectId: PROJECT,
      projectSlug: 'web',
      projectName: 'Web',
      tree: LIVE_TREE,
      canCreate: true,
    }));
  });
  mounted.push({ container, root });
  return container;
}

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function click(element: HTMLElement | null) {
  await act(async () => {
    element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  responses = [];
  globalThis.fetch = (async (_input: RequestInfo | URL) => {
    const next = responses.shift();
    if (!next) { throw new Error('unexpected fetch'); }
    return next;
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  for (const { container, root } of mounted) {
    await act(async () => { root.unmount(); });
    container.remove();
  }
  mounted = [];
});

describe('ProjectExplorer archived opt-in', () => {
  test('starts off, and reads as usual with no fetch', async () => {
    const container = await render();
    expect(byTestId(container, 'explorer-include-archived')?.getAttribute('aria-pressed')).toBe('false');
    expect(byTestId(container, 'explorer-archived-empty')).toBeNull();
  });

  test('says nothing is archived, without reading as an error', async () => {
    responses = [json({ modules: [row('live', 'Billing', null, null)], user_stories: [], acceptance_criteria: [], archived_atcs: [] })];
    const container = await render();

    await click(byTestId(container, 'explorer-include-archived'));

    expect(byTestId(container, 'explorer-archived-empty')?.textContent).toBe('Nothing in this project is archived.');
    expect(byTestId(container, 'explorer-archived-error')).toBeNull();
    expect(byTestId(container, 'module-row-live')).not.toBeNull();
  });

  test('names a failed read and keeps the live tree on screen', async () => {
    responses = [json({ error: { code: 'internal_error', message: 'boom' } }, 500)];
    const container = await render();

    await click(byTestId(container, 'explorer-include-archived'));

    const error = byTestId(container, 'explorer-archived-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Could not load the archived rows.');
    expect(error?.textContent).toContain('boom');
    expect(byTestId(container, 'module-row-live')).not.toBeNull();
  });

  test('the archive confirmation does not count archived children', async () => {
    responses = [json({
      modules: [row('live', 'Billing', null, null), row('gone', 'Old invoices', 'live', AT)],
      user_stories: [],
      acceptance_criteria: [],
      archived_atcs: [],
    })];
    const container = await render();
    await click(byTestId(container, 'explorer-include-archived'));
    expect(byTestId(container, 'module-archived-gone')).not.toBeNull();

    await click(byTestId(container, 'module-delete-live'));

    const dialog = byTestId(container, 'delete-module-dialog');
    expect(dialog?.textContent).toContain('It is retained, not destroyed');
    expect(dialog?.textContent).not.toContain('sub-module');
  });

  test('opens the restore confirmation for an archived Module', async () => {
    responses = [json({
      modules: [row('live', 'Billing', null, null), row('gone', 'Old invoices', 'live', AT)],
      user_stories: [],
      acceptance_criteria: [],
      archived_atcs: [],
    })];
    const container = await render();
    await click(byTestId(container, 'explorer-include-archived'));

    await click(byTestId(container, 'module-restore-gone'));

    expect(byTestId(container, 'restore-module-dialog')?.textContent).toContain('Old invoices');
  });
});
