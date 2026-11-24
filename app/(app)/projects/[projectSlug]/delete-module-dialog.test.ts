import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-2449 — archiving a Module must drop the cached app layout before the dialog
// closes, or a navigation started right after it discards the refresh and the
// sidebar's Bug Reports count stays stale.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const events: string[] = [];
const router = { push: () => {}, refresh: () => { events.push('refresh'); } };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { events.push(`toast ${message}`); }, error: () => {} },
}));
let revalidateFails = false;
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {
    events.push('revalidate');
    if (revalidateFails) { throw new Error('revalidate failed'); }
  },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { DeleteModuleDialog } = await import('./delete-module-dialog');

const MODULE_ID = '11111111-1111-4111-8111-111111111111';
const realFetch = globalThis.fetch;
let response: Response;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function archive() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(DeleteModuleDialog, {
      moduleId: MODULE_ID,
      moduleName: 'Checkout',
      subModuleCount: 0,
      atcCount: 0,
      onDeleted: () => { events.push('deleted'); },
    }));
  });
  mounted.push({ container, root });
  await act(async () => {
    (container.querySelector('[data-testid="delete-module-confirm"]') as HTMLElement).click();
  });
  return container;
}

beforeEach(() => {
  events.length = 0;
  revalidateFails = false;
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
});

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('archive module: sidebar count freshness', () => {
  test('revalidates the app layout before the dialog closes', async () => {
    response = json({ archived: { id: MODULE_ID } }, 200);
    await archive();
    expect(events).toEqual(['revalidate', 'toast Archived “Checkout”', 'refresh', 'deleted']);
  });

  test('a failed revalidate still closes on the archive that happened', async () => {
    revalidateFails = true;
    response = json({ archived: { id: MODULE_ID } }, 200);
    await archive();
    expect(events).toEqual(['revalidate', 'toast Archived “Checkout”', 'refresh', 'deleted']);
  });

  test('a refused archive revalidates nothing and stays open', async () => {
    response = json({ error: { code: 'not_found', message: 'Module not found.' } }, 404);
    const container = await archive();
    expect(events).toEqual([]);
    expect(container.querySelector('[data-testid="delete-module-error"]')?.textContent).toBe('This module no longer exists.');
  });
});
