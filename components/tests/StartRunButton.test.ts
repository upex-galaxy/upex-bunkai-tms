import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-2446 — starting a Run must drop the cached app layout before routing into the
// runner, or the sidebar's Test Runs count stays stale on client navigation.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const events: string[] = [];
const router = { push: (href: string) => { events.push(`push ${href}`); }, refresh: () => {} };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
void mock.module('sonner', () => ({
  toast: {
    success: (message: string) => { events.push(`toast ${message}`); },
    error: (message: string) => { events.push(`error ${message}`); },
  },
}));
let revalidateFails = false;
void mock.module('@app/(app)/runs/actions', () => ({
  revalidateAfterRunStart: async () => {
    events.push('revalidate');
    if (revalidateFails) { throw new Error('revalidate failed'); }
  },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { StartRunButton } = await import('./StartRunButton');

const ENV_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const realFetch = globalThis.fetch;
let response: Response;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StartRunButton, {
      testId: '11111111-1111-4111-8111-111111111111',
      projectSlug: 'checkout',
      environments: [{ id: ENV_ID, name: 'Staging' }],
    }));
  });
  mounted.push({ container, root });
  return container;
}

async function startRun(container: HTMLElement) {
  const select = container.querySelector('[data-testid="start-run-env"]') as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, ENV_ID);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    (container.querySelector('[data-testid="start-run-button"]') as HTMLElement).click();
  });
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

describe('start run: sidebar count freshness', () => {
  test('revalidates the app layout before routing into the new Run', async () => {
    response = json({ run: { id: RUN_ID } }, 201);
    await startRun(await render());
    expect(events).toEqual(['revalidate', 'toast Run started', `push /projects/checkout/runs/${RUN_ID}`]);
  });

  test('a failed revalidate still routes into the Run that was created', async () => {
    revalidateFails = true;
    response = json({ run: { id: RUN_ID } }, 201);
    await startRun(await render());
    expect(events).toEqual(['revalidate', 'toast Run started', `push /projects/checkout/runs/${RUN_ID}`]);
  });

  test('a refused start revalidates nothing and stays put', async () => {
    response = json({ error: { message: 'Add at least one ATC step to this Test before starting a run.' } }, 422);
    await startRun(await render());
    expect(events).toEqual(['error Add at least one ATC step to this Test before starting a run.']);
  });
});
