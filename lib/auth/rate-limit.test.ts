import { describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-test-key';

const { digestSource, rateLimitKey, sourceFromHeaders } = await import('./rate-limit');

describe('rate-limit helpers (BK-743)', () => {
  it('builds scope:identifier:step keys', () => {
    expect(rateLimitKey({ scope: 'source', identifier: 'abc', step: 'check-email' })).toBe('source:abc:check-email');
  });

  it('digests the source: stable, salted, never the raw address', () => {
    const d = digestSource('203.0.113.7', 'secret-a');
    expect(d).toBe(digestSource('203.0.113.7', 'secret-a'));
    expect(d).not.toContain('203.0.113.7');
    expect(d).not.toBe(digestSource('203.0.113.7', 'secret-b'));
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads only platform-asserted headers', () => {
    expect(sourceFromHeaders(new Headers({ 'x-vercel-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
    expect(sourceFromHeaders(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(sourceFromHeaders(new Headers({ 'x-forwarded-for': '9.9.9.9' }))).toBe('unknown');
  });
});
