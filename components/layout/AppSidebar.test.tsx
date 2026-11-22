import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// BK-2139 — the account block's primary line shows the saved display name,
// while the trigger's tooltip and the menu's "Signed in as" keep the email.
// Scoped to that change only. No browser and no server are involved, so this
// is NOT live-UI evidence.
GlobalRegistrator.register();
// React schedules the Radix menu's passive-effect cleanup on a later macrotask;
// it must run before `window` is torn down, or it throws between tests.
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await GlobalRegistrator.unregister();
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROUTER = { push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const AUTH = { signOut: async () => {} };
const CHAT = { open: false, unread: 0, focusMessageId: null, toggle: () => {}, close: () => {}, setUnread: () => {}, openOnMessage: () => {}, clearFocus: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER, usePathname: () => '/home', useSearchParams: () => new URLSearchParams() }));
void mock.module('@components/providers/auth-context', () => ({ useAuth: () => AUTH }));
void mock.module('@components/chat/ChatProvider', () => ({ useChat: () => CHAT }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AppSidebar } = await import('./AppSidebar');

const EMAIL = 'qa@example.com';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderSidebar(userDisplayName: string | null): HTMLButtonElement {
  act(() => {
    root.render(createElement(AppSidebar, {
      workspaces: [],
      activeWorkspaceId: null,
      projects: [],
      userEmail: EMAIL,
      userDisplayName,
      userRole: 'member',
      initialUnreadCount: 0,
      atcCount: null,
      runCount: null,
      bugCount: null,
    }));
  });
  return container.querySelector<HTMLButtonElement>('[data-testid="account-menu-trigger"]')!;
}

function primaryLine(trigger: HTMLButtonElement): string {
  return trigger.querySelector('span.font-semibold')?.textContent ?? '';
}

function openMenu(trigger: HTMLButtonElement): HTMLElement {
  act(() => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  return document.querySelector<HTMLElement>('[data-testid="account-menu"]')!;
}

describe('AppSidebar account block (BK-2139)', () => {
  it('shows the resolved display name (saved or provider) on the primary line', () => {
    for (const name of ['Mariko Tanaka', 'Provider Name']) {
      expect(primaryLine(renderSidebar(name))).toBe(name);
    }
  });

  it('falls back to the email when there is no display name', () => {
    expect(primaryLine(renderSidebar(null))).toBe(EMAIL);
  });

  it('keeps the email in the trigger tooltip and in the menu\'s Signed in as label', () => {
    const trigger = renderSidebar('Mariko Tanaka');
    expect(trigger.getAttribute('title')).toBe(EMAIL);
    const menu = openMenu(trigger);
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain(`Signed in as${EMAIL}`);
    expect(menu.textContent).not.toContain('Mariko Tanaka');
  });
});

describe('AppSidebar shell omissions (BK-2258, master-design-plan §5 D76)', () => {
  const PROJECTS = [{ id: 'p1', slug: 'alpha', name: 'Alpha' }, { id: 'p2', slug: 'beta-shop', name: 'Beta Shop' }];

  function renderWithProjects(): void {
    act(() => {
      root.render(createElement(AppSidebar, {
        workspaces: [],
        activeWorkspaceId: null,
        projects: PROJECTS,
        userEmail: EMAIL,
        userDisplayName: null,
        userRole: 'member',
        initialUnreadCount: 0,
        atcCount: 12,
        runCount: 3,
        bugCount: 7,
      }));
    });
  }

  function navBadge(id: string): string | null {
    return container.querySelector(`[data-testid="app-nav-${id}"] span.font-mono`)?.textContent ?? null;
  }

  it('gives Metrics no count badge while the counted entries keep theirs', () => {
    renderWithProjects();
    expect(container.querySelector('[data-testid="app-nav-metrics"]')).not.toBeNull();
    expect(navBadge('metrics')).toBeNull();
    expect(navBadge('runs')).toBe('3');
    expect(navBadge('bugs')).toBe('7');
  });

  it('renders no status dot on pinned-project rows, since no project status exists', () => {
    renderWithProjects();
    for (const p of PROJECTS) {
      const row = container.querySelector(`a[href="/projects/${p.slug}"]`);
      expect(row?.textContent).toContain(p.name);
      expect(row?.querySelector('.dot')).toBeNull();
    }
  });
});
