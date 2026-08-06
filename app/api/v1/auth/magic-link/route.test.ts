import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Same request-scoping shims as `app/api/v1/auth/resend/route.test.ts`: this
// handler builds the SSR client from `@lib/supabase/server`, which reads
// `next/headers`'s `cookies()` — meaningless inside a bare `bun:test` process.
// Only Next's request scoping is faked; `supabase.auth.signInWithOtp` is NOT
// mocked, so every assertion below drives the REAL exported `POST`, the REAL
// Zod schema, and a REAL call to Supabase Auth.
void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { POST } = await import('./route');

// BK-175 — the reported symptom was "the magic-link email carries a 6-digit
// code and the Check-your-inbox screen has nowhere to type it". The cause was
// not a missing input: `signInWithOtp` defaults `shouldCreateUser` to TRUE, so
// an address with no account was silently ENROLLED rather than rejected, and
// Supabase answered with the `Confirm signup` template (a code) instead of the
// `Magic Link` template (a link). An address that already has an account
// always received a link, which is why the flow worked for existing testers.
//
// Adding a code field would have papered over that split. Pinning
// `shouldCreateUser: false` keeps login and enrolment apart at the source.
//
// The second assertion guards the anti-enumeration stance `resend` /`signup` /
// `confirm` already hold: an unknown address must produce the SAME response as
// a known one, or the endpoint becomes an account oracle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function magicLinkRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface ErrorBody { error?: { code?: string, message?: string } }

describeOrSkip('BK-175 — POST /api/v1/auth/magic-link', () => {
  const UNKNOWN_EMAIL = `bk175-unknown-${Date.now()}@example.test`;

  afterAll(async () => {
    if (!hasEnv) { return; }
    // Fail loudly if the endpoint ever enrols the unknown address again: the
    // regression this test exists for leaves a real auth user behind.
    const { data } = await service().auth.admin.listUsers();
    const leaked = data?.users?.find(u => u.email === UNKNOWN_EMAIL);
    if (leaked) {
      await service().auth.admin.deleteUser(leaked.id);
      throw new Error(`BK-175 regression: ${UNKNOWN_EMAIL} was created by the magic-link route`);
    }
  });

  it('does not enrol an address that has no account', async () => {
    const response = await POST(magicLinkRequest({ email: UNKNOWN_EMAIL }));
    expect(response.status).toBeLessThan(500);

    const { data } = await service().auth.admin.listUsers();
    const created = data?.users?.some(u => u.email === UNKNOWN_EMAIL);
    expect(created).toBe(false);
  });

  it('answers an unknown address exactly like a delivered link (no account oracle)', async () => {
    const response = await POST(magicLinkRequest({ email: UNKNOWN_EMAIL }));

    // Same shape a real delivery returns — status, code, and body must not
    // let a caller tell the two apart.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean } & ErrorBody;
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
  });

  it('still rejects a malformed email before reaching Supabase', async () => {
    const response = await POST(magicLinkRequest({ email: 'not-an-email' }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('validation_failed');
  });
});
