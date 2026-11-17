import type { DefectHeatmapReport } from '@lib/metrics/defect-heatmap';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-718 — the Defect Heatmap keeps itself current while it is on screen.
//
// Rendered with happy-dom like ChatPanel.test.ts (DOM registered in this
// file, React imported dynamically after it). The Supabase browser client is
// faked so the test drives the channel status and the INSERT events by hand;
// the real `subscribeWithUserAuth` runs against it (not mocked: Bun's
// `mock.module` is process-wide). Every heatmap GET hangs until the test
// answers it, so request order is chosen, not raced. The refresh scheduler
// runs on real timers (250 ms trailing debounce), so a test waits ~300 ms for
// a coalesced refresh to fire.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type StatusCallback = (status: string) => void;
type ChangeHandler = (payload: { eventType: string, new: unknown }) => void;

interface FakeChannel {
  name: string
  filter: Record<string, unknown> | null
  statusCallback: StatusCallback | null
  changeHandler: ChangeHandler | null
  removed: boolean
}

let channels: FakeChannel[] = [];

function fakeChannel(name: string) {
  const record: FakeChannel = { name, filter: null, statusCallback: null, changeHandler: null, removed: false };
  channels.push(record);
  const channel = {
    record,
    on(type: string, filter: Record<string, unknown>, handler: ChangeHandler) {
      if (type === 'postgres_changes') {
        record.filter = filter;
        record.changeHandler = handler;
      }
      return channel;
    },
    subscribe(callback?: StatusCallback) {
      record.statusCallback = callback ?? null;
      return channel;
    },
  };
  return channel;
}

const fakeClient = {
  channel: (name: string) => fakeChannel(name),
  removeChannel: async (channel: { record: FakeChannel }) => {
    channel.record.removed = true;
    return 'ok';
  },
  realtime: { setAuth: async () => undefined },
};

void mock.module('@lib/supabase/client', () => ({ createClient: () => fakeClient }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BugsHeatmapView } = await import('@components/bugs/BugsHeatmapView');

const PROJECT = 'project-718';
const OTHER_PROJECT = 'project-719';
const MODULE = 'module-payments';
const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;

interface PendingRequest {
  url: URL
  resolve: (value: Response) => void
  answered: boolean
}

let requests: PendingRequest[] = [];
let mounted: Array<{ container: HTMLElement, root: { render: (node: unknown) => void, unmount: () => void } }> = [];

// AC-3 data: 1 defect in the latest week and 1 in the prior one reads
// "2 defects, Flat ±0, Low"; one more makes it "3, Rising +1, Elevated".
function report(count: number, generatedAt: string, window: DefectHeatmapReport['window'] = '30d'): DefectHeatmapReport {
  const current = count - 1;
  const delta = current - 1;
  return {
    window,
    generated_at: generatedAt,
    items: [{
      module_id: MODULE,
      module_name: 'Payments',
      module_path: 'Checkout/Payments',
      defect_count: count,
      heat: count === 0 ? 'clean' : count <= 2 ? 'low' : count <= 4 ? 'elevated' : 'hotspot',
      current_week_count: current,
      previous_week_count: 1,
      trend_direction: delta > 0 ? 'rising' : delta < 0 ? 'falling' : 'flat',
      trend_delta: delta,
      trend_pct: 0,
    }],
  };
}

function ok(body: DefectHeatmapReport): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function serverError(): Response {
  return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

// Lets the 250 ms trailing debounce fire.
async function waitForDebounce(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 320); });
  });
  await flush();
}

function pending(): PendingRequest[] {
  return requests.filter(r => !r.answered);
}

async function answerNext(response: Response): Promise<URL> {
  const next = pending()[0];
  if (!next) { throw new Error(`no pending heatmap request (seen ${requests.length})`); }
  next.answered = true;
  await act(async () => { next.resolve(response); });
  await flush();
  return next.url;
}

function liveChannel(projectId = PROJECT): FakeChannel {
  const found = channels.filter(c => c.name.startsWith(`bugs-heatmap-${projectId}-`) && !c.removed).at(-1);
  if (!found?.statusCallback || !found.changeHandler) { throw new Error(`heatmap channel for ${projectId} not joined`); }
  return found;
}

async function status(next: string, projectId = PROJECT): Promise<void> {
  const channel = liveChannel(projectId);
  await act(async () => { channel.statusCallback?.(next); });
  await flush();
}

async function insertEvent(projectId = PROJECT): Promise<void> {
  const channel = liveChannel(projectId);
  await act(async () => { channel.changeHandler?.({ eventType: 'INSERT', new: { id: `bug-${Math.random()}` } }); });
  await flush();
}

function text(container: HTMLElement, testId: string): string {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

// Whitespace-free: the cell renders its figures in sibling spans.
function cellText(container: HTMLElement): string {
  return text(container, `bugs-heatmap-cell-${MODULE}`).replace(/\s+/g, '');
}

function testIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid') ?? '').sort();
}

function gridDimmed(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="bugs-heatmap-grid"]')?.className.includes('opacity-60') ?? false;
}

async function mount(projectId = PROJECT) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container) as unknown as { render: (node: unknown) => void, unmount: () => void };
  act(() => { root.render(createElement(BugsHeatmapView, { projectId })); });
  mounted.push({ container, root });
  // Let `setAuth()` resolve so the channel joins.
  await flush();
  return { container, root };
}

// Mount, answer the first load with 2 defects, and connect the channel
// (whose first SUBSCRIBED re-reads once; that reconcile is answered too).
async function mountWatching() {
  const view = await mount();
  await answerNext(ok(report(2, '2026-11-17T10:00:00.000Z')));
  await status('SUBSCRIBED');
  await waitForDebounce();
  await answerNext(ok(report(2, '2026-11-17T10:01:00.000Z')));
  expect(pending()).toHaveLength(0);
  return view;
}

beforeEach(() => {
  channels = [];
  requests = [];
  mounted = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    return new Promise<Response>((resolve) => { requests.push({ url, resolve, answered: false }); });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('BugsHeatmapView — live updates (BK-718)', () => {
  test('subscribes to defect INSERTs for this Project only', async () => {
    await mount();
    const channel = liveChannel();

    expect(channel.filter).toEqual({ event: 'INSERT', schema: 'public', table: 'bugs', filter: `project_id=eq.${PROJECT}` });
  });

  test('AC-1/AC-3: a filed defect moves count, trend and heat tag in place, with no reader action', async () => {
    const { container } = await mountWatching();
    expect(cellText(container)).toContain('2defects');
    expect(cellText(container)).toContain('Flat±0');
    expect(text(container, `bugs-heatmap-tag-${MODULE}`)).toBe('Low');

    await insertEvent();
    await waitForDebounce();
    const url = await answerNext(ok(report(3, '2026-11-17T10:05:00.000Z')));

    expect(url.pathname).toBe(`/api/v1/projects/${PROJECT}/bugs/heatmap`);
    expect(url.searchParams.get('window')).toBe('30d');
    expect(cellText(container)).toContain('3defects');
    expect(cellText(container)).toContain('Rising+1');
    expect(text(container, `bugs-heatmap-tag-${MODULE}`)).toBe('Elevated');
    expect(text(container, 'bugs-heatmap-asof')).toBe('as of 2026-11-17 10:05 UTC');
  });

  test('no announce affordance: the background refresh never dims the grid and adds nothing beside the cells', async () => {
    const { container } = await mountWatching();
    const before = testIds(container);

    await insertEvent();
    await waitForDebounce();
    expect(pending()).toHaveLength(1);
    expect(gridDimmed(container)).toBe(false);
    await answerNext(ok(report(3, '2026-11-17T10:05:00.000Z')));

    expect(gridDimmed(container)).toBe(false);
    expect(testIds(container)).toEqual(before);
    expect(container.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  });

  test('BR-9: a burst of defects settles into one refresh', async () => {
    await mountWatching();

    await insertEvent();
    await insertEvent();
    await insertEvent();
    await waitForDebounce();

    expect(pending()).toHaveLength(1);
  });

  test('a slow background read is never aborted by the next event; one follow-up read runs once it settles', async () => {
    const { container } = await mountWatching();

    await insertEvent();
    await waitForDebounce();
    expect(pending()).toHaveLength(1);

    // More defects arrive while that read is still out: no abort, no second read yet.
    await insertEvent();
    await waitForDebounce();
    await insertEvent();
    await waitForDebounce();
    expect(pending()).toHaveLength(1);

    await answerNext(ok(report(3, '2026-11-17T10:05:00.000Z')));
    expect(cellText(container)).toContain('3defects');
    expect(pending()).toHaveLength(1);

    await answerNext(ok(report(5, '2026-11-17T10:06:00.000Z')));
    expect(cellText(container)).toContain('5defects');
    expect(pending()).toHaveLength(0);
  });

  test('BR-7: a failed background read keeps the last figures and stamp, with no error card', async () => {
    const { container } = await mountWatching();
    const stampBefore = text(container, 'bugs-heatmap-asof');

    await insertEvent();
    await waitForDebounce();
    await answerNext(serverError());

    expect(cellText(container)).toContain('2defects');
    expect(text(container, 'bugs-heatmap-asof')).toBe(stampBefore);
    expect(container.querySelector('[data-testid="bugs-heatmap-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="bugs-heatmap-grid"]')).not.toBeNull();
  });

  test('AC-7/AC-8: a dropped connection changes nothing; the reconnect re-reads the true figures once', async () => {
    const { container } = await mountWatching();

    await status('CLOSED');
    await waitForDebounce();
    expect(pending()).toHaveLength(0);
    expect(cellText(container)).toContain('2defects');
    expect(container.querySelector('[data-testid="bugs-heatmap-error"]')).toBeNull();

    await status('SUBSCRIBED');
    await waitForDebounce();
    expect(pending()).toHaveLength(1);
    await answerNext(ok(report(4, '2026-11-17T10:09:00.000Z')));

    expect(cellText(container)).toContain('4defects');
    expect(text(container, 'bugs-heatmap-asof')).toBe('as of 2026-11-17 10:09 UTC');
  });

  test('a repeated SUBSCRIBED on a live channel does not re-read', async () => {
    await mountWatching();

    await status('SUBSCRIBED');
    await waitForDebounce();

    expect(pending()).toHaveLength(0);
  });

  test('AC-6: after a window switch the same subscription refreshes that window, without a second channel', async () => {
    const { container } = await mountWatching();
    const channelCount = channels.length;

    act(() => { (container.querySelector('[data-testid="bugs-heatmap-window-7d"]') as HTMLButtonElement).click(); });
    await flush();
    const switched = await answerNext(ok(report(1, '2026-11-17T10:06:00.000Z', '7d')));
    expect(switched.searchParams.get('window')).toBe('7d');

    await insertEvent();
    await waitForDebounce();
    const refreshed = await answerNext(ok(report(2, '2026-11-17T10:07:00.000Z', '7d')));

    expect(refreshed.searchParams.get('window')).toBe('7d');
    expect(cellText(container)).toContain('2defects·7d');
    expect(channels).toHaveLength(channelCount);
  });

  test('an event while a window switch is still loading re-runs that load for the new window and never strands the dimmed grid', async () => {
    const { container } = await mountWatching();

    act(() => { (container.querySelector('[data-testid="bugs-heatmap-window-90d"]') as HTMLButtonElement).click(); });
    await flush();
    expect(gridDimmed(container)).toBe(true);

    await insertEvent();
    await waitForDebounce();
    // The first 90d load was aborted and re-issued; only the newest answers.
    const live = pending();
    expect(live.at(-1)!.url.searchParams.get('window')).toBe('90d');
    live.slice(0, -1).forEach((r) => { r.answered = true; });
    await answerNext(ok(report(5, '2026-11-17T10:08:00.000Z', '90d')));

    expect(gridDimmed(container)).toBe(false);
    expect(cellText(container)).toContain('5defects·90d');
  });

  test('a background success clears an error card left by an earlier failed load', async () => {
    const { container } = await mount();
    await answerNext(serverError());
    expect(container.querySelector('[data-testid="bugs-heatmap-error"]')).not.toBeNull();

    await status('SUBSCRIBED');
    await waitForDebounce();
    await answerNext(ok(report(2, '2026-11-17T10:02:00.000Z')));

    expect(container.querySelector('[data-testid="bugs-heatmap-error"]')).toBeNull();
    expect(cellText(container)).toContain('2defects');
  });

  test('AC-10: unmounting removes the channel and drops a pending refresh', async () => {
    const view = await mountWatching();
    const channel = liveChannel();

    await insertEvent();
    act(() => { view.root.unmount(); });
    mounted = mounted.filter(m => m.root !== view.root);
    await waitForDebounce();

    expect(channel.removed).toBe(true);
    expect(pending()).toHaveLength(0);
  });

  test('AC-10: a Project change tears the old channel down and listens to the new Project', async () => {
    const view = await mountWatching();
    const oldChannel = liveChannel();

    act(() => { view.root.render(createElement(BugsHeatmapView, { projectId: OTHER_PROJECT })); });
    await flush();

    expect(oldChannel.removed).toBe(true);
    expect(liveChannel(OTHER_PROJECT).filter?.filter).toBe(`project_id=eq.${OTHER_PROJECT}`);
  });

  test('AC-10: remounting opens a fresh channel under a new topic, never the one being removed', async () => {
    const first = await mount();
    const firstName = liveChannel().name;
    act(() => { first.root.unmount(); });
    mounted = mounted.filter(m => m.root !== first.root);

    await mount();

    expect(liveChannel().name).not.toBe(firstName);
  });
});
