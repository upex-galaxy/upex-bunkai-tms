import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The routes import `@lib/supabase/admin` (server-only) and `lib/api/pat` pulls
// the same sentinel transitively; shim it so the module graph loads under Bun,
// then import the REAL exported handlers. Same convention as
// `lib/api/auth-coexistence.test.ts` and `atcs/[id]/duplicate/route.test.ts`.
void mock.module('server-only', () => ({}));
const { POST: issueToken, GET: listTokens } = await import('./route');
const { DELETE: revokeToken } = await import('./[id]/route');
const { mintPat } = await import('@lib/api/pat');

// BK-497 — the `cookie-only` posture, exercised through the REAL production
// path rather than asserted from the type.
//
// This is the one behavioural change in an otherwise behaviour-neutral Story.
// The `principal.via === 'bearer'` rejections used to live inside the two token
// handler bodies; they now live in the gateway (`lib/api/handler.ts`) as
// `auth: 'cookie-only'`. A green `types:check` proves the posture is DECLARED —
// it proves nothing about whether the gateway still rejects, so this drives the
// real exported handlers with a real minted PAT and observes the database.
//
// Three assertions, and the third is the one that gives the other two meaning:
//   1. POST /tokens with a Bearer → 403, AND no token row is created. A 403
//      alone also passes when the route is simply broken; the row count is what
//      survives refactoring.
//   2. DELETE /tokens/{id} with a Bearer → 403, AND the target token is still
//      unrevoked.
//   3. GET /tokens with the SAME Bearer → 200. Without this, 1 and 2 are
//      satisfied by any failure whatsoever and prove nothing about the posture
//      specifically. It also locks the Story's explicit requirement that GET
//      keeps a declared no-capability posture rather than the cookie-only lift.
//
// DB-dependent + env-gated, same style as the sibling auth suites: skips when
// the Supabase env is absent (CI without DB creds).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

const TEST_EMAIL = `bk497-cookie-only-${Date.now()}@bunkai.test`;
const TEST_PASSWORD = 'Bk497-CookieOnly-Test!';

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function bearerRequest(token: string, target: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(target, {
    method,
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describeOrSkip('BK-497 — cookie-only posture rejects a Bearer PAT at the gateway', () => {
  let userId: string | undefined;
  const createdTokenIds: string[] = [];

  async function ensureUser(): Promise<string> {
    if (userId) { return userId; }
    const { data, error } = await service().auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error('Failed to seed BK-497 cookie-only test user.');
    }
    userId = data.user.id;
    return userId;
  }

  async function mintFor(uid: string, name: string) {
    const pat = await mintPat({
      admin: service(),
      userId: uid,
      name,
      scopes: ['atc:read', 'atc:write', 'run:execute'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);
    return pat;
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

  it('POST /api/v1/tokens — 403 and no token is minted', async () => {
    const uid = await ensureUser();
    const pat = await mintFor(uid, 'bk497-issue-attempt');

    const before = await service()
      .from('access_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);

    const response = await issueToken(bearerRequest(
      pat.token,
      'http://localhost/api/v1/tokens',
      'POST',
      { name: 'escalation-attempt', scopes: ['atc:read'] },
    ));

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    // The message is preserved verbatim from the pre-lift handler body — the
    // gateway now supplies it via the posture's `why`.
    expect(body.error?.message).toBe(
      'Personal access tokens cannot issue tokens. Use a browser session.',
    );

    // Side-effect proof: the gate ran BEFORE any state change.
    const after = await service()
      .from('access_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);
    expect(after.count).toBe(before.count);
  });

  it('DELETE /api/v1/tokens/{id} — 403 and the token stays unrevoked', async () => {
    const uid = await ensureUser();
    const attacker = await mintFor(uid, 'bk497-revoke-attempt');
    const victim = await mintFor(uid, 'bk497-revoke-target');

    const response = await revokeToken(bearerRequest(
      attacker.token,
      `http://localhost/api/v1/tokens/${victim.id}`,
      'DELETE',
    ));

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toBe(
      'Personal access tokens cannot revoke tokens. Use a browser session.',
    );

    const { data: row } = await service()
      .from('access_tokens')
      .select('revoked_at')
      .eq('id', victim.id)
      .single();
    expect(row?.revoked_at).toBeNull();
  });

  it('GET /api/v1/tokens — the same PAT still succeeds (positive control)', async () => {
    const uid = await ensureUser();
    const pat = await mintFor(uid, 'bk497-list-control');

    const response = await listTokens(bearerRequest(
      pat.token,
      'http://localhost/api/v1/tokens',
      'GET',
    ));

    // Listing keeps a declared no-capability posture, NOT the cookie-only lift:
    // it is read-only and RLS-scoped to the caller's own tokens. This is what
    // proves the two postures are actually distinct at runtime.
    expect(response.status).toBe(200);
  });
});
