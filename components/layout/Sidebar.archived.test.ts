import type { ModuleTreeNode, UserStoryWithChildren } from '@lib/types';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-601 — how the explorer tree shows an archived row: marked on its face, with when
// and who, offering Restore to a writer and nothing that edits it to anyone.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One stable router, like Next's.
const router = { push: () => {}, refresh: () => {} };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));

const { act, createElement } = await import('react');
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));

const { createRoot } = await import('react-dom/client');
const { Sidebar } = await import('@components/layout/Sidebar');

const AT = '2026-11-05T10:30:00+00:00';
const INFO = { archived_at: AT, archived_by: { user_id: 'u1', email: 'ana@example.com' }, archived_with: null };

const CRITERION = {
  id: 'c1',
  user_story_id: 's1',
  title: 'Totals add up',
  description: null,
  position: 1,
  created_at: AT,
  archived_at: AT,
  archive: { archived_at: AT, archived_by: INFO.archived_by, archived_with: 'Checkout' },
};

const STORY: UserStoryWithChildren = {
  id: 's1',
  module_id: 'gone',
  project_id: 'p',
  title: 'Pay by card',
  description: null,
  external_id: null,
  external_url: null,
  status: 'draft',
  created_at: AT,
  archived_at: AT,
  archive: { archived_at: AT, archived_by: INFO.archived_by, archived_with: 'Checkout' },
  acceptance_criteria: [CRITERION],
  atcs: [],
};

function node(id: string, name: string, archivedAt: string | null, extra: Partial<ModuleTreeNode> = {}): ModuleTreeNode {
  return {
    id,
    project_id: 'p',
    parent_module_id: null,
    path: id,
    name,
    position: 0,
    description: null,
    created_at: AT,
    archived_at: archivedAt,
    children: [],
    user_stories: [],
    atcs: [],
    ...extra,
  };
}

const TREE = [
  node('live', 'Billing', null),
  node('gone', 'Checkout', AT, { archive: INFO, user_stories: [STORY] }),
];

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let toggles = 0;
let restores: string[] = [];

async function render(canCreate: boolean, tree: ModuleTreeNode[] = TREE, pressed = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Sidebar, {
      projectSlug: 'web',
      projectName: 'Web',
      tree,
      canCreate,
      includeArchived: pressed,
      onToggleIncludeArchived: () => { toggles += 1; },
      onRestoreModule: (target: ModuleTreeNode) => { restores.push(target.id); },
      onAddSubModule: () => {},
      onRenameModule: () => {},
      onMoveModule: () => {},
      onDeleteModule: () => {},
      onNewUserStory: () => {},
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

async function openContextMenu(row: HTMLElement) {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
  });
}

afterEach(async () => {
  for (const { container, root } of mounted) {
    await act(async () => { root.unmount(); });
    container.remove();
  }
  mounted = [];
  toggles = 0;
  restores = [];
});

describe('Sidebar archived rows', () => {
  test('marks an archived Module and shows when and who; a live one stays unmarked', async () => {
    const container = await render(true);

    expect(byTestId(container, 'module-archived-gone')?.textContent).toBe('Archived');
    expect(byTestId(container, 'module-archive-info-gone')?.textContent).toBe('2026-11-05 10:30 · ana@example.com');
    expect(byTestId(container, 'module-archived-live')).toBeNull();
  });

  test('marks an archived User Story and Criterion, and says what they went down with', async () => {
    const container = await render(true);

    expect(byTestId(container, 'story-archived-s1')?.textContent).toBe('Archived');
    expect(byTestId(container, 'story-archive-info-s1')?.textContent).toBe('2026-11-05 10:30 · ana@example.com · with Checkout');

    await click(byTestId(container, 'story-toggle-s1'));

    expect(byTestId(container, 'ac-archived-c1')?.textContent).toBe('Archived');
    expect((byTestId(container, 'ac-row-c1') as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId(container, 'ac-archive-info-c1')?.textContent).toContain('with Checkout');
  });

  test('offers a writer Restore and no edit on an archived Module; a live Module keeps its actions', async () => {
    const container = await render(true);

    expect(byTestId(container, 'module-add-sub-gone')).toBeNull();
    expect(byTestId(container, 'module-rename-gone')).toBeNull();
    expect(byTestId(container, 'module-delete-gone')).toBeNull();
    expect(byTestId(container, 'story-edit-s1')).toBeNull();
    expect(byTestId(container, 'module-rename-live')).not.toBeNull();

    await click(byTestId(container, 'module-restore-gone'));
    expect(restores).toEqual(['gone']);
  });

  test('offers a read-only member no restore, in the row or the menu', async () => {
    const container = await render(false);

    expect(byTestId(container, 'module-archived-gone')).not.toBeNull();
    expect(byTestId(container, 'module-restore-gone')).toBeNull();

    await openContextMenu(byTestId(container, 'module-row-gone')!);
    expect(byTestId(container, 'ctx-restore')).toBeNull();
    expect(byTestId(container, 'ctx-copy-id')).not.toBeNull();
  });

  test('the context menu of an archived Module holds Restore and Copy ID, nothing else', async () => {
    const container = await render(true);

    await openContextMenu(byTestId(container, 'module-row-gone')!);

    const menu = byTestId(container, 'explorer-context-menu')!;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(i => i.getAttribute('data-testid'))).toEqual(['ctx-restore', 'ctx-copy-id']);
    await click(byTestId(container, 'ctx-restore'));
    expect(restores).toEqual(['gone']);
  });

  test('keeps the toggle available in a tree with no ATCs, and reports its state', async () => {
    const container = await render(true, TREE, false);
    const toggle = byTestId(container, 'explorer-include-archived')!;

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(byTestId(container, 'explorer-filter-all')).toBeNull();
    await click(toggle);
    expect(toggles).toBe(1);
  });
});
