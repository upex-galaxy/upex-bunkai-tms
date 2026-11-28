import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { assertRoleChangeAllowed } from '@/app/api/v1/workspaces/[id]/members/[userId]/response';

// BK-2542 — DB-integration proof for bunkai_change_workspace_member_role
// (migration 0144, ADR-0022) against the REAL database: the ladder, every
// refusal and its code, the same-role no-op, the one-transaction writes (role,
// Bugs unassigned through bunkai_assign_bug on a lowering to viewer, one
// member.role_changed), the rollback under the failpoint, the Admin-versus-Admin
// race, the feed projection and resolver, and the grants. Throwaway users and
// workspaces carry PREFIX; afterAll asserts none remain. Skipped, with a loud
// warning, only with no database environment or the function not deployed.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDbEnv = Boolean(url && anonKey && serviceKey);
const RPC = 'bunkai_change_workspace_member_role';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

if (!hasDbEnv) {
  console.warn('[member-role-change-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the function.');
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// A service-role call carries no auth.uid(): a deployed function answers 42501.
let deployed = false;
if (hasDbEnv) {
  const probe = await service().rpc(RPC, { p_workspace_id: ZERO_UUID, p_user_id: ZERO_UUID, p_role: 'member' });
  const code = probe.error?.code ?? 'no error';
  if (code === '42501') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[member-role-change-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}). Apply migration 0144_workspace_member_role_change.sql.`);
  }
  else {
    throw new Error(`[member-role-change-isolation] unexpected probe answer (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk2542-role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Persona = 'owner' | 'owner2' | 'admin' | 'admin2' | 'member' | 'viewer' | 'outsider';
const PERSONAS: Persona[] = ['owner', 'owner2', 'admin', 'admin2', 'member', 'viewer', 'outsider'];

const users = Object.fromEntries(PERSONAS.map(p => [p, { id: '', email: `${PREFIX}-${p}@example.test` }])) as Record<Persona, { id: string, email: string }>;
type Client = ReturnType<typeof service>;
const clients = {} as Record<Persona, Client>;
const workspaceIds: string[] = [];

async function signedIn(email: string): Promise<Client> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    throw new Error(`[member-role-change-isolation] sign-in failed for a fixture user: ${error.message}`);
  }
  return client;
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[member-role-change-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seeded {
  workspaceId: string
  projectId: string
  moduleId: string
}

// A fresh workspace per scenario: removals mutate, so no test leans on another.
async function seedWorkspace(tag: string, members: Partial<Record<Persona, Role>>): Promise<Seeded> {
  const db = service();
  const ws = must(await db.from('workspaces')
    .insert({ slug: `${PREFIX}-${tag}`, name: `${PREFIX} ${tag}`, owner_user_id: users.owner.id })
    .select('id')
    .single(), `workspace ${tag}`);
  workspaceIds.push(ws.id);
  const rows = Object.entries(members).map(([persona, role]) => ({
    workspace_id: ws.id,
    user_id: users[persona as Persona].id,
    role,
    status: 'active',
  }));
  const { error: memberError } = await db.from('workspace_members').insert(rows);
  if (memberError) {
    throw new Error(`[member-role-change-isolation] members ${tag}: ${memberError.message}`);
  }
  const project = must(await db.from('projects')
    .insert({ workspace_id: ws.id, slug: `${PREFIX}-${tag}-p`, name: `${PREFIX} ${tag} project` })
    .select('id')
    .single(), `project ${tag}`);
  const mod = must(await db.from('modules')
    .insert({ project_id: project.id, path: 'checkout', name: 'Checkout' })
    .select('id')
    .single(), `module ${tag}`);
  return { workspaceId: ws.id, projectId: project.id, moduleId: mod.id };
}

async function seedBug(seed: Seeded, args: { title: string, assignee: Persona, author: Persona, status?: string }): Promise<string> {
  const row = must(await service().from('bugs').insert({
    workspace_id: seed.workspaceId,
    project_id: seed.projectId,
    module_id: seed.moduleId,
    title: `${PREFIX} ${args.title}`,
    severity: 'P2',
    status: args.status ?? 'open',
    assignee_user_id: users[args.assignee].id,
    created_by: users[args.author].id,
  }).select('id').single(), `bug ${args.title}`);
  return row.id;
}

async function seedToken(persona: Persona, workspaceId: string | null, name: string): Promise<string> {
  const row = must(await service().from('access_tokens').insert({
    user_id: users[persona].id,
    workspace_id: workspaceId,
    name: `${PREFIX} ${name}`,
    token_prefix: Math.random().toString(36).slice(2, 10),
    scopes: ['atc:read'],
  }).select('id').single(), `token ${name}`);
  return row.id;
}

async function memberRow(workspaceId: string, persona: Persona) {
  const { data, error } = await service().from('workspace_members').select('role, status, joined_at').eq('workspace_id', workspaceId).eq('user_id', users[persona].id).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function change(caller: Persona, workspaceId: string, target: string, role: unknown) {
  return clients[caller].rpc(RPC, { p_workspace_id: workspaceId, p_user_id: target, p_role: role as string });
}

async function events(workspaceId: string, action: string) {
  const { data, error } = await service().from('activity_log').select('actor_user_id, entity_type, entity_id, payload').eq('workspace_id', workspaceId).eq('action', action);
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function assignees(ids: string[]) {
  const { data } = await service().from('bugs').select('id, assignee_user_id').in('id', ids);
  return Object.fromEntries((data ?? []).map(b => [b.id, b.assignee_user_id]));
}

describeOrSkip('BK-2542 — change a teammate\'s role (RPC, real database)', () => {
  beforeAll(async () => {
    const admin = service();
    for (const persona of PERSONAS) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[persona].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) {
        throw new Error(`[member-role-change-isolation] createUser ${persona}: ${error?.message}`);
      }
      users[persona].id = data.user.id;
    }
    for (const persona of PERSONAS) {
      clients[persona] = await signedIn(users[persona].email);
    }
  }, 120_000);

  afterAll(async () => {
    const db = service();
    const failures: string[] = [];
    for (const id of workspaceIds) {
      const { error } = await db.from('workspaces').delete().eq('id', id);
      if (error) {
        failures.push(`workspace ${id}: ${error.message}`);
      }
    }
    for (const persona of PERSONAS) {
      if (users[persona].id) {
        await db.from('access_tokens').delete().eq('user_id', users[persona].id);
      }
    }
    for (const persona of PERSONAS) {
      if (!users[persona].id) {
        continue;
      }
      const { error } = await db.auth.admin.deleteUser(users[persona].id);
      if (error) {
        failures.push(`user ${persona}: ${error.message}`);
      }
    }
    const { count: wsLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if ((wsLeft ?? 0) !== 0) {
      failures.push(`${wsLeft} ${PREFIX} workspaces remain`);
    }
    for (const persona of PERSONAS) {
      if (!users[persona].id) {
        continue;
      }
      const { data } = await db.auth.admin.getUserById(users[persona].id);
      if (data?.user) {
        failures.push(`user ${persona} remains`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`[member-role-change-isolation] cleanup failed: ${failures.join('; ')}`);
    }
  }, 120_000);

  it('the Owner raises a Member to Admin: one row, one event, Bugs and seats untouched', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('raise', { owner: 'owner', member: 'member', viewer: 'viewer' });
    const bug = await seedBug(seed, { title: 'kept on raise', assignee: 'member', author: 'owner' });
    const token = await seedToken('member', seed.workspaceId, 'raise-scoped');
    const { count: seatsBefore } = await service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('status', 'active');

    const { data, error } = await change('owner', seed.workspaceId, users.member.id, 'admin');
    expect(error).toBeNull();
    expect(data).toEqual({ user_id: users.member.id, previous_role: 'member', role: 'admin', changed: true, unassigned_bug_count: 0 });
    expect((await memberRow(seed.workspaceId, 'member'))?.role).toBe('admin');
    expect(await events(seed.workspaceId, 'member.role_changed')).toEqual([{
      actor_user_id: users.owner.id,
      entity_type: 'workspace_member',
      entity_id: users.member.id,
      payload: { user_id: users.member.id, previous_role: 'member', role: 'admin' },
    }]);
    expect(await assignees([bug])).toEqual({ [bug]: users.member.id });
    const { data: tokenRow } = await service().from('access_tokens').select('revoked_at').eq('id', token).single();
    expect(tokenRow?.revoked_at).toBeNull();
    const { count: seatsAfter } = await service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('status', 'active');
    expect(seatsAfter).toBe(seatsBefore);

    const invited = await clients.member.from('workspace_invites').insert({ workspace_id: seed.workspaceId, email: `${PREFIX}-guest@example.test`, role: 'member', invited_by_user_id: users.member.id }).select('id');
    expect(invited.error).toBeNull();
  }, 60_000);

  it('an Admin lowers a Member to Viewer: every Bug of this workspace is unassigned, other workspaces untouched, no notification', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('lower', { owner: 'owner', admin: 'admin', member: 'member' });
    const other = await seedWorkspace('lower-other', { owner: 'owner', member: 'member' });
    const bugs = [
      await seedBug(seed, { title: 'open', assignee: 'member', author: 'owner' }),
      await seedBug(seed, { title: 'closed', assignee: 'member', author: 'owner', status: 'closed' }),
      await seedBug(seed, { title: 'resolved', assignee: 'member', author: 'member', status: 'resolved' }),
    ];
    const elsewhere = await seedBug(other, { title: 'elsewhere', assignee: 'member', author: 'owner' });
    const { count: notificationsBefore } = await service().from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);

    const { data, error } = await change('admin', seed.workspaceId, users.member.id, 'viewer');
    expect(error).toBeNull();
    expect(data).toEqual({ user_id: users.member.id, previous_role: 'member', role: 'viewer', changed: true, unassigned_bug_count: 3 });
    expect(Object.values(await assignees(bugs))).toEqual([null, null, null]);
    expect(await assignees([elsewhere])).toEqual({ [elsewhere]: users.member.id });
    expect((await events(seed.workspaceId, 'bug.unassigned')).map(e => e.entity_id).sort()).toEqual([...bugs].sort());
    expect((await events(seed.workspaceId, 'member.role_changed')).length).toBe(1);
    const { count: notificationsAfter } = await service().from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
    expect(notificationsAfter).toBe(notificationsBefore);

    const assign = await clients.admin.rpc('bunkai_assign_bug', { p_bug_id: bugs[0], p_assignee_user_id: users.member.id });
    expect(assign.error?.code).toBe('45313');
    const write = await clients.member.rpc('bunkai_assign_bug', { p_bug_id: bugs[0], p_assignee_user_id: null });
    expect(write.error?.code).toBe('42501');
  }, 60_000);

  it('asking for the current role writes nothing and answers changed false', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('same', { owner: 'owner', admin: 'admin', viewer: 'viewer' });
    const { data, error } = await change('admin', seed.workspaceId, users.viewer.id, 'viewer');
    expect(error).toBeNull();
    expect(data).toEqual({ user_id: users.viewer.id, previous_role: 'viewer', role: 'viewer', changed: false, unassigned_bug_count: 0 });
    expect(await events(seed.workspaceId, 'member.role_changed')).toEqual([]);
  }, 60_000);

  it('refusals carry their codes, in order, and change nothing', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('refuse', { owner: 'owner', owner2: 'owner', admin: 'admin', member: 'member', viewer: 'viewer' });
    const deleted = await seedWorkspace('refuse-deleted', { owner: 'owner', member: 'member' });
    await service().from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', deleted.workspaceId);
    await service().from('workspace_members').update({ status: 'suspended' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.viewer.id);
    const before = await service().from('workspace_members').select('user_id, role, status').eq('workspace_id', seed.workspaceId).order('user_id');

    const cases: Array<[Persona, string, string, unknown, string, string]> = [
      ['admin', seed.workspaceId, users.member.id, 'owner', '45227', 'invalid_member_role'],
      ['admin', seed.workspaceId, users.member.id, 'Admin', '45227', 'invalid_member_role'],
      ['admin', seed.workspaceId, users.member.id, '', '45227', 'invalid_member_role'],
      ['admin', seed.workspaceId, users.member.id, null, '45227', 'invalid_member_role'],
      ['outsider', seed.workspaceId, users.member.id, 'viewer', 'P0002', 'not_found'],
      ['owner', crypto.randomUUID(), users.member.id, 'viewer', 'P0002', 'not_found'],
      ['owner', deleted.workspaceId, users.member.id, 'viewer', 'P0002', 'not_found'],
      ['member', seed.workspaceId, users.member.id, 'member', '42501', 'not_an_admin'],
      ['member', seed.workspaceId, users.admin.id, 'viewer', '42501', 'not_an_admin'],
      ['owner', seed.workspaceId, users.owner.id, 'admin', '45225', 'cannot_change_own_role'],
      ['admin', seed.workspaceId, users.admin.id, 'admin', '45225', 'cannot_change_own_role'],
      ['admin', seed.workspaceId, users.outsider.id, 'member', 'P0002', 'not_found'],
      ['admin', seed.workspaceId, users.viewer.id, 'member', 'P0002', 'not_found'],
      ['admin', seed.workspaceId, users.owner.id, 'member', '45226', 'cannot_change_owner_role'],
      ['owner', seed.workspaceId, users.owner2.id, 'admin', '45226', 'cannot_change_owner_role'],
    ];
    for (const [caller, ws, target, role, code, message] of cases) {
      const { data, error } = await change(caller, ws, target, role);
      expect([error?.code, error?.message]).toEqual([code, message]);
      expect(data).toBeNull();
    }
    const after = await service().from('workspace_members').select('user_id, role, status').eq('workspace_id', seed.workspaceId).order('user_id');
    expect(after.data).toEqual(before.data);
    expect(await events(seed.workspaceId, 'member.role_changed')).toEqual([]);
  }, 60_000);

  it('a failure after every write rolls the role and the Bugs back together, and a retry succeeds', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('rollback', { owner: 'owner', member: 'member' });
    const bugs = [
      await seedBug(seed, { title: 'rollback one', assignee: 'member', author: 'owner' }),
      await seedBug(seed, { title: 'rollback two', assignee: 'member', author: 'owner' }),
    ];
    const { error: armError } = await service().from('bunkai_test_failpoints').insert({ name: 'member_role_change.before_event', workspace_id: seed.workspaceId });
    expect(armError).toBeNull();

    const failed = await change('owner', seed.workspaceId, users.member.id, 'viewer');
    expect([failed.error?.code, failed.error?.message]).toEqual(['P0001', 'test_failpoint']);
    expect((await memberRow(seed.workspaceId, 'member'))?.role).toBe('member');
    expect(Object.values(await assignees(bugs))).toEqual([users.member.id, users.member.id]);
    expect(await events(seed.workspaceId, 'bug.unassigned')).toEqual([]);
    expect(await events(seed.workspaceId, 'member.role_changed')).toEqual([]);

    await service().from('bunkai_test_failpoints').delete().eq('workspace_id', seed.workspaceId);
    const retried = await change('owner', seed.workspaceId, users.member.id, 'viewer');
    expect(retried.error).toBeNull();
    expect((retried.data as { unassigned_bug_count: number }).unassigned_bug_count).toBe(2);
  }, 60_000);

  // Two HTTP calls are not guaranteed to overlap inside Postgres. Either way the
  // loser answers 42501: re-checked after the lock when they overlap, or at the
  // first check when the winner already committed.
  it('two Admins lowering each other at once: exactly one wins, the loser gets 42501', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('race', { owner: 'owner', admin: 'admin', admin2: 'admin' });
    const [a, b] = await Promise.all([
      change('admin', seed.workspaceId, users.admin2.id, 'member'),
      change('admin2', seed.workspaceId, users.admin.id, 'member'),
    ]);
    expect([a.error?.code ?? 'ok', b.error?.code ?? 'ok'].sort()).toEqual(['42501', 'ok']);
    const roles = [(await memberRow(seed.workspaceId, 'admin'))?.role, (await memberRow(seed.workspaceId, 'admin2'))?.role].sort();
    expect(roles).toEqual(['admin', 'member']);
    expect((await events(seed.workspaceId, 'member.role_changed')).length).toBe(1);
  }, 60_000);

  it('the route check answers 403 not_an_admin, never 404, to an Admin lowered between its caller and target reads', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('race-route', { owner: 'owner', admin: 'admin', admin2: 'admin' });
    let reads = 0;
    const lowerBeforeSecondRead = (builder: object): object => new Proxy(builder, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== 'function') {
          return value;
        }
        if (prop === 'maybeSingle') {
          return async () => {
            reads += 1;
            if (reads === 2) {
              must(await service().from('workspace_members').update({ role: 'member' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.admin2.id).select('role').single(), 'lower admin2');
            }
            return (value as () => unknown).call(target);
          };
        }
        return (...args: unknown[]) => {
          const next = (value as (...a: unknown[]) => unknown).apply(target, args);
          return next !== null && typeof next === 'object' && 'eq' in next ? lowerBeforeSecondRead(next) : next;
        };
      },
    });
    const db = { from: (table: string) => lowerBeforeSecondRead(clients.admin2.from(table as 'workspace_members')) } as unknown as Parameters<typeof assertRoleChangeAllowed>[0];

    const refusal = await assertRoleChangeAllowed(db, { workspaceId: seed.workspaceId, callerId: users.admin2.id, targetId: users.admin.id }).then(() => null, (err: unknown) => err as { status?: number, details?: unknown });
    expect(reads).toBe(3);
    expect({ status: refusal?.status, details: refusal?.details }).toEqual({ status: 403, details: { reason: 'not_an_admin' } });

    const stillAdmin = await assertRoleChangeAllowed(clients.admin, { workspaceId: seed.workspaceId, callerId: users.admin.id, targetId: users.outsider.id }).then(() => null, (err: unknown) => err as { status?: number });
    expect(stillAdmin?.status).toBe(404);
  }, 60_000);

  it('a lowered Admin is refused administration at once and regains it when raised again', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('dormant', { owner: 'owner', admin: 'admin', member: 'member', viewer: 'viewer' });
    expect((await change('owner', seed.workspaceId, users.admin.id, 'member')).error).toBeNull();
    const refused = await change('admin', seed.workspaceId, users.viewer.id, 'member');
    expect(refused.error?.code).toBe('42501');
    const removal = await clients.admin.rpc('bunkai_remove_workspace_member', { p_workspace_id: seed.workspaceId, p_user_id: users.viewer.id });
    expect(removal.error?.code).toBe('42501');

    expect((await change('owner', seed.workspaceId, users.admin.id, 'admin')).error).toBeNull();
    const allowed = await change('admin', seed.workspaceId, users.viewer.id, 'member');
    expect(allowed.error).toBeNull();
  }, 60_000);

  it('the feed lists member.role_changed with its projection and names a target who never acted', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('feed', { owner: 'owner', viewer: 'viewer' });
    expect((await change('owner', seed.workspaceId, users.viewer.id, 'member')).error).toBeNull();

    const { data: page, error } = await clients.owner.rpc('bunkai_list_activity', { p_workspace_id: seed.workspaceId });
    expect(error).toBeNull();
    const items = (page as { items: Array<{ action: string, entity_id: string, payload: Record<string, unknown> }> }).items;
    const entry = items.find(i => i.action === 'member.role_changed');
    expect(entry?.entity_id).toBe(users.viewer.id);
    expect(entry?.payload).toEqual({ user_id: users.viewer.id, previous_role: 'viewer', role: 'member' });

    const { data: resolved, error: resolveError } = await clients.owner.rpc('bunkai_resolve_activity_actors', {
      p_workspace_id: seed.workspaceId,
      p_user_ids: [users.viewer.id, users.outsider.id],
    });
    expect(resolveError).toBeNull();
    expect(resolved).toEqual([{ user_id: users.viewer.id, email: users.viewer.email }]);
  }, 60_000);

  it('the grants: only authenticated executes the writer, the read-only QA role does not, and no user role writes membership rows', async () => {
    expect.hasAssertions();
    const pgUrl = process.env.POSTGRES_URL_NON_POOLING;
    if (!pgUrl) {
      throw new Error('[member-role-change-isolation] POSTGRES_URL_NON_POOLING is missing, so the catalog cannot be checked; refusing to pass.');
    }
    const sql = new SQL(pgUrl);
    try {
      const fn = 'public.bunkai_change_workspace_member_role(uuid,uuid,text)';
      const [row] = await sql`
        select has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authenticated,
               has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
               has_function_privilege('qa_inspector_ro', ${fn}, 'EXECUTE') as qa_ro,
               has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE') as member_update`;
      expect(row).toEqual({ authenticated: true, anon: false, qa_ro: false, member_update: false });
    }
    finally {
      await sql.close();
    }
  }, 60_000);
});
