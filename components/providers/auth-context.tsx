'use client';

import type { Session, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { handleAuthChangeRedirect } from '@lib/account/auth-redirect';
import { createClient } from '@lib/supabase/client';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

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
  }, [supabase]);

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

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signInWithMagicLink, signOut }),
    [state, signInWithMagicLink, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
