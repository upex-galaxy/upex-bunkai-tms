import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-1736: the delete-workspace request can be forced to fail after every one of
// its writes, so BK-512 TC48 ("a deletion that fails halfway leaves the workspace
// intact", AC-18) can be run (migration 0126, ADR-0022 point 5). Against the real
// database: a mocked rpc proves nothing about a DEFINER function's transaction
// (ADR-0012).
//
// What it proves:
//   * with `workspace_delete.before_return` armed for one workspace, the Owner's
//     request fails with P0001 `test_failpoint`, and the workspace is not deleted,
//     its scoped PAT and pending invite stay live, its members and project are
//     unchanged, and no tombstone row exists;
//   * the failpoint is scoped by workspace: a neighbour is deleted normally while
//     the other one is still armed;
//   * once the row is cleared, the same request deletes the workspace as before;
//   * no user session can read or arm a failpoint.
//
// Actors are throwaway users signed in through the real password path, the
// precedent of `lib/workspaces/member-removal-isolation.test.ts`; the service role
// only seeds, arms and clears the failpoint and tears down. Every fixture carries
// PREFIX, and afterAll fails the file if any workspace, failpoint, tombstone or
// user with it remains.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment or the function is not deployed (42883 / PGRST202). The probe
// cannot tell 0084 from 0126 (same signature), so before 0126 is applied the
// armed case fails here, which is the intended signal. Shared-DB test: run it
// alone.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDbEnv = Boolean(url && anonKey && serviceKey);
const RPC = 'bunkai_request_workspace_deletion';
const FAILPOINT = 'workspace_delete.before_return';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

if (!hasDbEnv) {
  console.warn('[request-failpoint-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// A service-role call carries no auth.uid(): a deployed function answers 42501.
let deployed = false;
if (hasDbEnv) {
  const probe = await service().rpc(RPC, { p_workspace_id: ZERO_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === '42501') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[request-failpoint-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}).`);
  }
  else {
    throw new Error(`[request-failpoint-isolation] unexpected probe answer (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk1736-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;

type Persona = 'owner' | 'member';
const PERSONAS: Persona[] = ['owner', 'member'];
const users = Object.fromEntries(PERSONAS.map(p => [p, { id: '', email: `${PREFIX}-${p}@example.test` }])) as Record<Persona, { id: string, email: string }>;
const clients = {} as Record<Persona, SupabaseClient>;
const workspaceIds: string[] = [];

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[request-failpoint-isolation] fixture step failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seeded {
  workspaceId: string
  tokenId: string
  inviteId: string
}

// An Owner + Member workspace with the content the request's earlier steps
// touch: a PAT scoped to it, a pending invite and a project.
async function seedWorkspace(tag: string): Promise<Seeded> {
  const db = service();
  const ws = must(await db.from('workspaces')
    .insert({ slug: `${PREFIX}-${tag}`, name: `${PREFIX} ${tag}`, owner_user_id: users.owner.id })
    .select('id')
    .single(), `workspace ${tag}`);
  workspaceIds.push(ws.id as string);
  const { error: memberError } = await db.from('workspace_members').insert([
    { workspace_id: ws.id, user_id: users.owner.id, role: 'owner', status: 'active' },
    { workspace_id: ws.id, user_id: users.member.id, role: 'member', status: 'active' },
  ]);
  if (memberError) {
    throw new Error(`[request-failpoint-isolation] members ${tag}: ${memberError.message}`);
  }
  must(await db.from('projects')
    .insert({ workspace_id: ws.id, slug: `${PREFIX}-${tag}-p`, name: `${PREFIX} ${tag} project` })
    .select('id')
    .single(), `project ${tag}`);
  const token = must(await db.from('access_tokens').insert({
    user_id: users.member.id,
    workspace_id: ws.id,
    name: `${PREFIX} ${tag}`,
    token_prefix: Math.random().toString(36).slice(2, 10),
    scopes: ['atc:read'],
  }).select('id').single(), `token ${tag}`);
  const invite = must(await db.from('workspace_invites').insert({
    workspace_id: ws.id,
    email: `${PREFIX}-${tag}-invitee@example.test`,
    role: 'member',
    invited_by_user_id: users.owner.id,
  }).select('id').single(), `invite ${tag}`);
  return { workspaceId: ws.id as string, tokenId: token.id as string, inviteId: invite.id as string };
}

// Everything the request writes or must leave alone, read with the service role.
async function snapshot(seed: Seeded) {
  const db = service();
  const ws = must(await db.from('workspaces').select('deleted_at, deletion_requested_by').eq('id', seed.workspaceId).single(), 'read workspace');
  const { data: members, error: membersError } = await db.from('workspace_members')
    .select('user_id, role, status')
    .eq('workspace_id', seed.workspaceId)
    .order('user_id');
  if (membersError) {
    throw membersError;
  }
  const token = must(await db.from('access_tokens').select('revoked_at').eq('id', seed.tokenId).single(), 'read token');
  const invite = must(await db.from('workspace_invites').select('revoked_at').eq('id', seed.inviteId).single(), 'read invite');
  const { count: projects } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
  const { count: tombstones } = await db.from('workspace_deletions').select('id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
  return {
    deletedAt: (ws as { deleted_at: string | null }).deleted_at,
    deletionRequestedBy: (ws as { deletion_requested_by: string | null }).deletion_requested_by,
    members,
    tokenRevokedAt: (token as { revoked_at: string | null }).revoked_at,
    inviteRevokedAt: (invite as { revoked_at: string | null }).revoked_at,
    projects,
    tombstones,
  };
}

async function arm(workspaceId: string) {
  must(await service().from('bunkai_test_failpoints').insert({ name: FAILPOINT, workspace_id: workspaceId }).select('name').single(), 'arm failpoint');
}

async function clear(workspaceId: string) {
  const { error } = await service().from('bunkai_test_failpoints').delete().eq('name', FAILPOINT).eq('workspace_id', workspaceId);
  if (error) {
    throw new Error(`[request-failpoint-isolation] clear failpoint: ${error.message}`);
  }
}

async function requestDeletion(workspaceId: string) {
  return clients.owner.rpc(RPC, { p_workspace_id: workspaceId });
}

function expectDeleted(after: Awaited<ReturnType<typeof snapshot>>) {
  expect(after.deletedAt).not.toBeNull();
  expect(after.deletionRequestedBy).toBe(users.owner.id);
  expect(after.tokenRevokedAt).not.toBeNull();
  expect(after.inviteRevokedAt).not.toBeNull();
  expect(after.tombstones).toBe(1);
}

describeOrSkip('bunkai_request_workspace_deletion: the BK-1736 failpoint (real database)', () => {
  beforeAll(async () => {
    const admin = service();
    for (const persona of PERSONAS) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[persona].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) {
        throw new Error(`[request-failpoint-isolation] createUser ${persona}: ${error?.message}`);
      }
      users[persona].id = data.user.id;
    }
    for (const persona of PERSONAS) {
      const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await client.auth.signInWithPassword({ email: users[persona].email, password: PASSWORD });
      if (error) {
        throw new Error(`[request-failpoint-isolation] sign-in failed for a fixture user: ${error.message}`);
      }
      clients[persona] = client;
    }
  }, 120_000);

  afterAll(async () => {
    const db = service();
    const failures: string[] = [];
    for (const persona of PERSONAS) {
      await clients[persona]?.auth.signOut();
    }
    if (workspaceIds.length > 0) {
      // Counted BEFORE any delete: the workspace delete cascades to the failpoint
      // rows, so a count after it could never fail. Every test clears its own.
      const { count: failpointsLeft } = await db.from('bunkai_test_failpoints').select('name', { count: 'exact', head: true }).in('workspace_id', workspaceIds);
      if ((failpointsLeft ?? 0) !== 0) {
        failures.push(`${failpointsLeft} failpoints were left armed by the tests`);
      }
      await db.from('bunkai_test_failpoints').delete().in('workspace_id', workspaceIds);
      // The tombstone has no FK to the workspace and its requested_by restricts
      // the user delete, so it goes first.
      await db.from('workspace_deletions').delete().in('workspace_id', workspaceIds);
      const { error } = await db.from('workspaces').delete().in('id', workspaceIds);
      if (error) {
        failures.push(`workspaces: ${error.message}`);
      }
    }
    for (const persona of PERSONAS) {
      if (!users[persona].id) {
        continue;
      }
      await db.from('access_tokens').delete().eq('user_id', users[persona].id);
      const { error } = await db.auth.admin.deleteUser(users[persona].id);
      if (error) {
        failures.push(`user ${persona}: ${error.message}`);
      }
    }
    const { count: wsLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if ((wsLeft ?? 0) !== 0) {
      failures.push(`${wsLeft} ${PREFIX} workspaces remain`);
    }
    const { count: tombstonesLeft } = await db.from('workspace_deletions').select('id', { count: 'exact', head: true }).like('workspace_slug', `${PREFIX}%`);
    if ((tombstonesLeft ?? 0) !== 0) {
      failures.push(`${tombstonesLeft} ${PREFIX} tombstones remain`);
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
      throw new Error(`[request-failpoint-isolation] teardown left fixtures behind: ${failures.join('; ')}`);
    }
  }, 120_000);

  it('an armed workspace refuses the request with test_failpoint and every write rolls back (BK-512 TC48, AC-18)', async () => {
    const seed = await seedWorkspace('armed');
    const before = await snapshot(seed);
    expect(before.deletedAt).toBeNull();
    expect(before.tombstones).toBe(0);

    await arm(seed.workspaceId);
    try {
      const { data, error } = await requestDeletion(seed.workspaceId);
      expect(data).toBeNull();
      expect(error?.code).toBe('P0001');
      expect(error?.message).toBe('test_failpoint');
      expect(await snapshot(seed)).toEqual(before);
    }
    finally {
      await clear(seed.workspaceId);
    }
  }, 60_000);

  it('the failpoint is scoped to its workspace: a neighbour is deleted normally while the other is armed', async () => {
    const armed = await seedWorkspace('scoped-armed');
    const neighbour = await seedWorkspace('scoped-neighbour');
    const armedBefore = await snapshot(armed);

    await arm(armed.workspaceId);
    try {
      const { data, error } = await requestDeletion(neighbour.workspaceId);
      expect(error).toBeNull();
      expect((data as { workspace_id: string }).workspace_id).toBe(neighbour.workspaceId);
      expectDeleted(await snapshot(neighbour));
      expect(await snapshot(armed)).toEqual(armedBefore);
    }
    finally {
      await clear(armed.workspaceId);
    }
  }, 60_000);

  it('once the failpoint is cleared the same request deletes the workspace as before', async () => {
    const seed = await seedWorkspace('cleared');
    await arm(seed.workspaceId);
    const failed = await requestDeletion(seed.workspaceId);
    expect(failed.error?.message).toBe('test_failpoint');
    await clear(seed.workspaceId);

    const { data, error } = await requestDeletion(seed.workspaceId);
    expect(error).toBeNull();
    expect((data as { workspace_id: string }).workspace_id).toBe(seed.workspaceId);
    expectDeleted(await snapshot(seed));
  }, 60_000);

  it('no user session can read or arm a failpoint, not even the Owner of the armed workspace', async () => {
    const seed = await seedWorkspace('acl');
    await arm(seed.workspaceId);
    try {
      const read = await clients.owner.from('bunkai_test_failpoints').select('name').eq('workspace_id', seed.workspaceId);
      expect(read.error?.code).toBe('42501');
      const removed = await clients.owner.from('bunkai_test_failpoints').delete().eq('workspace_id', seed.workspaceId);
      expect(removed.error?.code).toBe('42501');
    }
    finally {
      await clear(seed.workspaceId);
    }
    const armedByOwner = await clients.owner.from('bunkai_test_failpoints').insert({ name: FAILPOINT, workspace_id: seed.workspaceId });
    expect(armedByOwner.error?.code).toBe('42501');
    const { count } = await service().from('bunkai_test_failpoints').select('name', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId);
    expect(count).toBe(0);
  }, 60_000);
});

// Static, needs no database: the armed test alone would also pass with the
// failpoint as the first statement, so pin that it reads after the last write.
describe('migration 0126: where the failpoint sits', () => {
  it('reads workspace_delete.before_return after the tombstone insert and before the recipients read', async () => {
    const sql = await Bun.file(new URL('../../supabase/migrations/0126_workspace_deletion_failpoint.sql', import.meta.url)).text();
    const body = sql.slice(sql.indexOf('as $$'), sql.lastIndexOf('$$;'));
    const tombstone = body.indexOf('insert into public.workspace_deletions');
    const failpoint = body.indexOf(`f.name = '${FAILPOINT}'`);
    const recipients = body.indexOf('into v_recipients');
    expect(tombstone).toBeGreaterThan(0);
    expect(failpoint).toBeGreaterThan(tombstone);
    expect(recipients).toBeGreaterThan(failpoint);
  });
});
