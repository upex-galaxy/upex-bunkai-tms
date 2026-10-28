import type { ChatMessage } from '@lib/chat/messages';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-1283 — opening the Team Chat dock downloaded the whole channel history.
// The first Realtime SUBSCRIBED ran the reconnect catch-up before the newest
// page (30) had landed, so the cursor was `lastSeq([])` = 0 and the panel
// asked for `after_seq=0`, looping over every 200-row page. And the page
// itself overwrote the list, dropping a realtime row that landed while it was
// in flight.
//
// Rendered with happy-dom like BillingOverviewView.test.ts (DOM registered in
// this file, React imported dynamically after it). The Supabase browser client
// is faked so the test drives the channel status by hand; the real
// `subscribeWithUserAuth` runs against it (that module is NOT mocked: Bun's
// `mock.module` is process-wide and would bleed into realtime-auth.test.ts).
// Every `/messages` request hangs until the test settles it, so the order
// "SUBSCRIBED before / after the page" is chosen, not raced.
GlobalRegistrator.register();
// Release the DOM when this file is done, so the next React suite in the same
// `bun test` process (BillingOverviewView.test.ts) can register its own.
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type StatusCallback = (status: string) => void;
type ChangeHandler = (payload: { eventType: string, new: unknown }) => void;

interface FakeChannel {
  name: string
  statusCallback: StatusCallback | null
  changeHandler: ChangeHandler | null
}

let channels: FakeChannel[] = [];

function fakeChannel(name: string) {
  const record: FakeChannel = { name, statusCallback: null, changeHandler: null };
  channels.push(record);
  const channel = {
    on(type: string, _filter: unknown, handler: ChangeHandler) {
      if (type === 'postgres_changes') { record.changeHandler = handler; }
      return channel;
    },
    subscribe(callback?: StatusCallback) {
      record.statusCallback = callback ?? null;
      return channel;
    },
    presenceState: () => ({}),
    track: async () => 'ok',
  };
  return channel;
}

const fakeClient = {
  channel: (name: string) => fakeChannel(name),
  removeChannel: async () => 'ok',
  realtime: { setAuth: async () => undefined },
};

void mock.module('@lib/supabase/client', () => ({ createClient: () => fakeClient }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ChatPanel } = await import('@components/chat/ChatPanel');

const WS = 'ws-1283';
const realSetTimeout = globalThis.setTimeout;
const realWindowSetTimeout = window.setTimeout;
const realFetch = globalThis.fetch;
// Mirrors `CHAT_PAGE_RETRY_MS` in the component (not exported). Only timers at
// or above this delay are trapped; React and happy-dom schedule far shorter ones.
const PAGE_RETRY_MIN_DELAY_MS = 2000;
let retryTimers: Array<() => void> = [];

interface PendingRequest {
  url: URL
  resolve: (value: Response) => void
  answered: boolean
}

let messageRequests: PendingRequest[] = [];
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function msg(seq: number): ChatMessage {
  return {
    id: `m${seq}`,
    seq,
    channel_id: 'c1',
    workspace_id: WS,
    author_user_id: 'u-other',
    body: `message ${seq}`,
    created_at: '2026-10-28T10:00:00.000Z',
  };
}

function range(from: number, to: number): ChatMessage[] {
  return Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
}

function page(items: ChatMessage[], hasMore: boolean): Response {
  return new Response(JSON.stringify({ items, has_more: hasMore }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function messagesChannel(): FakeChannel {
  const found = channels.find(c => c.name === `chat-${WS}`);
  if (!found?.statusCallback || !found.changeHandler) { throw new Error('chat channel not joined'); }
  return found;
}

async function status(next: string): Promise<void> {
  const channel = messagesChannel();
  await act(async () => { channel.statusCallback?.(next); });
  await flush();
}

async function deliver(row: ChatMessage, eventType = 'INSERT'): Promise<void> {
  const channel = messagesChannel();
  await act(async () => { channel.changeHandler?.({ eventType, new: row }); });
  await flush();
}

// The query of every `/messages` GET, in order (`''` = the newest page).
function messageQueries(): string[] {
  return messageRequests.map(r => r.url.search.replace(/^\?/, ''));
}

function takeRequest(query: string): PendingRequest {
  const found = messageRequests.find(r => !r.answered && r.url.search.replace(/^\?/, '') === query);
  if (!found) { throw new Error(`no request with query "${query}" (seen: ${JSON.stringify(messageQueries())})`); }
  return found;
}

async function answer(query: string, response: Response): Promise<void> {
  const request = takeRequest(query);
  request.answered = true;
  await act(async () => { request.resolve(response); });
  await flush();
}

function renderedSeqs(container: HTMLElement): number[] {
  return [...container.querySelectorAll('[data-testid="chat_message"]')].map(el => Number(el.getAttribute('data-seq')));
}

async function fireRetryTimers(): Promise<void> {
  const timers = retryTimers;
  retryTimers = [];
  await act(async () => { timers.forEach((fire) => { fire(); }); });
  await flush();
}

function unmountAll(): void {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ChatPanel, {
      workspaceId: WS,
      userId: 'u-self',
      role: 'member',
      open: true,
      onClose: () => {},
      onUnreadChange: () => {},
    }));
  });
  mounted.push({ container, root });
  // Let `setAuth()` resolve so both channels join (status callbacks captured).
  await flush();
  return container;
}

beforeEach(() => {
  channels = [];
  messageRequests = [];
  mounted = [];
  retryTimers = [];
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (typeof handler === 'function' && (delay ?? 0) >= PAGE_RETRY_MIN_DELAY_MS) {
      retryTimers.push(handler as () => void);
      return 0;
    }
    return (realWindowSetTimeout as unknown as (...rest: unknown[]) => unknown)(handler, delay, ...args);
  }) as unknown as typeof window.setTimeout;
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === `/api/v1/workspaces/${WS}/chat/messages`) {
      return new Promise<Response>((resolve) => { messageRequests.push({ url, resolve, answered: false }); });
    }
    if (url.pathname.endsWith('/roster')) {
      return new Response(JSON.stringify({ members: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ cards: {} }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  unmountAll();
  window.setTimeout = realWindowSetTimeout;
  globalThis.fetch = realFetch;
});

describe('ChatPanel — first open loads only the newest page (BK-1283)', () => {
  test('SUBSCRIBED before the page lands: no catch-up until the page, then one from its newest seq, never after_seq=0', async () => {
    const container = await mount();
    expect(messageQueries()).toEqual(['']);

    await status('SUBSCRIBED');
    // The cursor is unknown: nothing is fetched yet.
    expect(messageQueries()).toEqual(['']);

    await answer('', page(range(11, 40), true));
    expect(messageQueries()).toEqual(['', 'after_seq=40']);

    await answer('after_seq=40', page([], false));
    expect(messageQueries()).not.toContain('after_seq=0');
    expect(renderedSeqs(container)).toEqual(range(11, 40).map(m => m.seq));
  });

  test('page lands, then SUBSCRIBED: one catch-up from the newest held seq', async () => {
    await mount();
    await answer('', page(range(11, 40), true));
    expect(messageQueries()).toEqual(['']);

    await status('SUBSCRIBED');
    expect(messageQueries()).toEqual(['', 'after_seq=40']);
  });

  test('a message posted between the page read and the join is fetched by the gap catch-up, once', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await answer('', page(range(11, 40), true));
    await answer('after_seq=40', page([msg(41)], false));

    expect(renderedSeqs(container)).toEqual(range(11, 41).map(m => m.seq));
  });

  test('a realtime row that lands while the page is in flight survives the page and is not duplicated', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await deliver(msg(42));

    await answer('', page(range(11, 40), true));
    // The gap catch-up starts at the PAGE's newest seq (40), not at the held 42:
    // seq is a global identity, so 41 may be a message the join missed.
    expect(messageQueries()).toEqual(['', 'after_seq=40']);

    await answer('after_seq=40', page([msg(41), msg(42)], false));
    expect(renderedSeqs(container)).toEqual(range(11, 42).map(m => m.seq));
  });

  test('a reconnect after a drop catches up from the newest message held', async () => {
    await mount();
    await answer('', page(range(11, 40), true));
    await status('SUBSCRIBED');
    await answer('after_seq=40', page([], false));
    await deliver(msg(43));

    await status('CLOSED');
    await status('SUBSCRIBED');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=43']);
  });

  test('the realtime row survives even when the gap catch-up fails', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await deliver(msg(42));
    await answer('', page(range(11, 40), true));
    await answer('after_seq=40', new Response('{}', { status: 503 }));

    expect(renderedSeqs(container)).toEqual([...range(11, 40).map(m => m.seq), 42]);
  });

  test('a catch-up longer than one server page advances its cursor by the response, not by a newer realtime row', async () => {
    await mount();
    await status('SUBSCRIBED');
    await deliver(msg(50));
    await answer('', page(range(11, 40), true));
    await answer('after_seq=40', page(range(41, 45), true));

    // 46..49 are still owed: the next page starts after 45, not after the held 50.
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=45']);
  });

  test('a failed first page is retried on reconnect instead of downloading the whole history', async () => {
    const container = await mount();
    await answer('', new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }));
    expect(container.querySelector('[data-testid="chat_error"]')).not.toBeNull();

    await status('SUBSCRIBED');
    expect(messageQueries()).toEqual(['', '']);

    const retry = messageRequests[1];
    await act(async () => { retry.resolve(page(range(11, 40), true)); });
    await flush();
    expect(messageQueries()).toEqual(['', '', 'after_seq=40']);
    expect(container.querySelector('[data-testid="chat_error"]')).toBeNull();
  });
  test('SUBSCRIBED, then the newest page fails: one delayed retry loads it, then exactly one catch-up from its newest seq', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await answer('', new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }));
    expect(container.querySelector('[data-testid="chat_error"]')).not.toBeNull();
    expect(retryTimers).toHaveLength(1);

    await fireRetryTimers();
    expect(messageQueries()).toEqual(['', '']);

    const retry = messageRequests[1];
    await act(async () => { retry.resolve(page(range(11, 40), true)); });
    await flush();
    expect(messageQueries()).toEqual(['', '', 'after_seq=40']);
    expect(container.querySelector('[data-testid="chat_error"]')).toBeNull();
    expect(retryTimers).toHaveLength(0);
  });

  test('a failed gap catch-up is resumed from its own cursor on the next reconnect, not from a newer held row', async () => {
    await mount();
    await status('SUBSCRIBED');
    await deliver(msg(42));
    await answer('', page(range(11, 40), true));
    await answer('after_seq=40', new Response('{}', { status: 503 }));

    // Held: 11..40 and 42. 41 was never fetched, so the reconnect asks after 40.
    await status('CLOSED');
    await status('SUBSCRIBED');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);

    // Once a catch-up completes, the next reconnect starts from the newest held seq.
    await answer('after_seq=40', page([msg(41), msg(42)], false));
    await status('CLOSED');
    await status('SUBSCRIBED');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40', 'after_seq=42']);
  });

  test('an edit or tombstone of a message that is not loaded is ignored; one of a held message is applied', async () => {
    const container = await mount();
    await answer('', page(range(11, 40), true));
    await status('SUBSCRIBED');
    await answer('after_seq=40', page([], false));

    await deliver({ ...msg(5), body: 'edited old', edited_at: '2026-10-28T11:00:00.000Z' }, 'UPDATE');
    await deliver({ ...msg(6), body: '', deleted_at: '2026-10-28T11:00:00.000Z' }, 'UPDATE');
    expect(renderedSeqs(container)[0]).toBe(11);
    expect(renderedSeqs(container)).toHaveLength(30);

    await deliver({ ...msg(20), body: 'edited twenty', edited_at: '2026-10-28T11:00:00.000Z' }, 'UPDATE');
    expect(container.textContent).toContain('edited twenty');
  });

  test('a catch-up stops paging once the panel unmounts', async () => {
    await mount();
    await status('SUBSCRIBED');
    await answer('', page(range(11, 40), true));
    expect(messageQueries()).toEqual(['', 'after_seq=40']);

    unmountAll();
    await answer('after_seq=40', page(range(41, 45), true));
    expect(messageQueries()).toEqual(['', 'after_seq=40']);
  });
});
