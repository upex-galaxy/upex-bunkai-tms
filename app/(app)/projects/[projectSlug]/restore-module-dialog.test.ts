import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-601 — the restore confirmation's states, in happy-dom. The endpoint is a fetch
// double; what the database does is proven in lib/modules/restore-isolation.test.ts.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let refreshes = 0;
// One stable router, like Next's: a fresh object per render loops any component that
// lists the router in a hook's deps.
const router = { push: () => {}, refresh: () => { refreshes += 1; } };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
const toasts: string[] = [];
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { toasts.push(message); }, error: () => {} },
}));
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {},
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RestoreModuleDialog } = await import('./restore-module-dialog');

const MODULE_ID = '11111111-1111-4111-8111-111111111111';
const realFetch = globalThis.fetch;
let responses: Array<Response | Error> = [];
let calls: string[] = [];
let restored = 0;
let cancelled = 0;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(RestoreModuleDialog, {
      moduleId: MODULE_ID,
      moduleName: 'Checkout',
      onRestored: () => { restored += 1; },
      onCancel: () => { cancelled += 1; },
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
  calls = [];
  restored = 0;
  cancelled = 0;
  refreshes = 0;
  toasts.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    const next = responses.shift();
    if (next === undefined) { throw new Error('unexpected fetch'); }
    if (next instanceof Error) { throw next; }
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

describe('RestoreModuleDialog', () => {
  test('restores, reports what came back and refreshes', async () => {
    responses = [json({ restored: { id: MODULE_ID, name: 'Checkout', changed: true, modules: 3, user_stories: 5, acceptance_criteria: 14, atcs: 9 } })];
    const container = await render();

    await click(byTestId(container, 'restore-module-confirm'));

    expect(calls).toEqual([`POST /api/v1/modules/${MODULE_ID}/restore`]);
    expect(toasts).toEqual(['Restored "Checkout" with 2 sub-modules, 5 user stories, 14 acceptance criteria and 9 ATCs.']);
    expect(refreshes).toBe(1);
    expect(restored).toBe(1);
  });

  test('keeps a refusal on screen with its reason, and retries', async () => {
    responses = [
      json({ error: { code: 'conflict', message: 'Restore "Payments" first. It is still archived.', details: { reason: 'ancestor_archived' } } }, 409),
      json({ restored: { id: MODULE_ID, name: 'Checkout', changed: true, modules: 1, user_stories: 0, acceptance_criteria: 0, atcs: 0 } }),
    ];
    const container = await render();

    await click(byTestId(container, 'restore-module-confirm'));

    const error = byTestId(container, 'restore-module-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Could not restore this module. Nothing changed.');
    expect(error?.textContent).toContain('Restore "Payments" first. It is still archived.');
    expect(byTestId(container, 'restore-module-confirm')?.textContent).toBe('Retry');
    expect(restored).toBe(0);
    expect(refreshes).toBe(0);

    await click(byTestId(container, 'restore-module-confirm'));

    expect(calls).toHaveLength(2);
    expect(restored).toBe(1);
    expect(byTestId(container, 'restore-module-error')).toBeNull();
  });

  test('names a network failure instead of hanging', async () => {
    responses = [new Error('offline')];
    const container = await render();

    await click(byTestId(container, 'restore-module-confirm'));

    expect(byTestId(container, 'restore-module-error')?.textContent).toContain('Network error.');
    expect((byTestId(container, 'restore-module-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('cancels without calling the server', async () => {
    const container = await render();
    await click(byTestId(container, 'restore-module-cancel'));
    expect(cancelled).toBe(1);
    expect(calls).toEqual([]);
  });
});
