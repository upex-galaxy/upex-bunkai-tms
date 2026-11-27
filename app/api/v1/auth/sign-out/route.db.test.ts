import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Throwaway users only: a global sign-out here must never reach the shared QA identity.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

type Jar = Map<string, string>;
let boundJar: Jar = new Map();

function ssrClientFor(jar: Jar) {
  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value === '') { jar.delete(name); }
          else { jar.set(name, value); }
        }
      },
    },
  });
}

void mock.module('server-only', () => ({}));
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => ssrClientFor(boundJar),
}));

const { POST } = await import('./route');
const { POST: headlessSignin } = await import('../signin/route');
const { mintPat } = await import('@lib/api/pat');
const { resolveIdentity } = await import('@lib/api/principal');
const { requireBearerToken } = await import('@lib/api/middleware/bearer');

const ROUTE = 'http://localhost/api/v1/auth/sign-out';
const PASSWORD = `Bk2447-SignOut-${crypto.randomUUID()}`;
const createdUserIds: string[] = [];

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface Session { jar: Jar, accessToken: string, refreshToken: string }

async function newUser(label: string): Promise<{ id: string, email: string }> {
  const email = `bk2447-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@bunkai.test`;
  const { data, error } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw error ?? new Error('Failed to create a BK-2447 test user.');
  }
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function signIn(email: string): Promise<Session> {
  const jar: Jar = new Map();
  const { data, error } = await ssrClientFor(jar).auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) {
    throw error ?? new Error('Failed to sign in a BK-2447 test user.');
  }
  return { jar, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

async function signInHeadless(email: string): Promise<Jar> {
  const jar: Jar = new Map();
  boundJar = jar;
  const response = await headlessSignin(new NextRequest('http://localhost/api/v1/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250) + 1}` },
    body: JSON.stringify({ email, password: PASSWORD, pat_name: 'bk2447-headless' }),
  }));
  if (response.status !== 200) {
    throw new Error(`Headless sign-in answered ${response.status}.`);
  }
  return jar;
}

function hasAuthCookie(jar: Jar): boolean {
  return [...jar.keys()].some(name => name.startsWith('sb-'));
}

async function send(jar: Jar, opts: { body?: string, bearer?: string } = {}): Promise<Response> {
  boundJar = jar;
  return POST(new NextRequest(ROUTE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    },
    ...(opts.body === undefined ? {} : { body: opts.body }),
  }));
}

async function sessionAlive(jar: Jar): Promise<boolean> {
  boundJar = new Map(jar);
  try {
    await resolveIdentity(new NextRequest('http://localhost/api/v1/ping'));
    return true;
  }
  catch {
    return false;
  }
}

async function patAuthenticates(token: string): Promise<boolean> {
  try {
    await requireBearerToken(new Request('http://localhost/api/v1/ping', { headers: { authorization: `Bearer ${token}` } }));
    return true;
  }
  catch {
    return false;
  }
}

async function mint(userId: string, name: string) {
  return mintPat({ admin: service(), userId, name, scopes: ['atc:read'], workspaceId: null, expiresInDays: null });
}

async function revokedAt(tokenId: string): Promise<string | null> {
  const { data, error } = await service().from('access_tokens').select('revoked_at').eq('id', tokenId).single();
  if (error || !data) {
    throw error ?? new Error('Token row not found.');
  }
  return data.revoked_at;
}

async function json(response: Response): Promise<{ revoked_pats?: number, error?: { code?: string } }> {
  return response.json() as Promise<{ revoked_pats?: number, error?: { code?: string } }>;
}

describeOrSkip('BK-2447 POST /api/v1/auth/sign-out (database)', () => {
  afterAll(async () => {
    if (!hasEnv) { return; }
    const admin = service();
    const { data: tokens } = await admin.from('access_tokens').select('id').in('user_id', createdUserIds);
    const ids = (tokens ?? []).map(row => row.id as string);
    if (ids.length > 0) {
      await admin.from('access_token_secrets').delete().in('token_id', ids);
      await admin.from('access_tokens').delete().in('id', ids);
    }
    const failedDeletes: string[] = [];
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) { failedDeletes.push(id); }
    }
    const { count } = await admin.from('access_tokens').select('id', { count: 'exact', head: true }).in('user_id', createdUserIds);
    console.log(`[bk2447] cleanup: ${createdUserIds.length - failedDeletes.length}/${createdUserIds.length} users deleted, ${count ?? 'unknown'} tokens left`);
    if (failedDeletes.length > 0 || count !== 0) {
      throw new Error(`BK-2447 cleanup left ${failedDeletes.length} users and ${count ?? 'unknown'} tokens behind.`);
    }
  });

  it('default sign-out ends only this session, keeps every token, and the same cookie then answers 401', async () => {
    const u1 = await newUser('default');
    const pats = [await mint(u1.id, 'pat-1'), await mint(u1.id, 'pat-2'), await mint(u1.id, 'pat-3')];
    const s1 = await signIn(u1.email);
    const s1b = await signIn(u1.email);
    const s1Copy = new Map(s1.jar);

    const response = await send(s1.jar);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ revoked_pats: 0 });
    expect(hasAuthCookie(s1Copy)).toBe(true);
    expect(hasAuthCookie(s1.jar)).toBe(false);

    expect(await sessionAlive(s1Copy)).toBe(false);
    expect(await sessionAlive(s1b.jar)).toBe(true);
    for (const pat of pats) {
      expect(await revokedAt(pat.id)).toBeNull();
      expect(await patAuthenticates(pat.token)).toBe(true);
    }

    const replay = await send(s1Copy, { body: '{"revoke_pats": true}' });
    expect(replay.status).toBe(401);
    for (const pat of pats) {
      expect(await revokedAt(pat.id)).toBeNull();
    }
  }, 20_000);

  it('revoke_pats true revokes only my active tokens, ends every session, and a fresh session reports 0', async () => {
    const u1 = await newUser('revoke');
    const u2 = await newUser('bystander');
    const active = [await mint(u1.id, 'pat-1'), await mint(u1.id, 'pat-2'), await mint(u1.id, 'pat-3')];
    const expired = await mint(u1.id, 'pat-expired');
    const revoked = await mint(u1.id, 'pat-revoked');
    const admin = service();
    await admin.from('access_tokens').update({ expires_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('id', expired.id);
    const originalRevokedAt = new Date(Date.now() - 86_400_000).toISOString();
    await admin.from('access_tokens').update({ revoked_at: originalRevokedAt }).eq('id', revoked.id);
    const others = [await mint(u2.id, 'u2-pat-1'), await mint(u2.id, 'u2-pat-2')];
    const s1 = await signIn(u1.email);
    const s1b = await signIn(u1.email);
    const s1Copy = new Map(s1.jar);

    const response = await send(s1.jar, { body: '{"revoke_pats": true}' });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ revoked_pats: 3 });
    expect(hasAuthCookie(s1.jar)).toBe(false);

    for (const pat of active) {
      expect(await revokedAt(pat.id)).not.toBeNull();
      expect(await patAuthenticates(pat.token)).toBe(false);
    }
    expect(await revokedAt(expired.id)).toBeNull();
    expect(Date.parse((await revokedAt(revoked.id))!)).toBe(Date.parse(originalRevokedAt));
    for (const pat of others) {
      expect(await revokedAt(pat.id)).toBeNull();
      expect(await patAuthenticates(pat.token)).toBe(true);
    }
    expect(await sessionAlive(s1Copy)).toBe(false);
    expect(await sessionAlive(s1b.jar)).toBe(false);
    const refresh = await createClient(url!, anonKey!, { auth: { persistSession: false } }).auth.refreshSession({ refresh_token: s1b.refreshToken });
    expect(refresh.error).not.toBeNull();

    const replay = await send(s1Copy, { body: '{"revoke_pats": true}' });
    expect(replay.status).toBe(401);

    const s2 = await signIn(u1.email);
    const repeat = await send(s2.jar, { body: '{"revoke_pats": true}' });
    expect(repeat.status).toBe(200);
    expect(await json(repeat)).toEqual({ revoked_pats: 0 });

    const headless = await signInHeadless(u1.email);
    const headlessRepeat = await send(headless, { body: '{"revoke_pats": true}' });
    expect(headlessRepeat.status).toBe(200);
    expect(await json(headlessRepeat)).toEqual({ revoked_pats: 1 });
  }, 20_000);

  it('a Bearer PAT is 403 with or without a cookie, a bad Bearer next to a cookie is 401, and nothing changes', async () => {
    const u1 = await newUser('bearer');
    const pat = await mint(u1.id, 'pat-bearer');
    const dead = await mint(u1.id, 'pat-dead');
    await service().from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', dead.id);
    const s1 = await signIn(u1.email);

    const bearerOnly = await send(new Map(), { body: '{"revoke_pats": true}', bearer: pat.token });
    expect(bearerOnly.status).toBe(403);

    const both = await send(new Map(s1.jar), { body: '{"revoke_pats": true}', bearer: pat.token });
    expect(both.status).toBe(403);

    const badBearer = await send(new Map(s1.jar), { body: '{"revoke_pats": true}', bearer: dead.token });
    expect(badBearer.status).toBe(401);

    const garbage = await send(new Map(s1.jar), { body: '{"revoke_pats": true}', bearer: 'bk_pat_garbage' });
    expect(garbage.status).toBe(401);

    expect(await revokedAt(pat.id)).toBeNull();
    expect(await patAuthenticates(pat.token)).toBe(true);
    expect(await sessionAlive(s1.jar)).toBe(true);
  }, 20_000);

  it('no credentials is 401', async () => {
    const response = await send(new Map());
    expect(response.status).toBe(401);
    expect((await json(response)).error?.code).toBe('unauthorized');
  }, 20_000);

  it('a session that is no longer valid is 401 and revokes nothing', async () => {
    const u1 = await newUser('invalid');
    const pat = await mint(u1.id, 'pat-kept');
    const s1 = await signIn(u1.email);
    const { error } = await service().auth.admin.signOut(s1.accessToken, 'local');
    expect(error).toBeNull();

    const response = await send(s1.jar, { body: '{"revoke_pats": true}' });
    expect(response.status).toBe(401);
    expect(await revokedAt(pat.id)).toBeNull();
  }, 20_000);

  it('two simultaneous revoke calls revoke every token and never count one twice', async () => {
    const u1 = await newUser('race');
    const pats = await Promise.all(Array.from({ length: 10 }, async (_, i) => mint(u1.id, `pat-race-${i}`)));
    const s1 = await signIn(u1.email);
    const s1b = await signIn(u1.email);

    const responses = await Promise.all([
      send(s1.jar, { body: '{"revoke_pats": true}' }),
      send(s1b.jar, { body: '{"revoke_pats": true}' }),
    ]);
    let total = 0;
    for (const response of responses) {
      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        total += (await json(response)).revoked_pats ?? 0;
      }
    }
    expect(responses.some(response => response.status === 200)).toBe(true);
    expect(total).toBeLessThanOrEqual(10);
    for (const pat of pats) {
      expect(await revokedAt(pat.id)).not.toBeNull();
    }
    expect(await sessionAlive(s1.jar)).toBe(false);
    expect(await sessionAlive(s1b.jar)).toBe(false);
  }, 20_000);
});
