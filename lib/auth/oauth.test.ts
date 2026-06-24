import { describe, expect, it } from 'bun:test';
import { isOAuthProvider, mapOAuthExchangeError, OAUTH_ERROR_TOASTS, OAUTH_PROVIDERS } from './oauth';

describe('isOAuthProvider', () => {
  it('accepts the supported providers', () => {
    expect(isOAuthProvider('github')).toBe(true);
    expect(isOAuthProvider('google')).toBe(true);
  });

  it('rejects unsupported providers and non-strings', () => {
    expect(isOAuthProvider('gitlab')).toBe(false);
    expect(isOAuthProvider('apple')).toBe(false);
    expect(isOAuthProvider('')).toBe(false);
    expect(isOAuthProvider(null)).toBe(false);
    expect(isOAuthProvider(42)).toBe(false);
  });

  it('only declares github and google', () => {
    expect([...OAUTH_PROVIDERS]).toEqual(['github', 'google']);
  });
});

describe('mapOAuthExchangeError', () => {
  it('classifies a cross-provider email collision as email_exists', () => {
    expect(mapOAuthExchangeError({ message: 'A user with this email already exists' })).toBe('email_exists');
    expect(mapOAuthExchangeError({ code: 'identity_already_exists' })).toBe('email_exists');
    expect(mapOAuthExchangeError({ message: 'duplicate identity' })).toBe('email_exists');
  });

  it('classifies an unrelated failure as oauth_init_failed', () => {
    expect(mapOAuthExchangeError({ message: 'provider unavailable', status: 503 })).toBe('oauth_init_failed');
    expect(mapOAuthExchangeError({ code: 'pkce_failure' })).toBe('oauth_init_failed');
  });

  it('defaults to oauth_init_failed for a null/empty error', () => {
    expect(mapOAuthExchangeError(null)).toBe('oauth_init_failed');
    expect(mapOAuthExchangeError({})).toBe('oauth_init_failed');
  });
});

describe('OAUTH_ERROR_TOASTS', () => {
  it('marks the security + collision errors destructive', () => {
    expect(OAUTH_ERROR_TOASTS.email_exists.variant).toBe('destructive');
    expect(OAUTH_ERROR_TOASTS.oauth_state_mismatch.variant).toBe('destructive');
  });

  it('uses the exact AC-7 copy for email_exists', () => {
    expect(OAUTH_ERROR_TOASTS.email_exists.title).toBe('Account already exists');
    expect(OAUTH_ERROR_TOASTS.email_exists.description).toBe(
      'This email is registered via a different provider. Contact support to link accounts.',
    );
  });

  it('keeps consent-denied non-destructive with a fallback hint', () => {
    expect(OAUTH_ERROR_TOASTS.oauth_denied.variant).toBe('default');
    expect(OAUTH_ERROR_TOASTS.oauth_denied.description.toLowerCase()).toContain('magic-link');
  });
});
