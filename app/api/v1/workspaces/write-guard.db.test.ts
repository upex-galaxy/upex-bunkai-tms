import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Throwaway users and workspaces only: never the shared QA identity or its workspaces.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

type Jar = Map<string, string>;
type Db = SupabaseClient<Database>;
type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update'];
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

const { POST: createWorkspace } = await import('./route');
const { PATCH: patchWorkspace } = await import('./[id]/route');

const PREFIX = `bk2590-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Bk2590-${crypto.randomUUID()}`;
const WORKSPACE_COLUMNS = 'id, slug, name, owner_user_id, plan, purchased_seats, created_at, deleted_at, deletion_requested_by';
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

async function readWorkspace(id: string) {
  const { data, error } = await service().from('workspaces').select(WORKSPACE_COLUMNS).eq('id', id).single();
  if (error || !data) {
    throw error ?? new Error('Workspace row not found.');
  }
  return data;
}

function routeRequest(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function asActor(actor: Actor, request: NextRequest, handler: (request: NextRequest) => Promise<Response>): Promise<Response> {
  boundJar = actor.jar;
  return handler(request);
}

describeOrSkip('BK-2590 workspaces writes from the data API (database)', () => {
  let owner: Actor;
  let admin: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    owner = await newActor('owner');
    admin = await newActor('admin');
    workspaceId = await newWorkspace('guard', [{ userId: owner.id, role: 'owner' }, { userId: admin.id, role: 'admin' }]);
  }, 30_000);

  afterAll(async () => {
    if (!hasEnv) {
      return;
    }
    const db = service();
    const failures: string[] = [];
    const { data: extra } = await db.from('workspaces').select('id').like('slug', `${PREFIX}%`);
    const ids = [...new Set([...workspaceIds, ...(extra ?? []).map(w => w.id)])];
    if (ids.length > 0) {
      await db.from('workspace_deletions').delete().in('workspace_id', ids);
      const { error } = await db.from('workspaces').delete().in('id', ids);
      if (error) {
        failures.push(`workspaces: ${error.message}`);
      }
    }
    if (userIds.length > 0) {
      await db.from('idempotency_keys').delete().in('user_id', userIds);
    }
    for (const id of userIds) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) {
        failures.push(`user ${id}: ${error.message}`);
      }
    }
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    const { count: tombstonesLeft } = await db.from('workspace_deletions').select('id', { count: 'exact', head: true }).like('workspace_slug', `${PREFIX}%`);
    const { count: keysLeft } = await db.from('idempotency_keys').select('id', { count: 'exact', head: true }).in('user_id', userIds);
    let usersLeft = 0;
    for (const id of userIds) {
      const { data } = await db.auth.admin.getUserById(id);
      if (data?.user) {
        usersLeft += 1;
      }
    }
    console.log(`[bk2590] cleanup: ${userIds.length - usersLeft}/${userIds.length} users deleted, ${workspacesLeft ?? 'unknown'} workspaces, ${tombstonesLeft ?? 'unknown'} tombstones and ${keysLeft ?? 'unknown'} idempotency keys left`);
    if (failures.length > 0 || usersLeft !== 0 || workspacesLeft !== 0 || tombstonesLeft !== 0 || keysLeft !== 0) {
      throw new Error(`BK-2590 cleanup left fixtures behind: ${failures.join('; ') || 'see the counts above'}`);
    }
  }, 60_000);

  const forbiddenChanges: Array<[string, () => WorkspaceUpdate]> = [
    ['plan', () => ({ plan: 'cloud' })],
    ['purchased_seats', () => ({ purchased_seats: 500 })],
    ['owner_user_id', () => ({ owner_user_id: admin.id })],
    ['deleted_at', () => ({ deleted_at: new Date().toISOString() })],
    ['deletion_requested_by', () => ({ deletion_requested_by: owner.id })],
    ['slug', () => ({ slug: `${PREFIX}-moved` })],
    ['created_at', () => ({ created_at: new Date(0).toISOString() })],
    ['name together with plan', () => ({ name: `${PREFIX} renamed`, plan: 'cloud' })],
  ];

  for (const [column, change] of forbiddenChanges) {
    it(`the owner cannot change ${column} of their own workspace`, async () => {
      const before = await readWorkspace(workspaceId);
      const { error } = await owner.db.from('workspaces').update(change()).eq('id', workspaceId).select('id');
      expect(error?.code).toBe('42501');
      expect(await readWorkspace(workspaceId)).toEqual(before);
    }, 20_000);
  }

  it('the owner cannot insert a workspace row directly, even as its owner', async () => {
    const { error } = await owner.db.from('workspaces').insert({
      slug: `${PREFIX}-inserted`,
      name: `${PREFIX} inserted`,
      owner_user_id: owner.id,
      plan: 'cloud',
      purchased_seats: 500,
    }).select('id');
    expect(error?.code).toBe('42501');
    const { count } = await service().from('workspaces').select('id', { count: 'exact', head: true }).eq('slug', `${PREFIX}-inserted`);
    expect(count).toBe(0);
  }, 20_000);

  it('the owner cannot delete their own workspace row', async () => {
    const { error } = await owner.db.from('workspaces').delete().eq('id', workspaceId).select('id');
    expect(error?.code).toBe('42501');
    expect((await readWorkspace(workspaceId)).id).toBe(workspaceId);
  }, 20_000);

  it('an anonymous caller cannot update a workspace row', async () => {
    const before = await readWorkspace(workspaceId);
    const { error } = await anon().from('workspaces').update({ name: `${PREFIX} anon` }).eq('id', workspaceId).select('id');
    expect(error?.code).toBe('42501');
    expect(await readWorkspace(workspaceId)).toEqual(before);
  }, 20_000);

  it('an admin who is not the owner still cannot rename the workspace', async () => {
    const before = await readWorkspace(workspaceId);
    const { data, error } = await admin.db.from('workspaces').update({ name: `${PREFIX} by admin` }).eq('id', workspaceId).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readWorkspace(workspaceId)).toEqual(before);
  }, 20_000);

  it('the owner renames the workspace through the route, and only the name changes', async () => {
    const before = await readWorkspace(workspaceId);
    const name = `${PREFIX} renamed`;
    const response = await asActor(owner, routeRequest(`/api/v1/workspaces/${workspaceId}`, 'PATCH', { name }), patchWorkspace);
    expect(response.status).toBe(200);
    const { workspace } = await response.json() as { workspace: { id: string, name: string } };
    expect(workspace).toMatchObject({ id: workspaceId, name });
    expect(await readWorkspace(workspaceId)).toEqual({ ...before, name });
  }, 20_000);

  it('the rename route still refuses an admin who is not the owner', async () => {
    const before = await readWorkspace(workspaceId);
    const response = await asActor(admin, routeRequest(`/api/v1/workspaces/${workspaceId}`, 'PATCH', { name: `${PREFIX} admin route` }), patchWorkspace);
    expect(response.status).toBe(403);
    expect(await readWorkspace(workspaceId)).toEqual(before);
  }, 20_000);

  it('creating a workspace through the route still works and starts on the community plan', async () => {
    const creator = await newActor('creator');
    const slug = `${PREFIX}-created`;
    const response = await asActor(creator, routeRequest('/api/v1/workspaces', 'POST', { name: `${PREFIX} created`, slug }, { 'idempotency-key': `${PREFIX}-create` }), createWorkspace);
    expect(response.status).toBe(201);
    const { workspace } = await response.json() as { workspace: { id: string } };
    workspaceIds.push(workspace.id);
    const stored = await readWorkspace(workspace.id);
    expect(stored).toMatchObject({ slug, owner_user_id: creator.id, plan: 'community', purchased_seats: null, deleted_at: null });
  }, 20_000);

  it('requesting a deletion and restoring it still work for the owner', async () => {
    const actor = await newActor('deleter');
    const doomedId = await newWorkspace('doomed', [{ userId: actor.id, role: 'owner' }]);

    const requested = await actor.db.rpc('bunkai_request_workspace_deletion', { p_workspace_id: doomedId });
    expect(requested.error).toBeNull();
    const deleted = await readWorkspace(doomedId);
    expect(deleted.deleted_at).not.toBeNull();
    expect(deleted.deletion_requested_by).toBe(actor.id);

    const restored = await actor.db.rpc('bunkai_restore_workspace_deletion', { p_workspace_id: doomedId });
    expect(restored.error).toBeNull();
    expect(await readWorkspace(doomedId)).toMatchObject({ deleted_at: null, deletion_requested_by: null });
  }, 20_000);

  it('the service role still changes the plan and seats, as the billing flows do', async () => {
    const billedId = await newWorkspace('billed', [{ userId: owner.id, role: 'owner' }]);
    const { error } = await service().from('workspaces').update({ plan: 'cloud', purchased_seats: 5 }).eq('id', billedId);
    expect(error).toBeNull();
    expect(await readWorkspace(billedId)).toMatchObject({ plan: 'cloud', purchased_seats: 5 });
  }, 20_000);
});
