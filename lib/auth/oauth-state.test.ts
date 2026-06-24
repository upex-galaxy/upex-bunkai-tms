import { describe, expect, it } from 'bun:test';
import { generateOAuthState, OAUTH_STATE_COOKIE, oauthStateCookieOptions, stateMatches } from './oauth-state';

describe('generateOAuthState', () => {
  it('produces a non-empty string', () => {
    expect(generateOAuthState().length).toBeGreaterThan(0);
  });

  it('produces a unique value on each call', () => {
    const values = new Set(Array.from({ length: 100 }, () => generateOAuthState()));
    expect(values.size).toBe(100);
  });
});

describe('stateMatches', () => {
  it('returns true for identical states', () => {
    const state = generateOAuthState();
    expect(stateMatches(state, state)).toBe(true);
  });

  it('returns false for a mismatched state', () => {
    expect(stateMatches(generateOAuthState(), generateOAuthState())).toBe(false);
  });

  it('returns false when the cookie state is missing', () => {
    expect(stateMatches(null, generateOAuthState())).toBe(false);
    expect(stateMatches(undefined, 'abc')).toBe(false);
  });

  it('returns false when the query state is missing', () => {
    expect(stateMatches(generateOAuthState(), null)).toBe(false);
    expect(stateMatches('abc', undefined)).toBe(false);
  });

  it('returns false for an empty cookie value even if both are empty', () => {
    expect(stateMatches('', '')).toBe(false);
  });

  it('returns false when lengths differ (no partial match)', () => {
    expect(stateMatches('abcd', 'abc')).toBe(false);
  });
});

describe('oauthStateCookieOptions', () => {
  it('is httpOnly, lax, scoped to root, with a finite TTL', () => {
    const opts = oauthStateCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBeGreaterThan(0);
  });
});

describe('OAUTH_STATE_COOKIE', () => {
  it('is the namespaced bunkai cookie name', () => {
    expect(OAUTH_STATE_COOKIE).toBe('bk_oauth_state');
  });
});
