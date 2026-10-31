import type { SavedViewItem } from '@lib/saved-views/view-model';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

// BK-1173 — keyboard focus fell to the page body after every way out of a
// Saved views dialog or the panel, so the next Tab restarted from the top of
// the page. Rendered with happy-dom like ChatPanel.test.ts (DOM registered in
// this file, React imported dynamically after it). `fetch` is faked with the
// saved-views API answers; nothing else is mocked.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { SavedViewsMenu } = await import('@components/saved-views/SavedViewsMenu');

const PROJECT = '22222222-2222-4222-8222-222222222222';
const VIEW: SavedViewItem = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: PROJECT,
  view_kind: 'bugs',
  name: 'Critical bugs',
  state: { severity: 'P1' },
  created_at: '2026-10-15T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
};
const SAVED: SavedViewItem = { ...VIEW, id: '44444444-4444-4444-8444-444444444444', name: 'New view' };

const realFetch = globalThis.fetch;
let mounted: { container: HTMLElement, root: { unmount: () => void } } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') { return json({ items: [VIEW] }); }
    if (method === 'DELETE') { return new Response(null, { status: 204 }); }
    if (method === 'POST') { return json({ item: SAVED }, 201); }
    return json({ item: VIEW });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (mounted) {
    const { container, root } = mounted;
    act(() => { root.unmount(); });
    container.remove();
    mounted = null;
  }
});

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(createElement(SavedViewsMenu, { projectId: PROJECT, kind: 'bugs', currentState: { severity: 'P1' }, onApply: () => undefined }));
  });
}

function byTestId(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) { throw new Error(`missing [data-testid="${id}"]`); }
  return element;
}

// Keyboard path: focus the control, then activate it, as Enter on a button does.
async function press(id: string) {
  const element = byTestId(id);
  element.focus();
  await act(async () => { element.click(); });
  await settle();
}

async function escape() {
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await settle();
}

async function openPanel() {
  await render();
  await press('saved-views-trigger');
  expect(document.querySelector('[data-testid="saved-views-panel"]')).not.toBeNull();
}

const trigger = () => byTestId('saved-views-trigger');

describe('BK-1173 — focus returns to the Saved views control', () => {
  test('Escape from a row closes the panel and focuses the trigger', async () => {
    await openPanel();
    byTestId(`saved-views-item-${VIEW.id}`).focus();
    await escape();
    expect(document.querySelector('[data-testid="saved-views-panel"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test('opening a view closes the panel and focuses the trigger', async () => {
    await openPanel();
    await press(`saved-views-item-${VIEW.id}`);
    expect(document.activeElement).toBe(trigger());
  });

  test('Update with current filters closes the panel and focuses the trigger', async () => {
    await openPanel();
    await press(`saved-views-item-${VIEW.id}`);
    await press('saved-views-trigger');
    await press('saved-views-update');
    expect(document.querySelector('[data-testid="saved-views-panel"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test.each(['cancel', 'escape'])('the Save dialog closed by %s returns focus to "Save current view"', async (how) => {
    await openPanel();
    await press('saved-views-save');
    expect(document.activeElement).toBe(byTestId('saved-views-name-dialog-input'));
    if (how === 'cancel') { await press('saved-views-name-dialog-cancel'); }
    else { await escape(); }
    expect(document.querySelector('[data-testid="saved-views-name-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(byTestId('saved-views-save'));
  });

  test('a successful save returns focus to "Save current view"', async () => {
    await openPanel();
    await press('saved-views-save');
    const input = byTestId('saved-views-name-dialog-input') as HTMLInputElement;
    // React tracks the value through the native setter; a plain assignment
    // would be swallowed and no onChange would fire.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    await act(async () => {
      descriptor?.set?.call(input, 'New view');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press('saved-views-name-dialog-submit');
    expect(document.querySelector('[data-testid="saved-views-name-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(byTestId('saved-views-save'));
  });

  test.each(['cancel', 'escape'])('the Rename dialog closed by %s returns focus to the row\'s rename control', async (how) => {
    await openPanel();
    await press(`saved-views-rename-${VIEW.id}`);
    if (how === 'cancel') { await press('saved-views-name-dialog-cancel'); }
    else { await escape(); }
    expect(document.activeElement).toBe(byTestId(`saved-views-rename-${VIEW.id}`));
  });

  test('confirming Delete removes the row and focuses the trigger', async () => {
    await openPanel();
    await press(`saved-views-delete-${VIEW.id}`);
    await press('saved-views-delete-dialog-confirm');
    expect(document.querySelector(`[data-testid="saved-views-item-${VIEW.id}"]`)).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test('a click on another control keeps the focus there', async () => {
    await openPanel();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    await act(async () => { outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await settle();
    expect(document.querySelector('[data-testid="saved-views-panel"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
