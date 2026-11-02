import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-572 — DB-integration proof for removing a teammate from a workspace
// (migration 0114_workspace_member_removal.sql, ADR-0022).
//
// What it proves against the REAL database (a mocked `db.rpc` proves nothing
// about a SECURITY DEFINER function or an RLS policy, ADR-0012):
//   * bunkai_remove_workspace_member: the ladder, the four refusal paths and
//     their codes, the check order, the one-transaction writes (Bugs
//     unassigned through bunkai_assign_bug, scoped PATs revoked and global
//     PATs untouched, pending invites to the target's email revoked, row
//     deleted, member.removed written), isolation from a second workspace,
//     authorship preserved, the rollback when a failure is forced after
//     every other write (AC-14), and crossing removals (AC-10.1, E2);
//   * the narrowed workspace_members RLS policies, attacked DIRECTLY through
//     PostgREST as an Admin (AC-18, E7): an RLS-filtered DELETE / UPDATE
//     answers success with ZERO rows, so every refusal is asserted on the
//     affected-row count AND re-read with the service role;
//   * the activity feed: member.removed is listed with its projection, and
//     the removed teammate's email resolves even though they never acted.
//
// Actors are throwaway users created here and signed in through the real
// password path, the precedent of `lib/chat/chat-isolation.test.ts`; the
// service role only seeds, arms the failpoint and tears down. Every fixture
// row carries PREFIX and afterAll asserts that zero rows and zero users with
// it remain. Shared-DB test: run it alone when the full suite times out.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no
// database environment or the function is not deployed (42883 / PGRST202).
// Any other probe answer fails the file.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDbEnv = Boolean(url && anonKey && serviceKey);
const RPC = 'bunkai_remove_workspace_member';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

if (!hasDbEnv) {
  console.warn('[member-removal-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the function.');
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// A service-role call carries no auth.uid(): a deployed function answers 42501.
let deployed = false;
if (hasDbEnv) {
  const probe = await service().rpc(RPC, { p_workspace_id: ZERO_UUID, p_user_id: ZERO_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === '42501') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[member-removal-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}). Apply migration 0114_workspace_member_removal.sql.`);
  }
  else {
    throw new Error(`[member-removal-isolation] unexpected probe answer (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk572-remove-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    throw new Error(`[member-removal-isolation] sign-in failed for a fixture user: ${error.message}`);
  }
  return client;
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[member-removal-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
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
    throw new Error(`[member-removal-isolation] members ${tag}: ${memberError.message}`);
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
    hash: `${PREFIX}-${crypto.randomUUID()}`,
    scopes: ['atc:read'],
  }).select('id').single(), `token ${name}`);
  return row.id;
}

async function seedInvite(workspaceId: string, email: string, invitedBy: Persona): Promise<string> {
  const row = must(await service().from('workspace_invites').insert({
    workspace_id: workspaceId,
    email,
    role: 'member',
    token_hash: `${PREFIX}-${crypto.randomUUID()}`,
    invited_by_user_id: users[invitedBy].id,
  }).select('id').single(), `invite ${email}`);
  return row.id;
}

async function memberRow(workspaceId: string, persona: Persona) {
  const { data, error } = await service().from('workspace_members').select('role, status, joined_at').eq('workspace_id', workspaceId).eq('user_id', users[persona].id).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function remove(caller: Persona, workspaceId: string, target: string) {
  return clients[caller].rpc(RPC, { p_workspace_id: workspaceId, p_user_id: target });
}

async function activityActions(workspaceId: string): Promise<string[]> {
  const { data, error } = await service().from('activity_log').select('action').eq('workspace_id', workspaceId);
  if (error) {
    throw error;
  }
  return (data ?? []).map(r => r.action as string);
}

describeOrSkip('BK-572 — remove a teammate (RPC + RLS ladder, real database)', () => {
  beforeAll(async () => {
    const admin = service();
    for (const persona of PERSONAS) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[persona].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) {
        throw new Error(`[member-removal-isolation] createUser ${persona}: ${error?.message}`);
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
    // Global tokens are not under a workspace: delete them by user.
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
    const { count: tokensLeft } = await db.from('access_tokens').select('id', { count: 'exact', head: true }).like('name', `${PREFIX}%`);
    if ((tokensLeft ?? 0) !== 0) {
      failures.push(`${tokensLeft} ${PREFIX} tokens remain`);
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
      throw new Error(`[member-removal-isolation] cleanup failed: ${failures.join('; ')}`);
    }
  }, 120_000);

  it('an Owner removes a Member in one act: row, scoped PATs, invites, Bugs, activity; nothing else moves (AC-06..09, 12, 13, 16, E1)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('happy', { owner: 'owner', member: 'member', viewer: 'viewer' });
    const other = await seedWorkspace('other', { owner: 'owner', member: 'member' });

    const bugs = [
      await seedBug(seed, { title: 'held open one', assignee: 'member', author: 'owner' }),
      await seedBug(seed, { title: 'held open two', assignee: 'member', author: 'member' }),
      await seedBug(seed, { title: 'held closed one', assignee: 'member', author: 'owner', status: 'closed' }),
    ];
    const otherBug = await seedBug(other, { title: 'held elsewhere', assignee: 'member', author: 'owner' });
    const scopedToken = await seedToken('member', seed.workspaceId, 'scoped');
    const globalToken = await seedToken('member', null, 'global');
    const otherToken = await seedToken('member', other.workspaceId, 'other-scoped');
    const inviteToTarget = await seedInvite(seed.workspaceId, users.member.email.toUpperCase(), 'owner');
    const inviteToSomeone = await seedInvite(seed.workspaceId, `${PREFIX}-friend@example.test`, 'owner');
    const inviteIssuedByTarget = await seedInvite(seed.workspaceId, `${PREFIX}-guest@example.test`, 'member');
    const otherMembership = await memberRow(other.workspaceId, 'member');

    const { count: seatsBefore } = await service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('status', 'active');
    const { count: notificationsBefore } = await service().from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);

    const { data, error } = await remove('owner', seed.workspaceId, users.member.id);
    expect(error).toBeNull();
    expect(data).toEqual({
      removed_user_id: users.member.id,
      removed_role: 'member',
      revoked_token_count: 1,
      unassigned_bug_count: 3,
      revoked_invite_count: 1,
    });

    // Membership gone; seat count one lower (AC-06, AC-12).
    expect(await memberRow(seed.workspaceId, 'member')).toBeNull();
    const { count: seatsAfter } = await service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('status', 'active');
    expect(seatsAfter).toBe((seatsBefore ?? 0) - 1);

    // The removed teammate's own session no longer reaches the workspace (AC-06).
    const { data: visible } = await clients.member.from('workspaces').select('id').eq('id', seed.workspaceId);
    expect(visible).toEqual([]);
    const { data: stillThere } = await clients.member.from('workspaces').select('id').eq('id', other.workspaceId);
    expect(stillThere?.length).toBe(1);

    // PATs: only the one scoped to this workspace is revoked (AC-07).
    const { data: tokens } = await service().from('access_tokens').select('id, revoked_at').in('id', [scopedToken, globalToken, otherToken]);
    const revoked = Object.fromEntries((tokens ?? []).map(t => [t.id, t.revoked_at !== null]));
    expect(revoked).toEqual({ [scopedToken]: true, [globalToken]: false, [otherToken]: false });

    // Bugs: unassigned, authorship kept, each with a bug.unassigned trail (AC-08, AC-09).
    const { data: bugRows } = await service().from('bugs').select('id, assignee_user_id, created_by').in('id', bugs);
    expect((bugRows ?? []).every(b => b.assignee_user_id === null)).toBe(true);
    expect((bugRows ?? []).find(b => b.id === bugs[1])?.created_by).toBe(users.member.id);
    const { data: unassigned } = await service().from('activity_log').select('entity_id, actor_user_id, payload').eq('workspace_id', seed.workspaceId).eq('action', 'bug.unassigned');
    expect((unassigned ?? []).map(r => r.entity_id).sort()).toEqual([...bugs].sort());
    expect((unassigned ?? []).every(r => (r.payload as Record<string, unknown>).previous_assignee_user_id === users.member.id)).toBe(true);
    const { count: notificationsAfter } = await service().from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
    expect(notificationsAfter).toBe(notificationsBefore);

    // Invites: the one addressed to the target (any case) is revoked; others stay (E1).
    const { data: invites } = await service().from('workspace_invites').select('id, revoked_at').in('id', [inviteToTarget, inviteToSomeone, inviteIssuedByTarget]);
    const inviteRevoked = Object.fromEntries((invites ?? []).map(i => [i.id, i.revoked_at !== null]));
    expect(inviteRevoked).toEqual({ [inviteToTarget]: true, [inviteToSomeone]: false, [inviteIssuedByTarget]: false });

    // Activity: one member.removed naming actor and target (AC-13).
    const { data: removedEvents } = await service().from('activity_log').select('actor_user_id, entity_type, entity_id, payload').eq('workspace_id', seed.workspaceId).eq('action', 'member.removed');
    expect(removedEvents).toEqual([{
      actor_user_id: users.owner.id,
      entity_type: 'workspace_member',
      entity_id: users.member.id,
      payload: { removed_user_id: users.member.id, removed_role: 'member' },
    }]);

    // The second workspace is untouched (AC-16).
    expect(await memberRow(other.workspaceId, 'member')).toEqual(otherMembership);
    const { data: otherBugRow } = await service().from('bugs').select('assignee_user_id').eq('id', otherBug).single();
    expect(otherBugRow?.assignee_user_id).toBe(users.member.id);
    expect(await activityActions(other.workspaceId)).not.toContain('member.removed');
  }, 60_000);

  it('the feed lists member.removed and resolves the removed teammate who never acted (AC-13)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('feed', { owner: 'owner', viewer: 'viewer' });
    const { error } = await remove('owner', seed.workspaceId, users.viewer.id);
    expect(error).toBeNull();

    const { data: page, error: listError } = await clients.owner.rpc('bunkai_list_activity', { p_workspace_id: seed.workspaceId });
    expect(listError).toBeNull();
    const items = (page as { items: Array<{ action: string, entity_id: string, payload: Record<string, unknown> }> }).items;
    const entry = items.find(i => i.action === 'member.removed');
    expect(entry?.entity_id).toBe(users.viewer.id);
    expect(entry?.payload).toEqual({ removed_user_id: users.viewer.id, removed_role: 'viewer' });

    const { data: resolved, error: resolveError } = await clients.owner.rpc('bunkai_resolve_activity_actors', {
      p_workspace_id: seed.workspaceId,
      p_user_ids: [users.viewer.id, users.outsider.id],
    });
    expect(resolveError).toBeNull();
    expect(resolved).toEqual([{ user_id: users.viewer.id, email: users.viewer.email }]);

    // The removed teammate can no longer read this workspace's feed resolver.
    const { error: removedResolve } = await clients.viewer.rpc('bunkai_resolve_activity_actors', {
      p_workspace_id: seed.workspaceId,
      p_user_ids: [users.owner.id],
    });
    expect(removedResolve?.code).toBe('42501');
  }, 60_000);

  it('the ladder: Admin removes Admin, Member and Viewer, never an Owner (AC-01, AC-02, AC-17)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('ladder', { owner: 'owner', admin: 'admin', admin2: 'admin', member: 'member', viewer: 'viewer' });

    const refused = await remove('admin', seed.workspaceId, users.owner.id);
    expect(refused.error?.code).toBe('45221');
    expect(refused.error?.message).toBe('cannot_remove_owner');
    expect((await memberRow(seed.workspaceId, 'owner'))?.role).toBe('owner');

    for (const target of ['admin2', 'member', 'viewer'] as const) {
      const { error } = await remove('admin', seed.workspaceId, users[target].id);
      expect(error).toBeNull();
      expect(await memberRow(seed.workspaceId, target)).toBeNull();
    }
  }, 60_000);

  it('an Owner removes another Owner while one Owner remains (AC-01)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('owners', { owner: 'owner', owner2: 'owner' });
    const { data, error } = await remove('owner', seed.workspaceId, users.owner2.id);
    expect(error).toBeNull();
    expect((data as { removed_role: string }).removed_role).toBe('owner');
    expect((await memberRow(seed.workspaceId, 'owner'))?.role).toBe('owner');
  }, 60_000);

  it('self-removal is refused with cannot_remove_self, even for a sole Owner (AC-11)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('self', { owner: 'owner', admin: 'admin' });
    for (const caller of ['owner', 'admin'] as const) {
      const { error } = await remove(caller, seed.workspaceId, users[caller].id);
      expect(error?.code).toBe('45220');
      expect(error?.message).toBe('cannot_remove_self');
      expect(await memberRow(seed.workspaceId, caller)).not.toBeNull();
    }
  }, 60_000);

  it('Member and Viewer callers get 42501, before the self check (AC-03)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('roles', { owner: 'owner', member: 'member', viewer: 'viewer' });
    for (const [caller, target] of [['member', 'viewer'], ['viewer', 'member'], ['member', 'member']] as const) {
      const { error } = await remove(caller, seed.workspaceId, users[target].id);
      expect(error?.code).toBe('42501');
      expect(error?.message).toBe('not_a_member');
    }
    expect(await memberRow(seed.workspaceId, 'viewer')).not.toBeNull();
    expect(await memberRow(seed.workspaceId, 'member')).not.toBeNull();
  }, 60_000);

  it('a non-member target, an invisible, a nonexistent and a deleted workspace are indistinguishable (AC-17, E6, E8)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('hidden', { owner: 'owner', admin: 'admin', member: 'member' });
    const deleted = await seedWorkspace('deleted', { owner: 'owner', member: 'member' });
    await service().from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', deleted.workspaceId);
    // E8: a user who only holds a pending invite is not a removable member.
    await seedInvite(seed.workspaceId, users.outsider.email, 'owner');

    const answers = [
      await remove('admin', seed.workspaceId, users.outsider.id),
      await remove('admin', seed.workspaceId, ZERO_UUID),
      await remove('outsider', seed.workspaceId, users.member.id),
      await remove('owner', crypto.randomUUID(), users.member.id),
      await remove('owner', deleted.workspaceId, users.member.id),
    ];
    for (const answer of answers) {
      expect(answer.error?.code).toBe('P0002');
      expect(answer.error?.message).toBe('not_found');
      expect(answer.data).toBeNull();
    }
    expect(await memberRow(seed.workspaceId, 'member')).not.toBeNull();
    expect(await memberRow(deleted.workspaceId, 'member')).not.toBeNull();
  }, 60_000);

  it('a failure after every write rolls all of it back, and the removal can be retried (AC-14)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('rollback', { owner: 'owner', member: 'member' });
    const bug = await seedBug(seed, { title: 'held during rollback', assignee: 'member', author: 'owner' });
    const token = await seedToken('member', seed.workspaceId, 'rollback-scoped');
    const invite = await seedInvite(seed.workspaceId, users.member.email, 'owner');
    const before = await memberRow(seed.workspaceId, 'member');
    const actionsBefore = await activityActions(seed.workspaceId);

    const { error: armError } = await service().from('bunkai_test_failpoints').insert({ name: 'member_remove.before_event', workspace_id: seed.workspaceId });
    expect(armError).toBeNull();
    const failed = await remove('owner', seed.workspaceId, users.member.id);
    expect(failed.error?.code).toBe('P0001');
    expect(failed.error?.message).toBe('test_failpoint');

    expect(await memberRow(seed.workspaceId, 'member')).toEqual(before);
    const { data: bugRow } = await service().from('bugs').select('assignee_user_id').eq('id', bug).single();
    expect(bugRow?.assignee_user_id).toBe(users.member.id);
    const { data: tokenRow } = await service().from('access_tokens').select('revoked_at').eq('id', token).single();
    expect(tokenRow?.revoked_at).toBeNull();
    const { data: inviteRow } = await service().from('workspace_invites').select('revoked_at').eq('id', invite).single();
    expect(inviteRow?.revoked_at).toBeNull();
    expect(await activityActions(seed.workspaceId)).toEqual(actionsBefore);

    await service().from('bunkai_test_failpoints').delete().eq('workspace_id', seed.workspaceId);
    const retried = await remove('owner', seed.workspaceId, users.member.id);
    expect(retried.error).toBeNull();
    expect(await memberRow(seed.workspaceId, 'member')).toBeNull();
  }, 60_000);

  it('no user session can read or arm a failpoint', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('failpoint-acl', { owner: 'owner' });
    const armed = await clients.owner.from('bunkai_test_failpoints').insert({ name: 'member_remove.before_event', workspace_id: seed.workspaceId });
    expect(armed.error).not.toBeNull();
    const { count } = await service().from('bunkai_test_failpoints').select('name', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
    expect(count).toBe(0);
  }, 60_000);

  it('two Admins removing each other at once: exactly one wins, the loser gets 404 (E2)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('race-admins', { owner: 'owner', admin: 'admin', admin2: 'admin' });
    const [a, b] = await Promise.all([
      remove('admin', seed.workspaceId, users.admin2.id),
      remove('admin2', seed.workspaceId, users.admin.id),
    ]);
    const outcomes = [a.error?.code ?? 'ok', b.error?.code ?? 'ok'].sort();
    expect(outcomes).toEqual(['P0002', 'ok']);
    const survivors = [await memberRow(seed.workspaceId, 'admin'), await memberRow(seed.workspaceId, 'admin2')].filter(Boolean);
    expect(survivors.length).toBe(1);
  }, 60_000);

  it('two Owners removing each other at once: one Owner always remains (AC-10.1)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('race-owners', { owner: 'owner', owner2: 'owner' });
    const [a, b] = await Promise.all([
      remove('owner', seed.workspaceId, users.owner2.id),
      remove('owner2', seed.workspaceId, users.owner.id),
    ]);
    const outcomes = [a.error?.code ?? 'ok', b.error?.code ?? 'ok'].sort();
    expect(outcomes).toEqual(['P0002', 'ok']);
    const { count } = await service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('role', 'owner').eq('status', 'active');
    expect(count).toBe(1);
  }, 60_000);

  it('the data API enforces the same ladder: DELETE (AC-18)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('rls-delete', { owner: 'owner', admin: 'admin', member: 'member' });
    const asAdmin = clients.admin;

    // An RLS-filtered DELETE answers success with zero rows: assert the count, then re-read.
    const onOwner = await asAdmin.from('workspace_members').delete({ count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.owner.id);
    expect(onOwner.error).toBeNull();
    expect(onOwner.count).toBe(0);
    expect((await memberRow(seed.workspaceId, 'owner'))?.role).toBe('owner');

    const onSelf = await asAdmin.from('workspace_members').delete({ count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.admin.id);
    expect(onSelf.count).toBe(0);
    expect(await memberRow(seed.workspaceId, 'admin')).not.toBeNull();

    // Rank-based, not a blanket denial: the ladder permits a Member's row.
    const onMember = await asAdmin.from('workspace_members').delete({ count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.member.id);
    expect(onMember.count).toBe(1);
    expect(await memberRow(seed.workspaceId, 'member')).toBeNull();
  }, 60_000);

  it('the data API enforces the same ladder: UPDATE and INSERT (AC-18, E7)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('rls-write', { owner: 'owner', admin: 'admin', member: 'member' });
    const asAdmin = clients.admin;

    const demoteOwner = await asAdmin.from('workspace_members').update({ role: 'member' }, { count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.owner.id);
    expect(demoteOwner.count ?? 0).toBe(0);
    expect((await memberRow(seed.workspaceId, 'owner'))?.role).toBe('owner');

    const suspendOwner = await asAdmin.from('workspace_members').update({ status: 'suspended' }, { count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.owner.id);
    expect(suspendOwner.count ?? 0).toBe(0);
    expect((await memberRow(seed.workspaceId, 'owner'))?.status).toBe('active');

    const promoteSelf = await asAdmin.from('workspace_members').update({ role: 'owner' }, { count: 'exact' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.admin.id);
    expect(promoteSelf.count ?? 0).toBe(0);
    expect((await memberRow(seed.workspaceId, 'admin'))?.role).toBe('admin');

    // The old row passes, the new one does not: the `with check` refuses with 42501.
    const promoteMember = await asAdmin.from('workspace_members').update({ role: 'owner' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.member.id);
    expect(promoteMember.error?.code).toBe('42501');
    expect((await memberRow(seed.workspaceId, 'member'))?.role).toBe('member');

    const insertOwner = await asAdmin.from('workspace_members').insert({ workspace_id: seed.workspaceId, user_id: users.outsider.id, role: 'owner', status: 'active' });
    expect(insertOwner.error?.code).toBe('42501');
    expect(await memberRow(seed.workspaceId, 'outsider')).toBeNull();

    const insertViewer = await asAdmin.from('workspace_members').insert({ workspace_id: seed.workspaceId, user_id: users.outsider.id, role: 'viewer', status: 'active' });
    expect(insertViewer.error).toBeNull();
    expect((await memberRow(seed.workspaceId, 'outsider'))?.role).toBe('viewer');
  }, 60_000);

  it('a re-invited teammate returns as a new joiner and the revoked PAT stays revoked (AC-15)', async () => {
    expect.hasAssertions();
    const seed = await seedWorkspace('rejoin', { owner: 'owner', member: 'member' });
    await service().from('workspace_members').update({ joined_at: '2025-11-01T00:00:00Z' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.member.id);
    const token = await seedToken('member', seed.workspaceId, 'rejoin-scoped');
    expect((await remove('owner', seed.workspaceId, users.member.id)).error).toBeNull();

    // The accept route re-adds through the service role; mirror it.
    await service().from('workspace_members').insert({ workspace_id: seed.workspaceId, user_id: users.member.id, role: 'viewer', status: 'active' });
    const back = await memberRow(seed.workspaceId, 'member');
    expect(back?.role).toBe('viewer');
    expect(new Date(back!.joined_at as string).getFullYear()).toBeGreaterThanOrEqual(2026);
    const { data: tokenRow } = await service().from('access_tokens').select('revoked_at').eq('id', token).single();
    expect(tokenRow?.revoked_at).not.toBeNull();
  }, 60_000);
});
