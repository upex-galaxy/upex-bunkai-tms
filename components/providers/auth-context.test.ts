import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-1618 — the auth context value keeps one identity while the session
// resolves on the client (`getSession` and the `INITIAL_SESSION` event). A new
// value at that moment is a context change above every Suspense boundary of
// the app; on a full page load React renders a boundary it has not hydrated yet
// again on the client, next to the server copy still waiting in its hidden
// streaming container (two Tests lists). `useAuth()` still reports the session.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USER = { id: 'u1', email: 'qa@example.test' };
const SESSION = { user: USER, access_token: 'not-a-real-token' };
let unsubscribed = 0;
const subscription = { unsubscribe: () => { unsubscribed += 1; } };
// One client object for the whole file, like the memoized browser client.
const client = {
  auth: {
    getSession: async () => ({ data: { session: SESSION } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('INITIAL_SESSION', SESSION));
      return { data: { subscription } };
    },
    signInWithOtp: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
};
void mock.module('@lib/supabase/client', () => ({ createClient: () => client }));
// The real redirect handler stays in place: it acts on SIGNED_OUT only, and a
// mock of it would leak into its own test file within one bun process.

const { act, createElement, use } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AuthContext, AuthProvider, useAuth } = await import('./auth-context');

let mounted: { container: HTMLElement, root: { unmount: () => void } } | null = null;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

async function renderProbes() {
  const contextValues: unknown[] = [];
  const users: Array<{ id: string } | null> = [];
  function ContextProbe() {
    contextValues.push(use(AuthContext));
    return null;
  }
  function UserProbe() {
    users.push(useAuth().user);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(ContextProbe), createElement(UserProbe)));
  });
  // Let `getSession` and the queued `INITIAL_SESSION` event land.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { contextValues, users };
}

describe('AuthProvider', () => {
  test('keeps one context value while the session resolves', async () => {
    const { contextValues } = await renderProbes();
    expect(contextValues.length).toBeGreaterThan(0);
    expect(new Set(contextValues).size).toBe(1);
  });

  test('still reports the resolved user through useAuth', async () => {
    const { users } = await renderProbes();
    expect(users[0]).toBeNull();
    expect(users[users.length - 1]).toBe(USER);
  });

  test('unsubscribes from auth events on unmount', async () => {
    const before = unsubscribed;
    await renderProbes();
    const { container, root } = mounted!;
    act(() => root.unmount());
    container.remove();
    mounted = null;
    expect(unsubscribed).toBe(before + 1);
  });
});
