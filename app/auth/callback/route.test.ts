import type { User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-400 — magic-link sign-in failed whenever the emailed link was opened on a
// device other than the one that requested it. The rail ran on PKCE, so
// `signInWithOtp` left a code verifier in the requesting browser's cookies and
// `exchangeCodeForSession` refused to complete without it:
// "PKCE code verifier not found in storage".
//
// Cross-device is the entire point of a magic link, so verification moved to the
// stateless `verifyOtp({ token_hash })` path.
//
// The cookie shim below returns an EMPTY cookie jar, and that is the load-bearing
// part of this file rather than boilerplate: no cookies is exactly the state of a
// phone opening a link that a laptop requested. A token minted here is verified
// with nothing remembered about the request, which is the property that was
// broken. `verifyOtp` is NOT mocked — these assertions drive the real exported
// `GET`, a real GoTrue-issued token, and a real verification round-trip.
void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined, delete: () => {} }),
}));

const { GET } = await import('./route');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function callbackRequest(query: string): NextRequest {
  return new NextRequest(`https://app.test/auth/callback?${query}`);
}

function locationOf(response: Response): string {
  return response.headers.get('location') ?? '';
}

describeOrSkip('BK-400 — GET /auth/callback (magic-link rail)', () => {
  const EMAIL = `bk400-callback-${Date.now()}@example.test`;
  let user: User | null = null;

  beforeAll(async () => {
    const { data, error } = await service().auth.admin.createUser({
      email: EMAIL,
      email_confirm: true,
    });
    if (error) { throw error; }
    user = data.user;
  });

  afterAll(async () => {
    if (user) { await service().auth.admin.deleteUser(user.id); }
  });

  // Mints a real magic-link token the way GoTrue mints the one it emails.
  async function mintTokenHash(): Promise<string> {
    const { data, error } = await service().auth.admin.generateLink({
      type: 'magiclink',
      email: EMAIL,
    });
    if (error) { throw error; }
    const hash = data.properties?.hashed_token;
    if (!hash) { throw new Error('GoTrue returned no hashed_token'); }
    return hash;
  }

  it('signs in from a request carrying no cookies at all (the cross-device case)', async () => {
    const tokenHash = await mintTokenHash();

    const response = await GET(
      callbackRequest(`token_hash=${tokenHash}&type=magiclink&next=%2Fprojects`),
    );

    // A redirect to `next` is only reachable past a successful verifyOtp — the
    // failure branch redirects to /login?error=. Under the PKCE rail this exact
    // request produced `otp_exchange_failed` every time.
    expect(locationOf(response)).toContain('/projects');
    expect(locationOf(response)).not.toContain('error=');
  });

  it('refuses a token that was already used, and says so in a code the UI renders', async () => {
    const tokenHash = await mintTokenHash();

    const first = await GET(callbackRequest(`token_hash=${tokenHash}&type=magiclink`));
    expect(locationOf(first)).not.toContain('error=');

    // Same hash, second time: GoTrue has consumed it.
    const second = await GET(callbackRequest(`token_hash=${tokenHash}&type=magiclink`));
    expect(locationOf(second)).toContain('error=magic_link_invalid');
  });

  it('refuses a forged token hash', async () => {
    const response = await GET(
      callbackRequest('token_hash=not-a-real-token-hash&type=magiclink'),
    );
    expect(locationOf(response)).toContain('error=magic_link_invalid');
  });

  it('refuses an OTP type outside the email rails without calling GoTrue', async () => {
    const tokenHash = await mintTokenHash();

    // `phone_change` is a real Supabase OTP type but not one this route serves.
    const response = await GET(callbackRequest(`token_hash=${tokenHash}&type=phone_change`));
    expect(locationOf(response)).toContain('error=magic_link_invalid');

    // Refused before reaching GoTrue, so the token must still be spendable.
    const after = await GET(callbackRequest(`token_hash=${tokenHash}&type=magiclink`));
    expect(locationOf(after)).not.toContain('error=');
  });

  it('keeps `next` root-relative so a crafted link cannot redirect off-site', async () => {
    const tokenHash = await mintTokenHash();

    const response = await GET(
      callbackRequest(`token_hash=${tokenHash}&type=magiclink&next=https%3A%2F%2Fevil.test%2Fowned`),
    );
    expect(locationOf(response)).not.toContain('evil.test');
  });
});

describeOrSkip('BK-400 — every error code this route emits is renderable', () => {
  it('has a toast entry for each code, so no failure is silent', async () => {
    const { LOGIN_ERROR_TOASTS } = await import('@lib/auth/login-errors');
    const source = await Bun.file(
      new URL('./route.ts', import.meta.url).pathname,
    ).text();

    // Pull the codes out of the route's own `/login?error=` redirects rather
    // than restating the list here — that restatement is how the vocabulary
    // drifted in the first place (`otp_exchange_failed` was emitted and rendered
    // nowhere). Anchored on `/login?` so prose in the header comment, which
    // quotes `?error=access_denied` as an inbound provider param, is not mistaken
    // for a code this route emits.
    const emitted = [...source.matchAll(/\/login\?error=([a-z_]+)/g)].map(m => m[1]);
    expect(emitted.length).toBeGreaterThan(0);

    for (const code of new Set(emitted)) {
      expect(LOGIN_ERROR_TOASTS).toHaveProperty(code);
    }
  });
});
