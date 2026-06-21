'use client';

import type { Session, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { handleAuthChangeRedirect } from '@lib/account/auth-redirect';
import { createClient } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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
      // Multi-tab / multi-device sign-out (BK-86, Scenario D): supabase.auth
      // broadcasts SIGNED_OUT to every tab via localStorage. Redirect the other
      // tabs to /login so a session terminated anywhere takes effect everywhere.
      // The tab that called signOut() navigates itself; replace() here is
      // idempotent (no-op when already on /login). Decision is in a pure,
      // unit-tested helper.
      handleAuthChangeRedirect(event, path => router.replace(path));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, router]);

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
