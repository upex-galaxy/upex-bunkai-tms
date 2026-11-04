import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-571 — the archive confirmation's usage states, rendered in happy-dom (the
// RemoveMemberModal.test.ts setup: the DOM is registered in this file and React
// is imported afterwards). The endpoints are fetch doubles; what the database
// does with archive is proven in lib/atcs/archive-restore-isolation.test.ts.
// This is not live-UI evidence: no browser runs here.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pushes: string[] = [];
let refreshes = 0;
// ONE router for the whole file, like Next's own `useRouter`, which is
// referentially stable. A fresh object per render made every render a "new
// router": the usage effect re-ran, `setUsage` rendered again, and the sync
// `act()` in render() never drained (46 min, 20 GB, see BK-571).
const router = {
  push: (href: string) => { pushes.push(href); },
  refresh: () => { refreshes += 1; },
};
// Flipped only by the regression test below, to prove the dialog itself no
// longer depends on the router being stable.
let freshRouterPerRender = false;
void mock.module('next/navigation', () => ({
  useRouter: () => (freshRouterPerRender ? { ...router } : router),
}));
const toasts: Array<{ message: string, actionLabel: string | null }> = [];
void mock.module('sonner', () => ({
  toast: {
    success: (message: string, options?: { action?: { label: string } }) => {
      toasts.push({ message, actionLabel: options?.action?.label ?? null });
    },
    error: () => {},
  },
}));

void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {},
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ArchiveAtcDialog, ArchiveAtcOverlay } = await import('@components/atcs/ArchiveAtcDialog');

const ATC = { id: '11111111-1111-4111-8111-111111111111', title: 'Login with expired token' };

type Handler = (url: string, method: string) => Response | Promise<Response>;
const realFetch = globalThis.fetch;
let calls: Array<{ url: string, method: string }> = [];
let handler: Handler = () => new Response('{}', { status: 200 });
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let archivedCount = 0;
let cancelledCount = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function usageOf(titles: string[]) {
  return json({ count: titles.length, used_in: titles.map((title, i) => ({ test_id: `t${i}`, title, positions: [1] })) });
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ArchiveAtcDialog, {
      atc: ATC,
      onArchived: () => { archivedCount += 1; },
      onCancel: () => { cancelledCount += 1; },
    }));
  });
  mounted.push({ container, root });
  await flush();
  return container;
}

function byId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-testid="${id}"]`);
}

function click(el: Element | null) {
  if (!el) { throw new Error('element not found'); }
  act(() => { (el as HTMLElement).click(); });
}

beforeEach(() => {
  calls = [];
  toasts.length = 0;
  pushes.length = 0;
  refreshes = 0;
  freshRouterPerRender = false;
  archivedCount = 0;
  cancelledCount = 0;
  handler = () => usageOf([]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET' };
    calls.push(call);
    return handler(call.url, call.method);
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

describe('archive confirmation: usage states', () => {
  test('names the ATC, says archiving is reversible, and reads the usage before anything is written', async () => {
    const container = await render();
    expect(container.textContent).toContain('Archive Login with expired token? Archiving is reversible: restore it any time from the archived view in the ATC Library.');
    expect(calls).toEqual([{ url: `/api/v1/atcs/${ATC.id}/usage`, method: 'GET' }]);
  });

  test('0 Tests: says no Test chains it and shows no warning', async () => {
    const container = await render();
    expect(byId(container, 'archive-atc-usage-none')?.textContent).toBe('No Test chains this ATC.');
    expect(byId(container, 'archive-atc-usage-warning')).toBeNull();
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('1 Test: warning with the singular, the title and the keep-in-chain line', async () => {
    handler = () => usageOf(['Checkout smoke']);
    const container = await render();
    const warning = byId(container, 'archive-atc-usage-warning')!;
    expect(warning.textContent).toContain('1 Test chains this ATC.');
    expect(warning.textContent).toContain('Checkout smoke');
    expect(warning.textContent).toContain('Those Tests keep this ATC in their chains.');
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('5 Tests: every title, no remainder line', async () => {
    handler = () => usageOf(['A', 'B', 'C', 'D', 'E']);
    const container = await render();
    const warning = byId(container, 'archive-atc-usage-warning')!;
    expect(warning.textContent).toContain('5 Tests chain this ATC.');
    expect(byId(container, 'archive-atc-usage-titles')!.querySelectorAll('li')).toHaveLength(5);
    expect(warning.textContent).not.toContain('more');
  });

  test('7 Tests: the exact count, 5 titles, "and 2 more", and Archive stays available', async () => {
    handler = () => usageOf(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const container = await render();
    const warning = byId(container, 'archive-atc-usage-warning')!;
    expect(warning.textContent).toContain('7 Tests chain this ATC.');
    const items = Array.from(byId(container, 'archive-atc-usage-titles')!.querySelectorAll('li')).map(li => li.textContent);
    expect(items).toEqual(['A', 'B', 'C', 'D', 'E', 'and 2 more']);
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('while usage loads: a skeleton, and Archive is disabled', async () => {
    handler = async () => new Promise<Response>(() => {});
    const container = await render();
    expect(byId(container, 'archive-atc-usage-loading')).not.toBeNull();
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  test('a usage 404: says the ATC is gone, offers no Retry, and Archive stays disabled', async () => {
    handler = () => json({ error: { code: 'not_found', message: 'ATC not found.' } }, 404);
    const container = await render();
    expect(byId(container, 'archive-atc-usage-gone')?.textContent).toContain('no longer available');
    expect(byId(container, 'archive-atc-usage-retry')).toBeNull();
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(refreshes).toBe(1);
  });

  // Regression for the BK-571 runaway: if this ever loops again it hangs the
  // process instead of failing, so run this file ONLY through scripts/guard.sh.
  test('a router that is a new object every render does not re-read the usage', async () => {
    freshRouterPerRender = true;
    await render();
    expect(calls.filter(c => c.url.endsWith('/usage'))).toHaveLength(1);
  });

  test('a failed usage read: the named error with Retry, Archive disabled, and Retry recovers', async () => {
    handler = () => json({ error: { code: 'internal', message: 'boom' } }, 500);
    const container = await render();
    expect(byId(container, 'archive-atc-usage-error')?.textContent).toContain('Couldn’t load which Tests chain this ATC.');
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(true);

    handler = () => usageOf(['Checkout smoke']);
    click(byId(container, 'archive-atc-usage-retry'));
    await flush();
    expect(byId(container, 'archive-atc-usage-error')).toBeNull();
    expect(byId(container, 'archive-atc-usage-warning')).not.toBeNull();
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('archive confirmation: the write', () => {
  test('Cancel closes without writing', async () => {
    const container = await render();
    click(byId(container, 'archive-atc-cancel'));
    expect(cancelledCount).toBe(1);
    expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(0);
  });

  test('Confirm archives, toasts with the View archived action, and reports back', async () => {
    handler = (_url, method) => (method === 'DELETE' ? new Response(null, { status: 204 }) : usageOf([]));
    const container = await render();
    click(byId(container, 'archive-atc-confirm'));
    await flush();
    expect(calls.filter(c => c.method === 'DELETE')).toEqual([{ url: `/api/v1/atcs/${ATC.id}`, method: 'DELETE' }]);
    expect(toasts).toEqual([{
      message: 'Archived “Login with expired token”. Restore it from the archived view in the ATC Library.',
      actionLabel: 'View archived',
    }]);
    expect(archivedCount).toBe(1);
  });

  test('a failure stays open with the named error, the server message and the button still there', async () => {
    handler = (_url, method) => (method === 'DELETE'
      ? json({ error: { code: 'conflict', message: 'Something upstream broke.' } }, 500)
      : usageOf([]));
    const container = await render();
    click(byId(container, 'archive-atc-confirm'));
    await flush();
    const error = byId(container, 'archive-atc-error')!;
    expect(error.textContent).toContain('Could not archive this ATC. Nothing changed.');
    expect(error.textContent).toContain('Something upstream broke.');
    expect(archivedCount).toBe(0);
    expect((byId(container, 'archive-atc-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('a 403 maps to the permission copy', async () => {
    handler = (_url, method) => (method === 'DELETE'
      ? json({ error: { code: 'forbidden', message: 'raw' } }, 403)
      : usageOf([]));
    const container = await render();
    click(byId(container, 'archive-atc-confirm'));
    await flush();
    expect(byId(container, 'archive-atc-error')!.textContent).toContain('You do not have permission to archive in this project.');
  });

  test('the overlay: focus moves in, Escape cancels, and nothing dismisses it while the archive is in flight', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    let cancels = 0;
    let finishDelete: (response: Response) => void = () => {};
    handler = async (_url, method) => (method === 'DELETE'
      ? new Promise<Response>((resolve) => { finishDelete = resolve; })
      : usageOf([]));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(ArchiveAtcOverlay, { atc: ATC, onArchived: () => {}, onCancel: () => { cancels += 1; } }));
    });
    mounted.push({ container, root });
    await flush();
    expect(document.activeElement).toBe(byId(container, 'archive-atc-cancel'));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(cancels).toBe(1);

    await act(async () => {
      (byId(container, 'archive-atc-confirm') as HTMLButtonElement).click();
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      (byId(container, 'archive-atc-modal') as HTMLElement).click();
    });
    expect(cancels).toBe(1);

    await act(async () => {
      finishDelete(new Response(null, { status: 204 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    opener.remove();
  });
});
