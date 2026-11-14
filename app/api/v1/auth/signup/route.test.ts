import { describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Request-scoping shims only (same as the magic-link and resend suites): the
// cases below are refused by the REAL Zod schema before Supabase is called.
void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { POST } = await import('./route');
const { RESERVED_EMAIL_DOMAIN_MESSAGE } = await import('@lib/auth/reserved-email-domain');

interface ErrorBody { error?: { code?: string, details?: Array<{ code?: string, maximum?: number, message?: string, path?: string[] }> } }

function signupRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('BK-1829 — POST /api/v1/auth/signup password limit', () => {
  it.each([73, 100, 128])('answers 422 too_big (maximum 72) for a %i-character password', async (n) => {
    const response = await POST(signupRequest({ email: 'someone@bunkai.io', password: 'a'.repeat(n) }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('validation_failed');
    expect(body.error?.details?.[0]?.code).toBe('too_big');
    expect(body.error?.details?.[0]?.maximum).toBe(72);
    expect(body.error?.details?.[0]?.path).toEqual(['password']);
  });
});

// A local part of 64 plus domain labels under `.bunkai.io`, padded to `length`.
function emailOfLength(length: number): string {
  const local = 'l'.repeat(64);
  const tail = '.bunkai.io';
  let domain = '';
  while (local.length + 1 + domain.length + tail.length < length) {
    const room = length - (local.length + 1 + domain.length + tail.length);
    const label = 'm'.repeat(Math.min(63, domain ? room - 1 : room));
    domain = domain ? `${domain}.${label}` : label;
  }
  const email = `${local}@${domain}${tail}`;
  expect(email.length).toBe(length);
  return email;
}

describe('BK-1830 — POST /api/v1/auth/signup email limit', () => {
  it.each([254, 255])('answers 422 too_big (maximum 253) for a %i-character email', async (n) => {
    const response = await POST(signupRequest({ email: emailOfLength(n), password: 'a-valid-password' }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('validation_failed');
    expect(body.error?.details?.[0]?.code).toBe('too_big');
    expect(body.error?.details?.[0]?.maximum).toBe(253);
    expect(body.error?.details?.[0]?.path).toEqual(['email']);
  });
});

describe('BK-1877 — POST /api/v1/auth/signup reserved email domain', () => {
  it.each([
    'qa.bk1786.1@example.com',
    'someone@mail.example.org',
    'someone@EXAMPLE.NET',
    'someone@foo.test',
    'someone@host.invalid',
  ])('answers 422 with the reserved-domain rule for %s', async (email) => {
    const response = await POST(signupRequest({ email, password: 'a-valid-password' }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('validation_failed');
    expect(body.error?.details).toHaveLength(1);
    expect(body.error?.details?.[0]?.code).toBe('custom');
    expect(body.error?.details?.[0]?.message).toBe(RESERVED_EMAIL_DOMAIN_MESSAGE);
    expect(body.error?.details?.[0]?.path).toEqual(['email']);
  });
});
