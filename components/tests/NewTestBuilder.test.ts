import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');

const pushes: string[] = [];
const router = {
  push: (href: string) => { pushes.push(href); },
  refresh: () => {},
};
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));
const toasts: Array<{ kind: 'success' | 'error', message: string }> = [];
void mock.module('sonner', () => ({
  toast: {
    success: (message: string) => { toasts.push({ kind: 'success', message }); },
    error: (message: string) => { toasts.push({ kind: 'error', message }); },
  },
}));

const { createRoot } = await import('react-dom/client');
const { NewTestBuilder } = await import('@components/tests/NewTestBuilder');

const ATC_A = { id: '11111111-1111-4111-8111-111111111111', slug: 'ATC-A', title: 'Sign in', layer: 'UI' as const };
const ATC_B = { id: '22222222-2222-4222-8222-222222222222', slug: 'ATC-B', title: 'Pay by card', layer: 'API' as const };
const NEW_ID = '33333333-3333-4333-8333-333333333333';

type Handler = (url: string, method: string) => Response;
const realFetch = globalThis.fetch;
let calls: Array<{ url: string, method: string, body: unknown }> = [];
let handler: Handler = () => new Response('{}', { status: 200 });
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function render(prefill: Parameters<typeof NewTestBuilder>[0]['prefill']) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(NewTestBuilder, { projectSlug: 'checkout', atcs: [ATC_A, ATC_B], prefill }));
  });
  mounted.push({ container, root });
  await flush();
  return container;
}

function byId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function submit(container: HTMLElement) {
  await act(async () => {
    (byId(container, 'new-test-submit') as HTMLButtonElement).click();
  });
  for (let i = 0; i < 5; i += 1) { await flush(); }
}

beforeEach(() => {
  calls = [];
  pushes.length = 0;
  toasts.length = 0;
  handler = (_url, method) => (method === 'POST' ? json({ test: { id: NEW_ID } }, 201) : json({ test: {} }));
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(input), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    return handler(String(input), method);
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

const PREFILL = {
  title: 'Copy of Checkout as member',
  chain: [ATC_A, ATC_B, ATC_A],
  tags: ['smoke'],
  archivedStepCount: 1,
};

describe('bK-1994 NewTestBuilder from a source Test', () => {
  test('the plain builder opens empty, with no tag field and no archived notice', async () => {
    const c = await render(null);
    expect((byId(c, 'new-test-title') as HTMLInputElement).value).toBe('');
    expect(byId(c, 'new-test-tags')).toBeNull();
    expect(byId(c, 'new-test-archived-notice')).toBeNull();
    expect((byId(c, 'new-test-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  test('opens prefilled with the title, the chain in order, the tags and the notice', async () => {
    const c = await render(PREFILL);
    expect((byId(c, 'new-test-title') as HTMLInputElement).value).toBe('Copy of Checkout as member');
    expect(c.querySelectorAll('[data-testid^="new-test-chain-row-"]')).toHaveLength(3);
    expect(byId(c, 'new-test-chain-row-2')?.textContent).toContain('Sign in');
    expect(byId(c, 'test-tag-pill-smoke')).not.toBeNull();
    expect(byId(c, 'new-test-archived-notice')?.textContent).toBe('1 chain step was left out because its ATC is archived.');
    expect(calls).toHaveLength(0);
  });

  test('saves the chain through the create call, then the tags, and lands on the Project', async () => {
    const c = await render(PREFILL);
    await submit(c);
    expect(calls.map(call => call.method)).toEqual(['POST', 'PUT']);
    expect(calls[0].body).toEqual({ title: 'Copy of Checkout as member', atc_ids: [ATC_A.id, ATC_B.id, ATC_A.id] });
    expect(calls[1].url).toBe(`/api/v1/tests/${NEW_ID}/tags`);
    expect(calls[1].body).toEqual({ tags: ['smoke'] });
    expect(pushes).toEqual(['/projects/checkout']);
    expect(toasts).toEqual([{ kind: 'success', message: 'Test created' }]);
  });

  test('sends no tag call for an untagged copy', async () => {
    const c = await render({ ...PREFILL, tags: [] });
    await submit(c);
    expect(calls.map(call => call.method)).toEqual(['POST']);
    expect(pushes).toEqual(['/projects/checkout']);
  });

  test('a failed tag save opens the new Test, says so and never offers Create again', async () => {
    handler = (_url, method) => (method === 'POST' ? json({ test: { id: NEW_ID } }, 201) : json({ error: { message: 'nope' } }, 422));
    const c = await render(PREFILL);
    await submit(c);
    expect(pushes).toEqual([`/projects/checkout/tests/${NEW_ID}`]);
    expect(toasts).toEqual([{ kind: 'error', message: 'Test created, but its tags were not saved. Add them on this page.' }]);
    expect((byId(c, 'new-test-submit') as HTMLButtonElement).disabled).toBe(true);
    await submit(c);
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
  });

  test('keeps Create disabled while every source ATC was archived', async () => {
    const c = await render({ ...PREFILL, chain: [], archivedStepCount: 2 });
    expect(byId(c, 'new-test-archived-notice')?.textContent).toBe('2 chain steps were left out because their ATCs are archived.');
    expect((byId(c, 'new-test-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
