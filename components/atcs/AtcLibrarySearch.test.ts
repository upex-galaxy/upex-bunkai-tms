import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

// BK-440 — the ATC Library's name search, rendered in happy-dom (the
// AtcArchivedLibraryView.test.ts setup). Timers are fake: the 250 ms address
// write is advanced by hand, never waited for.
GlobalRegistrator.register({ url: 'http://localhost:3000/atcs' });
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One stable router, like Next's: a fresh object per render loops any component
// that lists the router in a hook's deps.
const router = { push: () => {}, refresh: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => router }));
void mock.module('sonner', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
void mock.module('@app/(app)/atcs/actions', () => ({ revalidateAfterArchiveChange: async () => {} }));

const { act, createElement } = await import('react');
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));

const { createRoot } = await import('react-dom/client');
const { AtcLibraryView, AtcLibraryViewToggle } = await import('@components/atcs/AtcLibraryView');
const { AtcArchivedLibraryView } = await import('@components/atcs/AtcArchivedLibraryView');
const { AtcLibrarySearchProvider } = await import('@components/atcs/AtcLibrarySearch');
const { Fragment } = await import('react');
function withSearch(initialTerm: string, ...nodes: ReturnType<typeof createElement>[]) {
  return createElement(AtcLibrarySearchProvider, { initialTerm, children: createElement(Fragment, null, ...nodes) });
}

function row(id: string, title: string, code: string) {
  return {
    id,
    slug: `mod/${code}`,
    code,
    title,
    layer: 'UI',
    projectName: 'Alpha',
    projectSlug: 'alpha',
    moduleName: 'auth',
    storyLabel: 'US-1',
    acLabel: null,
    usedInTests: 0,
  };
}
// Referentially stable fixtures: a new array per render would re-run the memo.
const ROWS = [
  row('1', 'Login with valid credentials', 'atc-0a1'),
  row('2', 'Login rejects wrong password', 'atc-0a2'),
  row('3', 'Logout clears the session', 'atc-0a3'),
  row('4', 'Café menu loads', 'atc-0a4'),
];
const ARCHIVED = ROWS.map(r => ({ ...r, archivedAt: '2026-11-04T17:27:00.000000+00:00', archivedByLabel: 'qa@example.test', notes: [] as string[] }));

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function seedAddress(term: string) {
  if (term !== '' && window.location.search === '') { window.history.replaceState(null, '', `/atcs?q=${encodeURIComponent(term)}`); }
}

async function mount(element: ReturnType<typeof createElement>, term = '') {
  seedAddress(term);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  mounted.push({ container, root });
  return container;
}
const renderActive = async (opts: { initialTerm?: string, rows?: typeof ROWS, error?: string | null } = {}) =>
  mount(withSearch(opts.initialTerm ?? '', createElement(AtcLibraryViewToggle, { active: 'active' }), createElement(AtcLibraryView, { rows: opts.rows ?? ROWS, error: opts.error ?? null })), opts.initialTerm);

const byId = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`);
const field = (c: HTMLElement) => c.querySelector('input[role="searchbox"]') as HTMLInputElement;
const rowTitles = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="atc-library-row"] td:nth-child(2)')].map(td => td.textContent);

async function type(c: HTMLElement, value: string) {
  await act(async () => {
    const input = field(c);
    // eslint-disable-next-line ts/unbound-method
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

beforeEach(() => {
  jest.useFakeTimers();
  window.history.replaceState(null, '', '/atcs');
});
afterEach(async () => {
  for (const { container, root } of mounted) {
    await act(async () => { root.unmount(); });
    container.remove();
  }
  mounted = [];
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('BK-440 — narrowing as you type', () => {
  test('narrows after each character with no submit, and widens on delete (AC-03)', async () => {
    const c = await renderActive();
    expect(rowTitles(c)).toHaveLength(4);
    await type(c, 'l');
    expect(rowTitles(c)).toHaveLength(4);
    await type(c, 'logo');
    expect(rowTitles(c)).toEqual(['Logout clears the session']);
    await type(c, 'log');
    expect(rowTitles(c)).toHaveLength(3);
    await type(c, 'cafe');
    expect(rowTitles(c)).toEqual(['Café menu loads']);
  });

  test('a code never matches and says search looks at names only', async () => {
    const c = await renderActive();
    await type(c, 'atc-0a1');
    expect(byId(c, 'atc-library-table')).toBeNull();
    expect(byId(c, 'atc-library-no-match')?.textContent).toContain('Search looks at ATC names only.');
  });

  test('shows matches in the list only: no popup, no listbox', async () => {
    const c = await renderActive();
    await type(c, 'log');
    expect(c.querySelector('[role="listbox"], [role="option"], [role="combobox"]')).toBeNull();
    expect(field(c).value).toBe('log');
  });

  test('announces the count in a polite live region', async () => {
    const c = await renderActive();
    await type(c, 'log');
    expect(byId(c, 'atc-library-search-status')?.textContent).toBe('3 ATCs match');
    expect(byId(c, 'atc-library-search-status')?.getAttribute('aria-live')).toBe('polite');
  });

  test('the field carries its name, placeholder and shortcut', async () => {
    const c = await renderActive();
    expect(field(c).getAttribute('aria-label')).toBe('Search ATCs by name');
    expect(field(c).getAttribute('placeholder')).toBe('Search by name');
    expect(field(c).getAttribute('aria-keyshortcuts')).toBe('/');
  });
});

describe('BK-440 — the no-match state (AC-08)', () => {
  test('is its own block: copy, Clear search, no error styling, no Retry', async () => {
    const c = await renderActive();
    await type(c, 'zzzxyz');
    const block = byId(c, 'atc-library-no-match');
    expect(block?.textContent).toContain('No ATCs match \u201Czzzxyz\u201D');
    expect(block?.textContent).toContain('Clear search');
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(byId(c, 'atc-library-error')).toBeNull();
    expect(byId(c, 'atc-library-empty')).toBeNull();
    expect(block?.textContent).not.toContain('Retry');
  });

  test('Clear search brings every row back and removes the term from the address', async () => {
    const c = await renderActive({ initialTerm: 'zzzxyz' });
    expect(byId(c, 'atc-library-no-match')).not.toBeNull();
    await act(async () => { ([...c.querySelectorAll('button')].find(b => b.textContent === 'Clear search') as HTMLButtonElement).click(); });
    expect(rowTitles(c)).toHaveLength(4);
    expect(window.location.search).toBe('');
  });

  test('the empty workspace keeps its own copy and hides the field, even with a term', async () => {
    const c = await renderActive({ rows: [], initialTerm: 'log' });
    expect(byId(c, 'atc-library-empty')?.textContent).toContain('This workspace has no ATCs yet');
    expect(byId(c, 'atc-library-search')).toBeNull();
    expect(byId(c, 'atc-library-no-match')).toBeNull();
  });

  test('a read failure keeps the field and its text, with Retry', async () => {
    const c = await renderActive({ rows: [], error: 'ATC_INDEX_FAILED', initialTerm: 'log' });
    expect(byId(c, 'atc-library-error')?.textContent).toContain('Retry');
    expect(field(c).value).toBe('log');
    expect(byId(c, 'atc-library-no-match')).toBeNull();
  });
});

describe('BK-440 — the address', () => {
  test('is written 250 ms after the last key, keeping other params, without a Back stop', async () => {
    window.history.replaceState(null, '', '/atcs?view=archived');
    const before = window.history.length;
    const c = await renderActive();
    await type(c, 'lo');
    await type(c, 'log');
    expect(window.location.search).toBe('?view=archived');
    await act(async () => { jest.advanceTimersByTime(249); });
    expect(window.location.search).toBe('?view=archived');
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(window.location.search).toBe('?view=archived&q=log');
    expect(window.history.length).toBe(before);
  });

  test('a whitespace-only term removes q', async () => {
    window.history.replaceState(null, '', '/atcs?q=log');
    const c = await renderActive({ initialTerm: 'log' });
    await type(c, '   ');
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(window.location.search).toBe('');
    expect(rowTitles(c)).toHaveLength(4);
  });

  test('a server term fills the field and the list at first render (reload, shared link)', async () => {
    const c = await renderActive({ initialTerm: 'logout' });
    expect(field(c).value).toBe('logout');
    expect(rowTitles(c)).toEqual(['Logout clears the session']);
  });

  test('on mount it reconciles with the address (Back restores the typed term)', async () => {
    window.history.replaceState(null, '', '/atcs?q=cafe');
    const c = await renderActive({ initialTerm: '' });
    expect(field(c).value).toBe('cafe');
    expect(rowTitles(c)).toEqual(['Café menu loads']);
  });

  test('the Active/Archived links carry the live term, even before the address catches up', async () => {
    const c = await renderActive();
    await type(c, 'log in');
    expect(byId(c, 'atc-library-view-active')?.getAttribute('href')).toBe('/atcs?q=log+in');
    expect(byId(c, 'atc-library-view-archived')?.getAttribute('href')).toBe('/atcs?view=archived&q=log+in');
  });

  test('a pending write is cancelled when the view unmounts', async () => {
    const c = await renderActive();
    await type(c, 'log');
    const { root } = mounted.pop() as (typeof mounted)[number];
    await act(async () => { root.unmount(); });
    c.remove();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(window.location.search).toBe('');
  });
});

describe('BK-440 — keyboard', () => {
  test('"/" focuses the field from the page, selects its text and types no slash', async () => {
    const c = await renderActive({ initialTerm: 'log' });
    (document.activeElement as HTMLElement | null)?.blur();
    const event = await press(document.body, '/');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field(c));
    expect(field(c).selectionStart).toBe(0);
    expect(field(c).selectionEnd).toBe(3);
    expect(field(c).value).toBe('log');
  });

  test('"/" with Shift still works (Spanish layout, Shift+7)', async () => {
    const c = await renderActive();
    await press(document.body, '/', { shiftKey: true });
    expect(document.activeElement).toBe(field(c));
  });

  test('"/" is left alone in the field itself, in other inputs, with a modifier, in a dialog and during IME', async () => {
    const c = await renderActive();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    expect((await press(other, '/')).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(other);

    field(c).focus();
    expect((await press(field(c), '/')).defaultPrevented).toBe(false);

    other.focus();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      expect((await press(document.body, '/', init)).defaultPrevented).toBe(false);
    }
    document.body.blur();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    other.blur();
    expect((await press(document.body, '/')).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(field(c));
  });

  test('Cmd+K and Ctrl+K are not wired to this screen', async () => {
    const c = await renderActive();
    for (const init of [{ metaKey: true }, { ctrlKey: true }]) {
      const event = await press(document.body, 'k', init);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(document.activeElement).not.toBe(field(c));
  });

  test('Esc with text clears it, drops q and keeps focus; empty Esc blurs; Enter does nothing', async () => {
    window.history.replaceState(null, '', '/atcs?q=log');
    const c = await renderActive({ initialTerm: 'log' });
    field(c).focus();
    const enter = await press(field(c), 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(field(c).value).toBe('log');

    await press(field(c), 'Escape');
    expect(field(c).value).toBe('');
    expect(rowTitles(c)).toHaveLength(4);
    expect(window.location.search).toBe('');
    expect(document.activeElement).toBe(field(c));

    await press(field(c), 'Escape');
    expect(document.activeElement).not.toBe(field(c));
    expect(window.location.search).toBe('');
  });

  test('Esc cancels a pending address write', async () => {
    const c = await renderActive();
    field(c).focus();
    await type(c, 'log');
    await press(field(c), 'Escape');
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(window.location.search).toBe('');
  });

  test('Esc during IME composition does not clear the term', async () => {
    const c = await renderActive({ initialTerm: 'log' });
    field(c).focus();
    await press(field(c), 'Escape', { isComposing: true });
    expect(field(c).value).toBe('log');
  });

  test('Esc outside the field leaves the term alone', async () => {
    const c = await renderActive({ initialTerm: 'log' });
    await press(document.body, 'Escape');
    expect(field(c).value).toBe('log');
  });
});

describe('BK-440 — the Archived view', () => {
  test('narrows by the same rules, keeps its order, and shows the same nothing-found block', async () => {
    const c = await mount(withSearch('log', createElement(AtcArchivedLibraryView, { rows: ARCHIVED, error: null, canWrite: false })), 'log');
    expect([...c.querySelectorAll('[data-testid="atc-archived-row"] td:nth-child(2)')].map(td => td.textContent)).toEqual([
      'Login with valid credentials',
      'Login rejects wrong password',
      'Logout clears the session',
    ]);
    await type(c, 'zzzxyz');
    expect(byId(c, 'atc-library-no-match')?.textContent).toContain('No ATCs match \u201Czzzxyz\u201D');
    expect(byId(c, 'atc-archived-empty')).toBeNull();
  });

  test('nothing archived hides the field and ignores the term', async () => {
    const c = await mount(withSearch('log', createElement(AtcArchivedLibraryView, { rows: [], error: null, canWrite: false })), 'log');
    expect(byId(c, 'atc-archived-empty')).not.toBeNull();
    expect(byId(c, 'atc-library-search')).toBeNull();
  });
});
