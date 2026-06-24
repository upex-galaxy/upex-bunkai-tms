import { describe, expect, it } from 'bun:test';
import { isOAuthProvider, OAUTH_ERROR_TOASTS, OAUTH_PROVIDERS } from './oauth';

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

describe('OAUTH_ERROR_TOASTS', () => {
  it('marks the security error destructive', () => {
    expect(OAUTH_ERROR_TOASTS.oauth_state_mismatch.variant).toBe('destructive');
  });

  it('has no email_exists code (automatic identity linking, AC-7)', () => {
    expect('email_exists' in OAUTH_ERROR_TOASTS).toBe(false);
  });

  it('keeps consent-denied + init-failure non-destructive with a fallback hint', () => {
    expect(OAUTH_ERROR_TOASTS.oauth_denied.variant).toBe('default');
    expect(OAUTH_ERROR_TOASTS.oauth_denied.description.toLowerCase()).toContain('magic-link');
    expect(OAUTH_ERROR_TOASTS.oauth_init_failed.variant).toBe('default');
  });
});
