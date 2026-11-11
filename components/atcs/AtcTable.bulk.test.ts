import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-507 — selection, the bulk bar and the confirmation as the ATC table wires
// them, rendered in happy-dom (the ArchiveAtcDialog.test.ts setup). The workbench
// is a double held in ONE module-level object, so every render sees the same
// reference (a fresh object per render once made a sibling suite run 46 minutes).
// This is not live-UI evidence: no browser runs here.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { EMPTY_ATC_LIST_FILTERS } = await import('@lib/atcs/list-filters');

let refreshes = 0;
const router = { push: () => {}, refresh: () => { refreshes += 1; } };
void mock.module('next/navigation', () => ({ useRouter: () => router }));
void mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string, children?: unknown }) => createElementLater('a', { href, ...rest }, children),
}));
void mock.module('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {},
  revalidateAfterAtcBulkEdit: async () => {},
}));

const workbench = {
  atcFilters: EMPTY_ATC_LIST_FILTERS,
  setAtcFilters: () => {},
  resetAtcFilters: () => {},
  canCreate: true,
  projectId: 'proj-1',
  tree: [] as unknown[],
};
void mock.module('@app/(app)/projects/[projectSlug]/workbench-context', () => ({
  useWorkbench: () => workbench,
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AtcTable } = await import('@components/atcs/AtcTable');

function createElementLater(type: string, props: Record<string, unknown>, children: unknown) {
  return createElement(type, props, children as never);
}

function row(n: number, layer: 'UI' | 'API' = 'UI') {
  return {
    id: `atc-${n}`,
    project_id: 'proj-1',
    module_id: 'm1',
    user_story_id: 's1',
    slug: `m/atc-${String(n).padStart(8, '0')}`,
    title: `ATC number ${n}`,
    layer,
    version: n,
    status: 'not_run',
    tags: [],
    technique: null,
    priority: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    module_path: 'root/m1',
  };
}

const FOUR = [row(1, 'UI'), row(2, 'UI'), row(3, 'API'), row(4, 'API')];

const realFetch = globalThis.fetch;
let bodies: Array<Record<string, unknown>> = [];
let respond: (body: Record<string, unknown>) => Response = () => new Response('{}');
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void, render: (el: never) => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function mount(rows: unknown[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const element = () => createElement(AtcTable, { atcs: rows as never, projectSlug: 'demo' });
  act(() => { root.render(element()); });
  mounted.push({ container, root: root as never });
  return { container, rerender: () => act(() => { root.render(element()); }) };
}

function byId(c: HTMLElement, id: string) { return c.querySelector(`[data-testid="${id}"]`); }
function all(c: HTMLElement, id: string) { return [...c.querySelectorAll(`[data-testid="${id}"]`)]; }
function click(el: Element | null) {
  if (!el) { throw new Error('element not found'); }
  act(() => { (el as HTMLElement).click(); });
}
// React tracks an input's value through the node's own setter, so a test must go
// through the prototype's native one for the change to register.
function setNativeValue(el: Element, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') as { set?: (this: Element, v: string) => void } | undefined;
  descriptor?.set?.call(el, value);
}

function choose(el: Element | null, value: string) {
  if (!el) { throw new Error('select not found'); }
  act(() => {
    setNativeValue(el, value);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

function report(outcomes: Array<[string, 'changed' | 'unchanged' | 'refused', string | null]>, dryRun: boolean) {
  const list = outcomes.map(([id, kind, reason]) => ({ atc_id: id, slug: id, title: `Title ${id}`, outcome: kind, reason, version: 1 }));
  return {
    dry_run: dryRun,
    field: 'layer',
    requested: list.length,
    changed: list.filter(o => o.outcome === 'changed').length,
    unchanged: list.filter(o => o.outcome === 'unchanged').length,
    refused: list.filter(o => o.outcome === 'refused').length,
    outcomes: list,
  };
}

beforeEach(() => {
  bodies = [];
  refreshes = 0;
  workbench.canCreate = true;
  workbench.atcFilters = EMPTY_ATC_LIST_FILTERS;
  respond = () => new Response('{}');
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    return respond(body);
  }) as typeof fetch;
});

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('selecting ATCs', () => {
  test('rows select one by one with a live count, and the bar appears only while something is selected', async () => {
    const { container } = mount(FOUR);
    expect(byId(container, 'atc-bulk-bar')).toBeNull();
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('');

    click(all(container, 'atc-row-select')[0]);
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('1 selected');
    expect(byId(container, 'atc-bulk-bar')).not.toBeNull();
    expect((byId(container, 'atc-select-all') as HTMLInputElement).indeterminate).toBe(true);

    click(all(container, 'atc-row-select')[1]);
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('2 selected');

    click(all(container, 'atc-row-select')[0]);
    click(all(container, 'atc-row-select')[1]);
    expect(byId(container, 'atc-bulk-bar')).toBeNull();
  });

  test('the header checkbox selects everything shown, and a second click clears it', async () => {
    const { container } = mount(FOUR);
    click(byId(container, 'atc-select-all'));
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('4 selected');
    expect((byId(container, 'atc-select-all') as HTMLInputElement).checked).toBe(true);
    click(byId(container, 'atc-select-all'));
    expect(byId(container, 'atc-bulk-bar')).toBeNull();
  });

  test('E12: a read-only member gets no checkbox column and no bar', async () => {
    workbench.canCreate = false;
    const { container } = mount(FOUR);
    expect(byId(container, 'atc-select-all')).toBeNull();
    expect(all(container, 'atc-row-select')).toHaveLength(0);
    expect(byId(container, 'atc-selection-count')).toBeNull();
    expect(byId(container, 'atc-bulk-bar')).toBeNull();
  });

  test('E6: changing a filter after select-all keeps the selection and reports the hidden rows', async () => {
    const { container, rerender } = mount(FOUR);
    click(byId(container, 'atc-select-all'));
    workbench.atcFilters = { ...EMPTY_ATC_LIST_FILTERS, layer: 'API' };
    rerender();
    expect(all(container, 'atc-row-select')).toHaveLength(2);
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('4 selected');
    expect(byId(container, 'atc-bulk-hidden')?.textContent).toContain('2 selected ATCs are hidden');
  });

  test('E14: above the ceiling the review is refused before any confirmation, naming the ceiling', async () => {
    const many = Array.from({ length: 201 }, (_, i) => row(i + 1));
    const { container } = mount(many);
    click(byId(container, 'atc-select-all'));
    expect(byId(container, 'atc-bulk-ceiling')?.textContent).toContain('200');
    choose(byId(container, 'atc-bulk-field'), 'layer');
    choose(byId(container, 'atc-bulk-layer'), 'API');
    expect((byId(container, 'atc-bulk-review') as HTMLButtonElement).disabled).toBe(true);
    expect(bodies).toHaveLength(0);
  });
});

describe('the bulk bar and the confirmation', () => {
  test('Review stays disabled until the change is valid; tags normalise and the confirmation names the change and the count', async () => {
    respond = body => json(report([['atc-1', 'changed', null], ['atc-2', 'changed', null]], body.dry_run === true));
    const { container } = mount(FOUR);
    click(all(container, 'atc-row-select')[0]);
    click(all(container, 'atc-row-select')[1]);
    expect((byId(container, 'atc-bulk-review') as HTMLButtonElement).disabled).toBe(true);

    const input = byId(container, 'atc-bulk-tags') as HTMLInputElement;
    act(() => {
      setNativeValue(input, ' Smoke, SMOKE , two  words ');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect((byId(container, 'atc-bulk-review') as HTMLButtonElement).disabled).toBe(false);

    click(byId(container, 'atc-bulk-review'));
    await flush();
    expect(byId(container, 'atc-bulk-change')?.textContent).toBe('Add tags “smoke”, “two words”');
    expect(byId(container, 'atc-bulk-count')?.textContent).toBe('2 ATCs');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ project_id: 'proj-1', field: 'tags', dry_run: true, change: { op: 'add', tags: ['smoke', 'two words'] } });
    expect(bodies[0].items).toEqual([{ id: 'atc-1', version: 1 }, { id: 'atc-2', version: 2 }]);
  });

  test('after a partial failure the selection narrows to the refused ATCs and the list refreshes', async () => {
    respond = body => json(body.dry_run === true
      ? report([['atc-1', 'changed', null], ['atc-2', 'refused', 'stale_version']], true)
      : report([['atc-1', 'changed', null], ['atc-2', 'refused', 'stale_version']], false));
    const { container } = mount(FOUR);
    click(all(container, 'atc-row-select')[0]);
    click(all(container, 'atc-row-select')[1]);
    choose(byId(container, 'atc-bulk-field'), 'layer');
    choose(byId(container, 'atc-bulk-layer'), 'API');
    click(byId(container, 'atc-bulk-review'));
    await flush();
    click(byId(container, 'atc-bulk-apply'));
    await flush();
    expect(byId(container, 'atc-bulk-refusals')).not.toBeNull();
    click(byId(container, 'atc-bulk-done'));
    expect(byId(container, 'atc-bulk-modal')).toBeNull();
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('1 selected');
    expect(refreshes).toBe(1);
  });

  test('E10: a rejected write keeps the whole selection', async () => {
    respond = body => (body.dry_run === true
      ? json(report([['atc-1', 'changed', null], ['atc-2', 'changed', null]], true))
      : json({ error: { message: 'Down.' } }, 500));
    const { container } = mount(FOUR);
    click(all(container, 'atc-row-select')[0]);
    click(all(container, 'atc-row-select')[1]);
    choose(byId(container, 'atc-bulk-field'), 'layer');
    choose(byId(container, 'atc-bulk-layer'), 'API');
    click(byId(container, 'atc-bulk-review'));
    await flush();
    click(byId(container, 'atc-bulk-apply'));
    await flush();
    click(byId(container, 'atc-bulk-close'));
    expect(byId(container, 'atc-selection-count')?.textContent).toBe('2 selected');
  });
});
