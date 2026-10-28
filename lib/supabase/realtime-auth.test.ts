import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeWithUserAuth } from '@lib/supabase/realtime-auth';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, test } from 'bun:test';

// BK-1279 — drives the REAL supabase-js client (auth-js + realtime-js +
// phoenix) through the page-reload path: a session already sits in auth
// storage, so auth-js restores it with INITIAL_SESSION (not SIGNED_IN). Only
// the WebSocket is faked, so the assertion is on the exact phx_join frame the
// browser would put on the wire.

const SUPABASE_URL = 'http://localhost:54321';
const ANON_KEY = 'anon-key-for-tests';
const STORAGE_KEY = 'sb-test-auth-token';
const USER_TOKEN = 'user-access-token-for-tests';

interface SentFrame {
  topic: string
  event: string
  payload: Record<string, unknown>
}

// Minimal WebSocket stand-in: opens on the next tick (like a real socket,
// never synchronously) and records every frame the client sends.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = 'arraybuffer';
  sent: SentFrame[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState !== 0) {
        return;
      }
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    // realtime-js 2.x (vsn 2.0.0) text frames: [join_ref, ref, topic, event, payload]
    const [, , topic, event, payload] = JSON.parse(data) as [string, string, string, string, Record<string, unknown>];
    this.sent.push({ topic, event, payload });
  }

  close() {
    this.readyState = 3;
  }
}

function storedSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: USER_TOKEN,
    refresh_token: 'refresh-token-for-tests',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'realtime-auth@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

// A client whose auth storage already holds a valid session: the state every
// browser tab is in after a reload or a navigation that rebuilds the page.
function createReloadedClient(): SupabaseClient {
  const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify(storedSession())]]);
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      storageKey: STORAGE_KEY,
      storage: {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => { store.set(key, value); },
        removeItem: (key) => { store.delete(key); },
      },
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: FakeWebSocket as unknown as typeof WebSocket,
    },
  });
}

function joinFrames(topic: string): SentFrame[] {
  return FakeWebSocket.instances
    .flatMap(socket => socket.sent)
    .filter(frame => frame.topic === `realtime:${topic}` && frame.event === 'phx_join');
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

let client: SupabaseClient | null = null;

afterEach(async () => {
  if (client) {
    await client.removeAllChannels();
    client = null;
  }
  FakeWebSocket.instances = [];
});

describe('subscribeWithUserAuth (BK-1279)', () => {
  test('pins the defect on supabase-js 2.106.x: a plain subscribe() after a reload joins with no access_token', async () => {
    client = createReloadedClient();
    const channel = client.channel('baseline').on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'workspace_id=eq.w1' },
      () => {},
    );

    channel.subscribe();
    await waitFor(() => joinFrames('baseline').length > 0);

    // If a future supabase-js bump makes this fail, the library started
    // carrying the token on its own; the helper stays correct either way.
    expect(joinFrames('baseline')[0].payload).not.toHaveProperty('access_token');
  });

  test('joins with the restored session\'s access token', async () => {
    client = createReloadedClient();
    const channel = client.channel('chat-w1').on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'workspace_id=eq.w1' },
      () => {},
    );

    subscribeWithUserAuth({ realtime: client.realtime, channel });
    await waitFor(() => joinFrames('chat-w1').length > 0);

    const [join] = joinFrames('chat-w1');
    expect(join.payload.access_token).toBe(USER_TOKEN);
  });

  test('carries the token on every channel of the same page (chat, presence, notifications, run)', async () => {
    client = createReloadedClient();
    const topics = ['chat-w1', 'chat-presence-w1', 'notifications-w1', 'run-r1'];

    for (const topic of topics) {
      subscribeWithUserAuth({ realtime: client.realtime, channel: client.channel(topic) });
    }
    await waitFor(() => topics.every(topic => joinFrames(topic).length > 0));

    for (const topic of topics) {
      expect(joinFrames(topic)[0].payload.access_token).toBe(USER_TOKEN);
    }
  });

  test('never joins a channel whose effect was cleaned up while the token was resolving', async () => {
    client = createReloadedClient();
    const channel = client.channel('cancelled');
    const statuses: string[] = [];

    const cancel = subscribeWithUserAuth({
      realtime: client.realtime,
      channel,
      callback: (status) => { statuses.push(String(status)); },
    });
    cancel();
    await client.removeChannel(channel);

    // A second, live channel proves the token resolved and the socket worked.
    subscribeWithUserAuth({ realtime: client.realtime, channel: client.channel('still-live') });
    await waitFor(() => joinFrames('still-live').length > 0);

    expect(joinFrames('cancelled')).toHaveLength(0);
    expect(statuses).toHaveLength(0);
  });

  test('still subscribes when the token lookup fails, so the status callback keeps reporting', async () => {
    client = createReloadedClient();
    const channel = client.channel('auth-failed');
    const realtime = {
      setAuth: async () => Promise.reject(new Error('token lookup failed')),
    };

    subscribeWithUserAuth({ realtime, channel });
    await waitFor(() => joinFrames('auth-failed').length > 0);

    expect(joinFrames('auth-failed')).toHaveLength(1);
  });
});
