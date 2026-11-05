'use client';

import type { Session, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { handleAuthChangeRedirect } from '@lib/account/auth-redirect';
import { createClient } from '@lib/supabase/client';
import { createContext, use, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

interface AuthActions {
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
}

interface AuthContextValue extends AuthState, AuthActions {}

// What the server render and the first client render both see. One constant, so
// `useSyncExternalStore` gets the same reference on every call.
const INITIAL_AUTH_STATE: AuthState = { user: null, session: null, loading: true };

interface AuthStore {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => AuthState
  setState: (next: AuthState) => void
}

function createAuthStore(): AuthStore {
  let snapshot = INITIAL_AUTH_STATE;
  const listeners = new Set<() => void>();
  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => { listeners.delete(onChange); };
    },
    getSnapshot: () => snapshot,
    setState: (next) => {
      snapshot = next;
      listeners.forEach(onChange => onChange());
    },
  };
}

// BK-1618 — the context carries a store and two stable actions, never the auth
// state itself, so its value keeps one identity for the provider's whole life.
// The session resolves on the client right after hydration (`getSession` and
// the `INITIAL_SESSION` event). When that resolution changed the context value,
// React treated every Suspense boundary below it that was not hydrated yet as
// changed and rendered it again on the client, while the server copy of the
// same content still sat in React's hidden streaming container (React 19.2
// holds a streamed boundary there for up to ~300 ms before revealing it): the
// Tests list showed two `tests-list` containers. Consumers subscribe to the
// store instead, so only they re-render when the session lands. Exported so a
// test can check that identity; app code reads it through `useAuth()`.
export const AuthContext = createContext<{ store: AuthStore } & AuthActions | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [store] = useState(createAuthStore);
  const setState = store.setState;

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setState({
        user: data.session?.user ?? null,
        session: data.session,
        loading: false,
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      });
      // Multi-tab / multi-device sign-out (BK-86, Scenario D) — this ALSO
      // fires in the tab that itself called signOut(), before that tab's own
      // post-signOut() redirect runs, so it must use a hard navigation, not a
      // soft router.replace()/push() (BK-176). See handleAuthChangeRedirect's
      // default for the full rationale; the decision is a pure, unit-tested
      // helper.
      handleAuthChangeRedirect(event);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, setState]);

  const signInWithMagicLink = useCallback(
    async (email: string, redirectTo?: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      return { error: error ?? null };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error ?? null };
  }, [supabase]);

  const value = useMemo(
    () => ({ store, signInWithMagicLink, signOut }),
    [store, signInWithMagicLink, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  const { store, signInWithMagicLink, signOut } = ctx;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerAuthSnapshot);
  return { ...state, signInWithMagicLink, signOut };
}

function getServerAuthSnapshot(): AuthState {
  return INITIAL_AUTH_STATE;
}
