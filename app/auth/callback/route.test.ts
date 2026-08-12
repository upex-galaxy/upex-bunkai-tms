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
// The cookie shim below starts with an EMPTY jar — exactly the state of a phone
// opening a link that a laptop requested — and RECORDS what the route writes
// back. Both halves matter: reading nothing is the cross-device condition, and
// capturing the writes is how `signs in` is asserted as "a session cookie was
// actually issued" rather than merely "we were redirected somewhere nice".
//
// `verifyOtp` is NOT mocked — these assertions drive the real exported `GET`, a
// real GoTrue-issued token, and a real verification round-trip.
//
// Note: `mock.module` is process-global in Bun and does not reset between files.
// This shim is a superset of the ones in the sibling auth route tests (it adds
// `get`/`delete`), so whichever registration wins, this file's assertions hold.
const cookieWrites: { name: string, value: string }[] = [];

void mock.module('server-only', () => ({}));
void mock.module('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
    delete: () => {},
    set: (name: string, value: string) => {
      cookieWrites.push({ name, value });
    },
  }),
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
    cookieWrites.length = 0;

    // `/settings`, not the `/projects` default — otherwise a redirect to
    // `/projects` could equally mean "next was honoured" or "safeInternalPath
    // fell back", and the assertion would not discriminate.
    const response = await GET(
      callbackRequest(`token_hash=${tokenHash}&type=magiclink&next=%2Fsettings`),
    );

    // Exact location: reaching `next` is only possible past a successful
    // verifyOtp, since every failure branch redirects to /login?error=. Under
    // the PKCE rail this same request produced an error every time.
    expect(locationOf(response)).toBe('https://app.test/settings');

    // And a session was really established — the route wrote Supabase's auth
    // cookie back. Without this, a regression to a client that verifies but
    // persists nothing would still pass the redirect assertion above.
    expect(cookieWrites.some(c => c.name.includes('auth-token'))).toBe(true);
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

  // The types below are all real GoTrue types the route deliberately does NOT
  // serve. `signup` would route around the verification-first gate in
  // /api/v1/auth/confirm; `recovery` would mint a session with no reset step;
  // `email_change` is the one with real blast radius. Each must be refused.
  for (const rejectedType of ['signup', 'recovery', 'invite', 'email_change'] as const) {
    it(`refuses type=${rejectedType} without spending the token`, async () => {
      const tokenHash = await mintTokenHash();

      const response = await GET(callbackRequest(`token_hash=${tokenHash}&type=${rejectedType}`));
      expect(locationOf(response)).toBe('https://app.test/login?error=magic_link_invalid');

      // Refused before GoTrue was ever called, so the token is still spendable.
      // This is what separates "we rejected it" from "GoTrue rejected it and
      // burned the token on the way".
      const after = await GET(callbackRequest(`token_hash=${tokenHash}&type=magiclink`));
      expect(locationOf(after)).not.toContain('error=');
    });
  }

  it('keeps `next` root-relative so a crafted link cannot redirect off-site', async () => {
    const tokenHash = await mintTokenHash();

    const response = await GET(
      callbackRequest(`token_hash=${tokenHash}&type=magiclink&next=https%3A%2F%2Fevil.test%2Fowned`),
    );
    // Exact location, not merely "does not contain evil.test" — that weaker form
    // is also satisfied by an error redirect, so it would pass even if
    // verification had failed outright.
    expect(locationOf(response)).toBe('https://app.test/projects');
  });

  it('does not answer an expired email link with OAuth consent copy', async () => {
    // GoTrue appends its own ?error= to the redirect when a link has expired.
    // With no `bkstate` this is the email rail, not a denied consent screen.
    const response = await GET(
      callbackRequest('error=access_denied&error_code=otp_expired'),
    );
    expect(locationOf(response)).toBe('https://app.test/login?error=magic_link_invalid');
  });
});

// Needs no Supabase credentials, so it runs everywhere — deliberately NOT
// behind `describeOrSkip`, or the one check that works offline would go quiet on
// exactly the machines that have no service-role key.
describe('BK-400 — every error code this route emits is renderable', () => {
  it('has a toast entry for each literal code in the route', async () => {
    const { LOGIN_ERROR_TOASTS } = await import('@lib/auth/login-errors');
    const source = await Bun.file(new URL('./route.ts', import.meta.url).pathname).text();

    // Pull the codes out of the route's own `/login?error=` redirects rather
    // than restating the list here — that restatement is how the vocabulary
    // drifted in the first place (`otp_exchange_failed` was emitted and rendered
    // nowhere). Anchored on `/login?` so prose in the header comment, which
    // quotes `?error=access_denied` as an inbound provider param, is not
    // mistaken for a code this route emits.
    const emitted = [...source.matchAll(/\/login\?error=([a-z_]+)/g)].map(m => m[1]);
    expect(emitted.length).toBeGreaterThan(0);

    for (const code of new Set(emitted)) {
      expect(LOGIN_ERROR_TOASTS).toHaveProperty(code);
    }
  });

  it('covers the codes the route computes rather than writes literally', async () => {
    // The scrape above cannot see `?error=${providerErrorToCode(...)}` — a
    // template literal is opaque to it, and those two codes are precisely the
    // ones it would silently skip. Assert over the function instead, so both
    // halves of the vocabulary are covered rather than just the easy half.
    const { LOGIN_ERROR_TOASTS, providerErrorToCode } = await import('@lib/auth/login-errors');

    for (const providerError of ['access_denied', 'server_error', 'anything_else']) {
      expect(LOGIN_ERROR_TOASTS).toHaveProperty(providerErrorToCode(providerError));
    }
    expect(providerErrorToCode('access_denied')).toBe('oauth_denied');
  });
});
