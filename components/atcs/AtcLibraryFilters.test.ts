import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

// BK-441 — the ATC Library facet filters (Project, Module, layer, anchor, Clear
// all), rendered in happy-dom like AtcLibrarySearch.test.ts. Timers are fake.
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
const { withQuery } = await import('@lib/atcs/library-search');
const { AtcLibrarySearchProvider } = await import('@components/atcs/AtcLibrarySearch');
const { Fragment } = await import('react');

function row(id: string, title: string, projectSlug: string, moduleName: string, layer: string, storyLabel: string, acLabel: string | null) {
  return {
    id,
    slug: `${moduleName}/${id}`,
    code: `atc-${id}`,
    title,
    layer,
    projectName: projectSlug.toUpperCase(),
    projectSlug,
    moduleName,
    storyLabel,
    acLabel,
    usedInTests: 0,
  };
}
// Referentially stable fixtures: a new array per render would re-run the memo.
const ROWS = [
  row('1', 'Login ok', 'p1', 'M1', 'API', 'BK-50', 'Snapshot saved'),
  row('2', 'Login bad', 'p1', 'M2', 'UI', 'BK-51', null),
  row('3', 'Logout', 'p2', 'M2', 'API', 'BK-50', 'Snapshot restored'),
  row('4', 'Cafe', 'p2', 'M3', 'Unit', 'US-041', 'AC-3'),
];
const ARCHIVED = ROWS.map(r => ({ ...r, archivedAt: '2026-11-04T17:27:00.000000+00:00', archivedByLabel: 'qa@example.test', notes: [] as string[] }));

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

async function mount(element: ReturnType<typeof createElement>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  mounted.push({ container, root });
  return container;
}
type Query = import('@lib/atcs/library-search').AtcLibraryQuery;
const EMPTY: Query = { q: '', project: '', module: '', layer: '', anchor: '' };
// The server renders from the address, so the two agree at first paint.
function seedAddress(query: Query) {
  const text = withQuery('', query);
  if (text !== '' && window.location.search === '') { window.history.replaceState(null, '', `/atcs?${text}`); }
}
const renderActive = async (initial: Partial<Query> = {}, rows: typeof ROWS = ROWS) => {
  seedAddress({ ...EMPTY, ...initial });
  return mount(createElement(AtcLibrarySearchProvider, {
    initialQuery: { ...EMPTY, ...initial },
    children: createElement(Fragment, null, createElement(AtcLibraryViewToggle, { active: 'active' }), createElement(AtcLibraryView, { rows, error: null })),
  }));
};

const byId = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`);
const titles = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="atc-library-row"] td:nth-child(2)')].map(td => td.textContent);
const clearAll = (c: HTMLElement) => byId(c, 'atc-library-clear-all') as HTMLButtonElement;
const moduleOptions = (c: HTMLElement) => [...(byId(c, 'atc-library-filter-module') as HTMLSelectElement).options].map(o => o.value);

async function pick(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const project = (c: HTMLElement) => byId(c, 'atc-library-filter-project') as HTMLSelectElement;
const moduleSelect = (c: HTMLElement) => byId(c, 'atc-library-filter-module') as HTMLSelectElement;
const anchor = (c: HTMLElement) => byId(c, 'atc-library-filter-anchor') as HTMLInputElement;
const search = (c: HTMLElement) => c.querySelector('input[role="searchbox"]') as HTMLInputElement;
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

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

describe('BK-441 — combining facets', () => {
  test('Project, Module and layer narrow together (5.1) and the address carries them with no Back stop (E1)', async () => {
    const before = window.history.length;
    const c = await renderActive();
    await pick(project(c), 'p1');
    await pick(moduleSelect(c), 'M1');
    await click(byId(c, 'atc-library-filter-layer-api'));
    expect(titles(c)).toEqual(['Login ok']);
    expect(window.location.search).toBe('?project=p1&module=M1&layer=API');
    expect(window.history.length).toBe(before);
  });

  test('Project options are the workspace\'s, Module options cascade from the Project (5.3)', async () => {
    const c = await renderActive();
    expect([...project(c).options].map(o => o.value)).toEqual(['', 'p1', 'p2']);
    expect(moduleOptions(c)).toEqual(['', 'M1', 'M2', 'M3']);
    await pick(project(c), 'p1');
    expect(moduleOptions(c)).toEqual(['', 'M1', 'M2']);
  });

  test('switching Project resets a Module it lacks and keeps one it has (5.4, 5.5 edge)', async () => {
    const c = await renderActive({ project: 'p1', module: 'M1' });
    await pick(project(c), 'p2');
    expect(moduleSelect(c).value).toBe('');
    expect(titles(c)).toEqual(['Logout', 'Cafe']);
    expect(window.location.search).toBe('?project=p2');

    await pick(project(c), 'p1');
    await pick(moduleSelect(c), 'M2');
    await pick(project(c), 'p2');
    expect(moduleSelect(c).value).toBe('M2');
    expect(titles(c)).toEqual(['Logout']);
    await pick(project(c), '');
    expect(moduleSelect(c).value).toBe('M2');
    expect(titles(c)).toEqual(['Login bad', 'Logout']);
  });

  test('the anchor input narrows incrementally on story and criterion, debounced into the address (5.5)', async () => {
    const c = await renderActive();
    await typeInto(anchor(c), 'SNAP');
    expect(titles(c)).toEqual(['Login ok', 'Logout']);
    expect(window.location.search).toBe('');
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(window.location.search).toBe('?anchor=SNAP');
    await typeInto(anchor(c), 'bk-51');
    expect(titles(c)).toEqual(['Login bad']);
  });

  test('the layer group pairs colour with a text label, one pressed at a time, click again clears', async () => {
    const c = await renderActive();
    const ui = byId(c, 'atc-library-filter-layer-ui') as HTMLElement;
    expect(ui.textContent).toBe('UI');
    expect(ui.className).toContain('layer-chip');
    expect(byId(c, 'atc-library-filter-layer-all')?.getAttribute('aria-pressed')).toBe('true');
    await click(ui);
    expect(ui.getAttribute('aria-pressed')).toBe('true');
    expect(byId(c, 'atc-library-filter-layer-all')?.getAttribute('aria-pressed')).toBe('false');
    expect(titles(c)).toEqual(['Login bad']);
    await click(byId(c, 'atc-library-filter-layer-unit'));
    expect(ui.getAttribute('aria-pressed')).toBe('false');
    expect(titles(c)).toEqual(['Cafe']);
    await click(byId(c, 'atc-library-filter-layer-unit'));
    expect(titles(c)).toHaveLength(4);
    expect(window.location.search).toBe('');
  });

  test('the name search and the facets narrow together in either order (6.1, 6.2)', async () => {
    const c = await renderActive();
    await typeInto(search(c), 'login');
    await pick(project(c), 'p1');
    await click(byId(c, 'atc-library-filter-layer-ui'));
    expect(titles(c)).toEqual(['Login bad']);

    const d = await renderActive({ project: 'p1', layer: 'UI' });
    await typeInto(search(d), 'login');
    expect(titles(d)).toEqual(['Login bad']);
  });
});

describe('BK-441 — filtered empty state (6.3)', () => {
  test('replaces the table, names search and filters, and its button clears everything', async () => {
    const c = await renderActive({ project: 'p1', layer: 'Unit' });
    expect(byId(c, 'atc-library-table')).toBeNull();
    const block = byId(c, 'atc-library-no-match');
    expect(block?.textContent).toContain('No ATCs found');
    expect(block?.textContent).toContain('Nothing in the workspace matches the current search and filters.');
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(byId(c, 'atc-library-empty')).toBeNull();
    expect(byId(c, 'atc-library-filter-project')).not.toBeNull();
    await click(byId(c, 'atc-library-no-match-clear'));
    expect(titles(c)).toHaveLength(4);
    expect(window.location.search).toBe('');
  });

  test('a name-only miss keeps its BK-440 copy and button', async () => {
    const c = await renderActive({ q: 'zzz' });
    expect(byId(c, 'atc-library-no-match')?.textContent).toContain('No ATCs match \u201Czzz\u201D');
    expect(byId(c, 'atc-library-no-match-clear')?.textContent).toBe('Clear search');
  });
});

describe('BK-441 — Clear all (AC-07)', () => {
  test('is disabled while nothing is active (7.3) and enabled by any part', async () => {
    const c = await renderActive();
    expect(clearAll(c).disabled).toBe(true);
    await typeInto(search(c), 'log');
    expect(clearAll(c).disabled).toBe(false);
    await typeInto(search(c), '');
    expect(clearAll(c).disabled).toBe(true);
    await typeInto(anchor(c), 'x');
    expect(clearAll(c).disabled).toBe(false);
  });

  test('clears the term and every facet at once, keeping foreign params, with no Back stop (7.1, 7.2)', async () => {
    window.history.replaceState(null, '', '/atcs?view=active&q=log&project=p1&module=M1&layer=API&anchor=BK');
    const before = window.history.length;
    const c = await renderActive({ q: 'log', project: 'p1', module: 'M1', layer: 'API', anchor: 'BK' });
    await click(clearAll(c));
    expect(titles(c)).toHaveLength(4);
    expect(search(c).value).toBe('');
    expect(anchor(c).value).toBe('');
    expect(project(c).value).toBe('');
    expect(moduleSelect(c).value).toBe('');
    expect(byId(c, 'atc-library-filter-layer-all')?.getAttribute('aria-pressed')).toBe('true');
    expect(window.location.search).toBe('?view=active');
    expect(window.history.length).toBe(before);
    expect(clearAll(c).disabled).toBe(true);
  });

  test('cancels a pending debounce so the cleared text never comes back (E4)', async () => {
    const c = await renderActive();
    await typeInto(search(c), 'log');
    await typeInto(anchor(c), 'BK');
    await click(clearAll(c));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(search(c).value).toBe('');
    expect(anchor(c).value).toBe('');
    expect(window.location.search).toBe('');
  });

  test('Esc in the name field clears the name only', async () => {
    window.history.replaceState(null, '', '/atcs?q=log&layer=UI');
    const c = await renderActive({ q: 'log', layer: 'UI' });
    search(c).focus();
    await act(async () => { search(c).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(search(c).value).toBe('');
    expect(window.location.search).toBe('?layer=UI');
    expect(titles(c)).toEqual(['Login bad']);
  });
});

describe('BK-441 — the address (E1, E2)', () => {
  test('a shared link or Back hydrates every filter from the address', async () => {
    window.history.replaceState(null, '', '/atcs?project=p2&module=M2&layer=API&anchor=snapshot');
    const c = await renderActive();
    expect(project(c).value).toBe('p2');
    expect(moduleSelect(c).value).toBe('M2');
    expect(titles(c)).toEqual(['Logout']);
    expect(anchor(c).value).toBe('snapshot');
  });

  test('server props hydrate the first render', async () => {
    const c = await renderActive({ project: 'p2', layer: 'Unit' });
    expect(titles(c)).toEqual(['Cafe']);
  });

  test('unknown Project and Module fall back to "all" without an error, and Clear all still clears the URL', async () => {
    window.history.replaceState(null, '', '/atcs?project=ghost&module=ghost&layer=E2E');
    const c = await renderActive({ project: 'ghost', module: 'ghost' });
    expect(project(c).value).toBe('');
    expect(moduleSelect(c).value).toBe('');
    expect(titles(c)).toHaveLength(4);
    expect(c.querySelector('[role="alert"]')).toBeNull();
    await click(clearAll(c));
    expect(window.location.search).toBe('');
  });

  test('the Active/Archived links carry the live filters', async () => {
    const c = await renderActive();
    await pick(project(c), 'p1');
    expect(byId(c, 'atc-library-view-archived')?.getAttribute('href')).toBe('/atcs?view=archived&project=p1');
    expect(byId(c, 'atc-library-view-active')?.getAttribute('href')).toBe('/atcs?project=p1');
  });
});

describe('BK-441 — surfaces', () => {
  test('the facets are hidden for an empty workspace and on a read failure', async () => {
    const empty = await renderActive({}, []);
    expect(byId(empty, 'atc-library-search')).toBeNull();
    const failed = await mount(createElement(AtcLibrarySearchProvider, {
      initialQuery: EMPTY,
      children: createElement(AtcLibraryView, { rows: [], error: 'ATC_INDEX_FAILED' }),
    }));
    expect(byId(failed, 'atc-library-error')).not.toBeNull();
    expect(byId(failed, 'atc-library-filter-project')).toBeNull();
    expect(search(failed)).not.toBeNull();
  });

  test('the archived view narrows by the same facets', async () => {
    seedAddress({ ...EMPTY, project: 'p1' });
    const c = await mount(createElement(AtcLibrarySearchProvider, {
      initialQuery: { ...EMPTY, project: 'p1' },
      children: createElement(AtcArchivedLibraryView, { rows: ARCHIVED, error: null, canWrite: false }),
    }));
    expect([...c.querySelectorAll('[data-testid="atc-archived-row"] td:nth-child(2)')].map(td => td.textContent)).toEqual(['Login ok', 'Login bad']);
    await click(byId(c, 'atc-library-filter-layer-ui'));
    expect([...c.querySelectorAll('[data-testid="atc-archived-row"]')]).toHaveLength(1);
  });
});
