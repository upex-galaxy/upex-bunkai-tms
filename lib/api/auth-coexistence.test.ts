import { mintUserJwt } from '@lib/api/user-jwt';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// `lib/api/pat.ts` and `lib/api/principal.ts` pull in `server-only` (via the
// admin/env modules); shim it so the module graph loads under Bun, then import
// the real code. Same convention as lib/jira/import-runner.test.ts. We test the
// REAL `resolveIdentity` / `mintPat` — only the server-only sentinel is faked.
void mock.module('server-only', () => ({}));
const { mintPat } = await import('@lib/api/pat');
const { resolveIdentity } = await import('@lib/api/principal');

// ADR-0001 / BK-166 DoD — cookie ⊥ PAT coexistence invariant.
//
// The promise: a browser cookie session and a Bearer PAT for the SAME account
// are fully independent — neither clobbers the other, and using / revoking /
// expiring one credential never invalidates the other. `resolveIdentity`
// (lib/api/principal.ts) is the single gateway that must collapse both into ONE
// `Principal` for the same `userId`. This file exercises the REAL gateway code.
//
// DB-dependent + env-guarded, modelled on rls-parity.test.ts: when the Supabase
// env is absent (CI without DB creds) the suite SKIPS rather than fails.
//
// COVERAGE NOTE — what this unit test does and does NOT cover:
//   • COVERED: the Bearer (PAT) rail end-to-end through `resolveIdentity` — a
//     real minted PAT resolves to `via:'bearer'` and the correct `userId`.
//   • COVERED: credential independence — revoking / expiring ONE token leaves a
//     SECOND token for the same user fully valid and resolvable (and vice
//     versa). This is the structural coexistence guarantee.
//   • COVERED (cookie-equivalent identity): the user JWT that the cookie path's
//     impersonating client carries resolves to the SAME `userId` at the RLS
//     layer — proving both rails map to one principal.
//   • NOT COVERED here: a literal browser cookie session through
//     `resolveIdentity`'s SSR branch, which needs Next's request-scoped
//     `cookies()` store (a server runtime, not a bun:test unit). The full
//     cookie sign-in → navigate → PAT-still-works round trip is covered by the
//     BK-166 Playwright smoke. We assert the structural invariant as strongly
//     as a unit harness allows.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && serviceKey && anonKey && jwtSecret);

const describeOrSkip = hasEnv ? describe : describe.skip;

const TEST_EMAIL = `bk166-coexistence-${Date.now()}@example.test`;
const TEST_PASSWORD = 'coexistence-pw-8chars';

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function bearerRequest(token: string): NextRequest {
  return new NextRequest('https://app.test/api/v1/ping', {
    headers: { authorization: `Bearer ${token}` },
  });
}

// Asserts the supplied promise rejects. Wrapping the await in a try/catch keeps
// the lint rule (ts/await-thenable) happy where `expect(p).rejects` confuses it,
// without ever silencing a rule.
async function expectRejects(promise: Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await promise;
  }
  catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

describeOrSkip('BK-166 — cookie/PAT coexistence invariant', () => {
  // Seed a single confirmed user we own for the whole suite, clean it up after.
  let userId: string | undefined;
  const createdTokenIds: string[] = [];

  async function ensureUser(): Promise<string> {
    if (userId) { return userId; }
    const admin = service();
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error('Failed to seed coexistence test user.');
    }
    userId = data.user.id;
    return userId;
  }

  afterAll(async () => {
    if (!hasEnv) { return; }
    const admin = service();
    for (const id of createdTokenIds) {
      await admin.from('access_token_secrets').delete().eq('token_id', id);
      await admin.from('access_tokens').delete().eq('id', id);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('resolves the same userId via Bearer (PAT) as the cookie-equivalent JWT', async () => {
    const uid = await ensureUser();
    const admin = service();

    const pat = await mintPat({
      admin,
      userId: uid,
      name: 'coexistence-bearer',
      scopes: ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    // Bearer rail through the REAL gateway.
    const principal = await resolveIdentity(bearerRequest(pat.token));
    expect(principal.via).toBe('bearer');
    expect(principal.userId).toBe(uid);

    // Cookie-equivalent identity: the cookie rail (resolveIdentity's SSR branch)
    // ultimately scopes data access through a user-bound JWT carrying
    // `sub = userId`. We mint that exact JWT (the same helper the impersonating
    // client uses) and assert it carries the same `sub` — proving the cookie
    // rail and the Bearer rail map to ONE principal. (The literal SSR cookie
    // round trip needs a server runtime; it is covered by the BK-166 smoke.)
    const cookieJwt = await mintUserJwt(uid, jwtSecret!);
    const [, payload] = cookieJwt.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string };
    expect(decoded.sub).toBe(uid);
    // And the user JWT actually authenticates against PostgREST as that user
    // (so the cookie rail's data client is the same identity, not god-mode).
    const asUser = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${cookieJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: probeError } = await asUser.from('workspaces').select('id').limit(1);
    expect(probeError).toBeNull();
  });

  it('using/revoking/expiring one credential does not affect the other', async () => {
    const uid = await ensureUser();
    const admin = service();

    // Two independent PATs for the same user model "two coexisting credentials".
    const tokenA = await mintPat({
      admin,
      userId: uid,
      name: 'coexistence-A',
      scopes: ['atc:read'],
      expiresInDays: null,
    });
    const tokenB = await mintPat({
      admin,
      userId: uid,
      name: 'coexistence-B',
      scopes: ['atc:read'],
      expiresInDays: null,
    });
    createdTokenIds.push(tokenA.id, tokenB.id);

    // Both resolve independently.
    expect((await resolveIdentity(bearerRequest(tokenA.token))).userId).toBe(uid);
    expect((await resolveIdentity(bearerRequest(tokenB.token))).userId).toBe(uid);

    // Revoke A. B must stay valid (independence).
    const { error: revokeError } = await admin
      .from('access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenA.id);
    expect(revokeError).toBeNull();

    await expectRejects(resolveIdentity(bearerRequest(tokenA.token)));
    expect((await resolveIdentity(bearerRequest(tokenB.token))).userId).toBe(uid);

    // Expire B in the past. A is already revoked; expiring B must not resurrect
    // A nor leak — each credential's lifecycle is isolated.
    const { error: expireError } = await admin
      .from('access_tokens')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', tokenB.id);
    expect(expireError).toBeNull();

    await expectRejects(resolveIdentity(bearerRequest(tokenB.token)));
    await expectRejects(resolveIdentity(bearerRequest(tokenA.token)));
  });
});
