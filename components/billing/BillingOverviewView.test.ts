import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-741 — the Billing overview stayed on its loading skeleton forever when
// the billing fetch blew past the 10s timeout, instead of rendering the error
// card + Retry (BK-229 AC18). The three abort guards in
// `BillingOverviewView.load()` asked "was I aborted?" when they meant "was I
// superseded?", and the timeout aborts the very same controller — so a
// timeout was indistinguishable from a supersede and `setState('error')` was
// unreachable.
//
// This is the first React-rendering suite in the repo, so it registers its own
// DOM inside this file rather than adding a repo-wide `bunfig.toml` preload:
// every other suite here is pure-logic and must keep running without a DOM.
// React and react-dom are imported dynamically AFTER registration, because a
// static import is hoisted above it and would evaluate react-dom against a
// document-less global.
GlobalRegistrator.register();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

void mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
  // No `?upgraded=1`, so the post-checkout polling branch stays out of the way.
  useSearchParams: () => new URLSearchParams(),
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BillingOverviewView } = await import('@components/billing/BillingOverviewView');

// Mirrors `FETCH_TIMEOUT_MS` in the component under test (not exported). Only
// timers at or above this delay are trapped; React's own scheduler and
// happy-dom's internals schedule far shorter ones and must keep the real timer.
const ABORT_TIMER_MIN_DELAY_MS = 10_000;

const OVERVIEW = {
  // A paid tier on purpose: the Community branch renders a `next/link`, which
  // needs a Next router context this suite has no reason to stand up.
  plan: 'cloud',
  purchased_seats: 10,
  active_seats: 3,
  project_count: 2,
  oldest_run_age_days: 5,
};

interface PendingFetch {
  signal: AbortSignal | null
  resolve: (value: Response) => void
  reject: (reason: unknown) => void
}

const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;

let pendingFetches: PendingFetch[] = [];
let abortTimers: Array<() => void> = [];
let mounted: Array<{ container: HTMLElement, root: { render: (node: unknown) => void, unmount: () => void } }> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Drains every pending microtask plus one macrotask turn, so a promise the
// component is awaiting resolves and its `setState` is flushed to the DOM.
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function mount(workspaceId: string | null) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(BillingOverviewView, { workspaceId })); });
  const handle = { container, root: root as unknown as { render: (node: unknown) => void, unmount: () => void } };
  mounted.push(handle);
  return handle;
}

// Fires the component's real 10s abort timer, then rejects the in-flight
// request the way a real aborted `fetch` does.
async function timeOut(request: PendingFetch): Promise<void> {
  expect(abortTimers.length).toBeGreaterThan(0);
  const timers = abortTimers;
  abortTimers = [];
  await act(async () => { timers.forEach((fire) => { fire(); }); });
  // Proof the production timer really aborted the production controller —
  // this suite is not simulating the abort, it is observing it.
  expect(request.signal?.aborted).toBe(true);
  await act(async () => { request.reject(new DOMException('The operation was aborted.', 'AbortError')); });
  await flush();
}

beforeEach(() => {
  pendingFetches = [];
  abortTimers = [];
  mounted = [];

  globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (typeof handler === 'function' && (delay ?? 0) >= ABORT_TIMER_MIN_DELAY_MS) {
      abortTimers.push(handler as () => void);
      return 0;
    }
    return (realSetTimeout as unknown as (...rest: unknown[]) => unknown)(handler, delay, ...args);
  }) as unknown as typeof globalThis.setTimeout;

  // Every request hangs until this suite settles it by hand — that is exactly
  // the "billing API never answers" condition BK-741 reproduces.
  globalThis.fetch = (async (_input: unknown, init?: { signal?: AbortSignal }) => {
    return new Promise<Response>((resolve, reject) => {
      pendingFetches.push({ signal: init?.signal ?? null, resolve, reject });
    });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  globalThis.setTimeout = realSetTimeout;
  globalThis.fetch = realFetch;
});

describe('BillingOverviewView — load lifecycle (BK-741)', () => {
  test('a request that exceeds the 10s timeout renders the error card + Retry, never an endless skeleton', async () => {
    const { container } = mount('ws-1');
    await flush();

    expect(container.querySelector('[data-testid="billing-loading"]')).not.toBeNull();
    expect(pendingFetches).toHaveLength(1);

    await timeOut(pendingFetches[0]);

    // AC18: the skeleton must give way to an honest, actionable failure.
    expect(container.querySelector('[data-testid="billing-loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="billing-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="billing-retry"]')).not.toBeNull();
  });

  test('a superseded request never demotes the state a newer load already set', async () => {
    const { container, root } = mount('ws-1');
    await flush();
    expect(pendingFetches).toHaveLength(1);
    const superseded = pendingFetches[0];

    // Changing the workspace re-runs the effect: cleanup aborts the first
    // controller, then `load()` issues a fresh one. This is the real
    // supersede path the original abort guard was written to protect.
    await act(async () => { root.render(createElement(BillingOverviewView, { workspaceId: 'ws-2' })); });
    await flush();

    expect(pendingFetches).toHaveLength(2);
    expect(superseded.signal?.aborted).toBe(true);

    await act(async () => { pendingFetches[1].resolve(jsonResponse(OVERVIEW)); });
    await flush();
    expect(container.querySelector('[data-testid="billing-overview"]')).not.toBeNull();

    // The abandoned request rejects late, as an aborted fetch does. It must not
    // repaint a good screen as a failure.
    await act(async () => { superseded.reject(new DOMException('The operation was aborted.', 'AbortError')); });
    await flush();

    expect(container.querySelector('[data-testid="billing-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="billing-overview"]')).not.toBeNull();
  });

  test('Retry after a timeout re-fetches and recovers the overview', async () => {
    const { container } = mount('ws-1');
    await flush();
    await timeOut(pendingFetches[0]);

    const retry = container.querySelector('[data-testid="billing-retry"]');
    expect(retry).not.toBeNull();

    await act(async () => { (retry as HTMLElement).click(); });
    await flush();

    expect(pendingFetches).toHaveLength(2);
    await act(async () => { pendingFetches[1].resolve(jsonResponse(OVERVIEW)); });
    await flush();

    expect(container.querySelector('[data-testid="billing-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="billing-overview"]')).not.toBeNull();
  });
});
