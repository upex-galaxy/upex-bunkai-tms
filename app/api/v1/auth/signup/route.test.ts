import { describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Request-scoping shims only (same as the magic-link and resend suites): the
// cases below are refused by the REAL Zod schema before Supabase is called.
void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { POST } = await import('./route');

interface ErrorBody { error?: { code?: string, details?: Array<{ code?: string, maximum?: number, path?: string[] }> } }

function signupRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('BK-1829 — POST /api/v1/auth/signup password limit', () => {
  it.each([73, 100, 128])('answers 422 too_big (maximum 72) for a %i-character password', async (n) => {
    const response = await POST(signupRequest({ email: 'someone@example.test', password: 'a'.repeat(n) }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('validation_failed');
    expect(body.error?.details?.[0]?.code).toBe('too_big');
    expect(body.error?.details?.[0]?.maximum).toBe(72);
    expect(body.error?.details?.[0]?.path).toEqual(['password']);
  });
});
