import type { AuthChangeEvent } from '@supabase/supabase-js';
import { handleAuthChangeRedirect } from '@lib/account/auth-redirect';
import { describe, expect, mock, test } from 'bun:test';

describe('handleAuthChangeRedirect', () => {
  test('redirects to /login on SIGNED_OUT (multi-tab termination, Scenario D)', () => {
    const replace = mock((_path: string) => {});
    handleAuthChangeRedirect('SIGNED_OUT', replace);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  test('does not redirect on non-sign-out events', () => {
    const events: AuthChangeEvent[] = [
      'SIGNED_IN',
      'TOKEN_REFRESHED',
      'USER_UPDATED',
      'INITIAL_SESSION',
    ];
    for (const event of events) {
      const replace = mock((_path: string) => {});
      handleAuthChangeRedirect(event, replace);
      expect(replace).not.toHaveBeenCalled();
    }
  });

  test('defaults to a hard, full-page navigation when no navigate fn is supplied (BK-176)', () => {
    // Regression for BK-176: the auth-context.tsx listener used to inject
    // `path => router.replace(path)` — a Next.js soft client-side
    // navigation. supabase-js's signOut() awaits this listener before its
    // own promise resolves, so that soft navigation always fired BEFORE the
    // initiating tab's own post-signOut() redirect, and could silently fail
    // to commit (the sign-out UI stayed on-screen until a manual reload).
    // The listener now calls handleAuthChangeRedirect(event) with no
    // override, relying entirely on this default — so the default must
    // itself perform a hard navigation (window.location.assign), not
    // delegate to a soft router method.
    const assign = mock((_url: string) => {});
    const stubWindow = { location: { assign } };
    const globals = globalThis as unknown as { window?: typeof stubWindow };
    const previousWindow = globals.window;
    globals.window = stubWindow;
    try {
      handleAuthChangeRedirect('SIGNED_OUT');
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith('/login');
    }
    finally {
      globals.window = previousWindow;
    }
  });
});
