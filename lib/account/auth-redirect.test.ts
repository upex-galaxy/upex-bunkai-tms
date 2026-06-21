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
});
