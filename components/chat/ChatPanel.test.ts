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
type SystemHandler = (payload: { extension: string, status: string, message?: string }) => void;

interface FakeChannel {
  name: string
  statusCallback: StatusCallback | null
  changeHandler: ChangeHandler | null
  systemHandler: SystemHandler | null
}

let channels: FakeChannel[] = [];

function fakeChannel(name: string) {
  const record: FakeChannel = { name, statusCallback: null, changeHandler: null, systemHandler: null };
  channels.push(record);
  const channel = {
    on(type: string, _filter: unknown, handler: ChangeHandler & SystemHandler) {
      if (type === 'postgres_changes') { record.changeHandler = handler; }
      if (type === 'system') { record.systemHandler = handler; }
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

// A Realtime `system` frame on the chat channel (BK-1281).
async function system(extension: string, frameStatus: string, message?: string): Promise<void> {
  const channel = messagesChannel();
  await act(async () => { channel.systemHandler?.({ extension, status: frameStatus, message }); });
  await flush();
}

function liveChip(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="chat_live_chip"]')?.getAttribute('data-state') ?? null;
}

function offlineBanner(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="chat_offline_banner"]') !== null;
}

function bannerText(container: HTMLElement): string {
  return container.querySelector('[data-testid="chat_offline_banner"]')?.textContent?.trim() ?? '';
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

describe('ChatPanel — header Live only when the message binding is accepted (BK-1281)', () => {
  const BINDING_ERROR = 'Unable to subscribe to changes with given parameters: invalid column for filter workspace_id';
  const OK = 'Subscribed to PostgreSQL';
  const UNAVAILABLE_COPY = 'Live updates are unavailable. Reload the page to retry.';
  const RECONNECTING_COPY = 'Connection lost. Reconnecting';

  // Page 11..40 loaded, joined, gap catch-up answered empty: a settled dock.
  async function settled(): Promise<HTMLElement> {
    const container = await mount();
    await answer('', page(range(11, 40), true));
    await status('SUBSCRIBED');
    await answer('after_seq=40', page([], false));
    return container;
  }

  test('SUBSCRIBED + postgres_changes system error: not Live, banner says live updates are unavailable', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await system('postgres_changes', 'error', BINDING_ERROR);

    expect(liveChip(container)).toBe('offline');
    expect(offlineBanner(container)).toBe(true);
    expect(bannerText(container)).toBe(UNAVAILABLE_COPY);
  });

  test('a transport drop keeps the reconnecting copy', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await system('postgres_changes', 'ok', OK);
    await status('CHANNEL_ERROR');

    expect(liveChip(container)).toBe('offline');
    expect(bannerText(container)).toStartWith(RECONNECTING_COPY);
    expect(bannerText(container)).not.toContain('unavailable');
  });

  test('a binding error followed by a transport drop shows the reconnecting copy (the rejoin re-subscribes)', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await system('postgres_changes', 'error', BINDING_ERROR);
    await status('CLOSED');

    expect(bannerText(container)).toStartWith(RECONNECTING_COPY);
  });

  test('SUBSCRIBED alone is still connecting; the postgres_changes ok frame makes it Live', async () => {
    const container = await mount();
    expect(liveChip(container)).toBe('connecting');

    await status('SUBSCRIBED');
    expect(liveChip(container)).toBe('connecting');
    expect(offlineBanner(container)).toBe(false);

    await system('postgres_changes', 'ok', OK);
    expect(liveChip(container)).toBe('live');
    expect(offlineBanner(container)).toBe(false);
  });

  test('the first ok catches up a message committed between SUBSCRIBED and the binding going active', async () => {
    const container = await settled();
    await system('postgres_changes', 'ok', OK);
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);

    await answer('after_seq=40', page([msg(41)], false));
    expect(renderedSeqs(container)).toEqual(range(11, 41).map(m => m.seq));
  });

  test('SUBSCRIBED + ok in quick succession never run two overlapping catch-ups: one in flight, one follow-up', async () => {
    const container = await mount();
    await answer('', page(range(11, 40), true));
    await status('SUBSCRIBED');
    await system('postgres_changes', 'ok', OK);
    // The ok arrived while the SUBSCRIBED catch-up is still in flight: queued.
    expect(messageQueries()).toEqual(['', 'after_seq=40']);

    await answer('after_seq=40', page([msg(41)], false));
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=41']);
    await answer('after_seq=41', page([msg(42)], false));
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=41']);
    expect(renderedSeqs(container)).toEqual(range(11, 42).map(m => m.seq));
  });

  test('a repeated ok (silent CDC re-subscribe) runs one catch-up from the newest held seq', async () => {
    const container = await settled();
    await system('postgres_changes', 'ok', OK);
    await answer('after_seq=40', page([], false));
    await deliver(msg(41));
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);

    await system('postgres_changes', 'ok', OK);
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40', 'after_seq=41']);
    await answer('after_seq=41', page([msg(42), msg(43)], false));
    expect(liveChip(container)).toBe('live');
    expect(renderedSeqs(container)).toEqual(range(11, 43).map(m => m.seq));
  });

  test('error then a successful rejoin returns to Live, with the usual reconnect catch-up', async () => {
    const container = await settled();
    await system('postgres_changes', 'error', BINDING_ERROR);
    expect(liveChip(container)).toBe('offline');

    await status('CLOSED');
    expect(liveChip(container)).toBe('offline');
    await status('SUBSCRIBED');
    // The rejoin's binding is not confirmed yet: never Live on the old verdict.
    expect(liveChip(container)).toBe('connecting');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);
    await system('postgres_changes', 'ok', OK);

    expect(liveChip(container)).toBe('live');
    expect(offlineBanner(container)).toBe(false);
    // The ok's catch-up waits for the rejoin's one, then runs once.
    await answer('after_seq=40', page([], false));
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40', 'after_seq=40']);
  });

  test('error then the server retry succeeds on the same join: Live again, and one catch-up for what the dead binding missed', async () => {
    const container = await settled();
    await system('postgres_changes', 'ok', OK);
    await answer('after_seq=40', page([], false));
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);

    await system('postgres_changes', 'error', BINDING_ERROR);
    expect(liveChip(container)).toBe('offline');
    expect(messageQueries()).toHaveLength(3);
    await system('postgres_changes', 'ok', OK);

    expect(liveChip(container)).toBe('live');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40', 'after_seq=40']);
  });

  test('a system frame for another extension leaves the binding verdict alone and runs no catch-up', async () => {
    const container = await settled();
    await system('postgres_changes', 'ok', OK);
    await answer('after_seq=40', page([], false));
    await system('system', 'error', 'unrelated');
    await system('system', 'ok', 'unrelated');

    expect(liveChip(container)).toBe('live');
    expect(messageQueries()).toEqual(['', 'after_seq=40', 'after_seq=40']);
  });

  test('CHANNEL_ERROR and TIMED_OUT are not Live, even after an accepted binding', async () => {
    const container = await mount();
    await status('SUBSCRIBED');
    await system('postgres_changes', 'ok', OK);
    expect(liveChip(container)).toBe('live');

    await status('CHANNEL_ERROR');
    expect(liveChip(container)).toBe('offline');
    expect(offlineBanner(container)).toBe(true);

    await status('TIMED_OUT');
    expect(liveChip(container)).toBe('offline');
  });
});

// BK-1282 — the composer counted UTF-16 units (`draft.trim().length`), so 2007
// characters with emoji showed 4002/4000 and disabled Send. It now counts code
// points, the unit the API and the DB CHECK use.
describe('ChatPanel — composer limit counts characters, not UTF-16 units (BK-1282)', () => {
  const GRIN = '\u{1F600}';

  async function type(container: HTMLElement, value: string): Promise<void> {
    const composer = container.querySelector<HTMLTextAreaElement>('[data-testid="chat_composer"]');
    if (!composer) { throw new Error('composer not rendered'); }
    // React tracks the value through the native setter; a plain assignment
    // would be swallowed and no onChange would fire.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!descriptor?.set) { throw new Error('no native value setter'); }
    await act(async () => {
      descriptor.set?.call(composer, value);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
  }

  function sendDisabled(container: HTMLElement): boolean {
    const send = container.querySelector<HTMLButtonElement>('[data-testid="chat_send"]');
    if (!send) { throw new Error('send button not rendered'); }
    return send.disabled;
  }

  function overLimitText(container: HTMLElement): string | null {
    return container.querySelector('[data-testid="chat_over_limit"]')?.textContent ?? null;
  }

  test('2007 characters with emoji stay under the limit and Send is enabled', async () => {
    const container = await mount();
    await answer('', page([], false));

    await type(container, `BK-215 TC7a ${GRIN.repeat(1995)}`);
    expect(overLimitText(container)).toBeNull();
    expect(sendDisabled(container)).toBe(false);
  });

  test('exactly 4000 emoji are allowed; 4001 show 4001/4000 and disable Send', async () => {
    const container = await mount();
    await answer('', page([], false));

    await type(container, GRIN.repeat(4000));
    expect(overLimitText(container)).toBeNull();
    expect(sendDisabled(container)).toBe(false);

    await type(container, ` ${GRIN.repeat(4001)}\n`);
    expect(overLimitText(container)).toBe('4001/4000');
    expect(sendDisabled(container)).toBe(true);
  });
});
