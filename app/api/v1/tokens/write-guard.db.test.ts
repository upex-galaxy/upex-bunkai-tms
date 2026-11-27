import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Throwaway users and workspaces only: never the shared QA identity or its tokens.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

type Jar = Map<string, string>;
type Db = SupabaseClient<Database>;
let boundJar: Jar = new Map();

function ssrClientFor(jar: Jar) {
  return createServerClient<Database>(url!, anonKey!, {
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

const { GET: listTokens, POST: issueToken } = await import('./route');
const { DELETE: revokeToken } = await import('./[id]/route');
const { POST: signOut } = await import('../auth/sign-out/route');
const { mintPat } = await import('@lib/api/pat');
const { requireBearerToken } = await import('@lib/api/middleware/bearer');

const PREFIX = `bk2588-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Bk2588-${crypto.randomUUID()}`;
const TOKEN_COLUMNS = 'id, user_id, workspace_id, name, token_prefix, scopes, expires_at, revoked_at, last_used_at, created_at';
const userIds: string[] = [];
const workspaceIds: string[] = [];

interface Actor { id: string, jar: Jar, db: Db }

function service(): Db {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function anon(): Db {
  return createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function newActor(label: string): Promise<Actor> {
  const email = `${PREFIX}-${label}@bunkai.test`;
  const { data, error } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw error ?? new Error(`Failed to create the ${label} test user.`);
  }
  userIds.push(data.user.id);
  const jar: Jar = new Map();
  const signIn = await ssrClientFor(jar).auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error || !signIn.data.session) {
    throw signIn.error ?? new Error(`Failed to sign in the ${label} test user.`);
  }
  const db = createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signIn.data.session.access_token}` } },
  });
  return { id: data.user.id, jar, db };
}

async function newWorkspace(label: string, members: Array<{ userId: string, role: 'owner' | 'admin' | 'member' }>): Promise<string> {
  const owner = members.find(m => m.role === 'owner')!;
  const { data, error } = await service().from('workspaces').insert({ slug: `${PREFIX}-${label}`, name: `${PREFIX} ${label}`, owner_user_id: owner.userId }).select('id').single();
  if (error || !data) {
    throw error ?? new Error(`Failed to create the ${label} workspace.`);
  }
  workspaceIds.push(data.id);
  const { error: memberError } = await service().from('workspace_members').insert(members.map(m => ({ workspace_id: data.id, user_id: m.userId, role: m.role, status: 'active' })));
  if (memberError) {
    throw memberError;
  }
  return data.id;
}

async function mint(userId: string, name: string, workspaceId: string | null = null, expiresInDays: number | null = null) {
  return mintPat({ admin: service(), userId, name: `${PREFIX}-${name}`, scopes: ['atc:read'], workspaceId, expiresInDays });
}

async function readToken(id: string) {
  const { data, error } = await service().from('access_tokens').select(TOKEN_COLUMNS).eq('id', id).single();
  if (error || !data) {
    throw error ?? new Error('Token row not found.');
  }
  return data;
}

async function authenticates(token: string): Promise<boolean> {
  try {
    await requireBearerToken(new Request('http://localhost/api/v1/ping', { headers: { authorization: `Bearer ${token}` } }));
    return true;
  }
  catch {
    return false;
  }
}

function routeRequest(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function asActor(actor: Actor, request: NextRequest, handler: (request: NextRequest) => Promise<Response>): Promise<Response> {
  boundJar = actor.jar;
  return handler(request);
}

describeOrSkip('BK-2588 access_tokens writes from the data API (database)', () => {
  let owner: Actor;
  let stranger: Actor;
  let workspaceId: string;
  let tokenId: string;

  beforeAll(async () => {
    owner = await newActor('owner');
    stranger = await newActor('stranger');
    workspaceId = await newWorkspace('guard', [{ userId: owner.id, role: 'owner' }]);
    tokenId = (await mint(owner.id, 'guarded', workspaceId, 30)).id;
  }, 30_000);

  afterAll(async () => {
    if (!hasEnv) {
      return;
    }
    const db = service();
    const failures: string[] = [];
    if (workspaceIds.length > 0) {
      await db.from('workspace_deletions').delete().in('workspace_id', workspaceIds);
      const { error } = await db.from('workspaces').delete().in('id', workspaceIds);
      if (error) {
        failures.push(`workspaces: ${error.message}`);
      }
    }
    if (userIds.length > 0) {
      await db.from('access_tokens').delete().in('user_id', userIds);
    }
    for (const id of userIds) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) {
        failures.push(`user ${id}: ${error.message}`);
      }
    }
    const { count: tokensLeft } = await db.from('access_tokens').select('id', { count: 'exact', head: true }).in('user_id', userIds);
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    const { count: tombstonesLeft } = await db.from('workspace_deletions').select('id', { count: 'exact', head: true }).like('workspace_slug', `${PREFIX}%`);
    let usersLeft = 0;
    for (const id of userIds) {
      const { data } = await db.auth.admin.getUserById(id);
      if (data?.user) {
        usersLeft += 1;
      }
    }
    console.log(`[bk2588] cleanup: ${userIds.length - usersLeft}/${userIds.length} users deleted, ${tokensLeft ?? 'unknown'} tokens, ${workspacesLeft ?? 'unknown'} workspaces and ${tombstonesLeft ?? 'unknown'} tombstones left`);
    if (failures.length > 0 || usersLeft !== 0 || tokensLeft !== 0 || workspacesLeft !== 0 || tombstonesLeft !== 0) {
      throw new Error(`BK-2588 cleanup left fixtures behind: ${failures.join('; ') || 'see the counts above'}`);
    }
  }, 60_000);

  const forbiddenChanges: Array<[string, () => Database['public']['Tables']['access_tokens']['Update']]> = [
    ['scopes', () => ({ scopes: ['atc:read', 'atc:write', 'run:execute', 'workspace:admin'] })],
    ['workspace_id', () => ({ workspace_id: null })],
    ['expires_at', () => ({ expires_at: null })],
    ['token_prefix', () => ({ token_prefix: 'bk2588prefix' })],
    ['user_id', () => ({ user_id: stranger.id })],
    ['name', () => ({ name: `${PREFIX}-renamed` })],
    ['last_used_at', () => ({ last_used_at: new Date().toISOString() })],
    ['created_at', () => ({ created_at: new Date(0).toISOString() })],
    ['revoked_at together with scopes', () => ({ revoked_at: new Date().toISOString(), scopes: ['workspace:admin'] })],
  ];

  for (const [column, change] of forbiddenChanges) {
    it(`the owner cannot change ${column} of their own token`, async () => {
      const before = await readToken(tokenId);
      const { error } = await owner.db.from('access_tokens').update(change()).eq('id', tokenId).select('id');
      expect(error?.code).toBe('42501');
      expect(await readToken(tokenId)).toEqual(before);
    }, 20_000);
  }

  it('the owner cannot insert a token row', async () => {
    const { error } = await owner.db.from('access_tokens').insert({
      user_id: owner.id,
      name: `${PREFIX}-inserted`,
      token_prefix: 'bk2588insert',
      scopes: ['workspace:admin'],
    }).select('id');
    expect(error?.code).toBe('42501');
    const { count } = await service().from('access_tokens').select('id', { count: 'exact', head: true }).eq('name', `${PREFIX}-inserted`);
    expect(count).toBe(0);
  }, 20_000);

  it('the owner cannot delete their own token row', async () => {
    const { error } = await owner.db.from('access_tokens').delete().eq('id', tokenId).select('id');
    expect(error?.code).toBe('42501');
    expect((await readToken(tokenId)).id).toBe(tokenId);
  }, 20_000);

  it('an anonymous caller cannot update a token row', async () => {
    const before = await readToken(tokenId);
    const { error } = await anon().from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', tokenId).select('id');
    expect(error?.code).toBe('42501');
    expect(await readToken(tokenId)).toEqual(before);
  }, 20_000);

  it('another user cannot revoke my token', async () => {
    const pat = await mint(owner.id, 'not-yours');
    const { data, error } = await stranger.db.from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', pat.id).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await readToken(pat.id)).revoked_at).toBeNull();
    expect(await authenticates(pat.token)).toBe(true);
  }, 20_000);

  it('the owner revokes their own token, and the revocation is final for the owner', async () => {
    const pat = await mint(owner.id, 'final');
    const { data, error } = await owner.db.from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', pat.id).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: pat.id }]);
    const revoked = await readToken(pat.id);
    expect(revoked.revoked_at).not.toBeNull();
    expect(await authenticates(pat.token)).toBe(false);

    const undo = await owner.db.from('access_tokens').update({ revoked_at: null }).eq('id', pat.id).select('id');
    expect(undo.data ?? []).toEqual([]);
    const redate = await owner.db.from('access_tokens').update({ revoked_at: new Date(Date.now() + 86_400_000).toISOString() }).eq('id', pat.id).select('id');
    expect(redate.data ?? []).toEqual([]);
    expect(await readToken(pat.id)).toEqual(revoked);
    expect(await authenticates(pat.token)).toBe(false);
  }, 20_000);

  it('a revoked token stays revoked for the service role too', async () => {
    const pat = await mint(owner.id, 'final-service');
    const admin = service();
    expect((await admin.from('access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', pat.id)).error).toBeNull();
    const revoked = await readToken(pat.id);

    const undo = await admin.from('access_tokens').update({ revoked_at: null }).eq('id', pat.id);
    expect(undo.error?.message).toBe('token_revocation_final');
    const redate = await admin.from('access_tokens').update({ revoked_at: new Date(0).toISOString() }).eq('id', pat.id);
    expect(redate.error?.message).toBe('token_revocation_final');
    expect(await readToken(pat.id)).toEqual(revoked);
    expect(await authenticates(pat.token)).toBe(false);
  }, 20_000);

  it('mint, list and revoke through the token routes still work for a browser session', async () => {
    const issued = await asActor(owner, routeRequest('/api/v1/tokens', 'POST', { name: `${PREFIX}-route`, scopes: ['atc:read'], workspace_id: workspaceId, expires_in_days: 7 }), issueToken);
    expect(issued.status).toBe(201);
    const minted = await issued.json() as { id: string, token: string };
    expect(await authenticates(minted.token)).toBe(true);

    const listed = await asActor(owner, routeRequest('/api/v1/tokens', 'GET'), listTokens);
    expect(listed.status).toBe(200);
    const { tokens } = await listed.json() as { tokens: Array<{ id: string, revoked_at: string | null }> };
    expect(tokens.find(t => t.id === minted.id)?.revoked_at).toBeNull();
    expect(tokens.every(t => t.id !== undefined)).toBe(true);

    const revoked = await asActor(owner, routeRequest(`/api/v1/tokens/${minted.id}`, 'DELETE'), revokeToken);
    expect(revoked.status).toBe(204);
    expect((await readToken(minted.id)).revoked_at).not.toBeNull();
    expect(await authenticates(minted.token)).toBe(false);

    const again = await asActor(owner, routeRequest(`/api/v1/tokens/${minted.id}`, 'DELETE'), revokeToken);
    expect(again.status).toBe(404);
  }, 20_000);

  it('a bearer call still records last_used_at', async () => {
    const pat = await mint(owner.id, 'touch');
    expect((await readToken(pat.id)).last_used_at).toBeNull();
    expect(await authenticates(pat.token)).toBe(true);
    let lastUsed: string | null = null;
    for (let attempt = 0; attempt < 50 && lastUsed === null; attempt += 1) {
      await Bun.sleep(100);
      lastUsed = (await readToken(pat.id)).last_used_at;
    }
    expect(lastUsed).not.toBeNull();
  }, 20_000);

  it('sign-out without revoke_pats keeps my tokens', async () => {
    const actor = await newActor('signout-keep');
    const pat = await mint(actor.id, 'signout-keep');
    const response = await asActor(actor, routeRequest('/api/v1/auth/sign-out', 'POST'), signOut);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked_pats: 0 });
    expect((await readToken(pat.id)).revoked_at).toBeNull();
    expect(await authenticates(pat.token)).toBe(true);
  }, 20_000);

  it('sign-out with revoke_pats revokes my active tokens', async () => {
    const actor = await newActor('signout-revoke');
    const pats = [await mint(actor.id, 'signout-revoke-1'), await mint(actor.id, 'signout-revoke-2')];
    const response = await asActor(actor, routeRequest('/api/v1/auth/sign-out', 'POST', { revoke_pats: true }), signOut);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked_pats: 2 });
    for (const pat of pats) {
      expect((await readToken(pat.id)).revoked_at).not.toBeNull();
      expect(await authenticates(pat.token)).toBe(false);
    }
  }, 20_000);

  it('leaving a workspace still revokes my tokens scoped to it', async () => {
    const actor = await newActor('leaver');
    await newWorkspace('leaver-home', [{ userId: actor.id, role: 'owner' }]);
    const leftId = await newWorkspace('left', [{ userId: owner.id, role: 'owner' }, { userId: actor.id, role: 'member' }]);
    const scoped = await mint(actor.id, 'leaver-scoped', leftId);
    const global = await mint(actor.id, 'leaver-global');

    const { error } = await actor.db.rpc('bunkai_leave_workspace', { p_workspace_id: leftId });
    expect(error).toBeNull();
    expect((await readToken(scoped.id)).revoked_at).not.toBeNull();
    expect((await readToken(global.id)).revoked_at).toBeNull();
  }, 20_000);

  it('requesting a workspace deletion still revokes the tokens scoped to it', async () => {
    const actor = await newActor('deleter');
    const doomedId = await newWorkspace('doomed', [{ userId: actor.id, role: 'owner' }]);
    const scoped = await mint(actor.id, 'deleter-scoped', doomedId);
    const global = await mint(actor.id, 'deleter-global');

    const { error } = await actor.db.rpc('bunkai_request_workspace_deletion', { p_workspace_id: doomedId });
    expect(error).toBeNull();
    expect((await readToken(scoped.id)).revoked_at).not.toBeNull();
    expect((await readToken(global.id)).revoked_at).toBeNull();
  }, 20_000);
});
