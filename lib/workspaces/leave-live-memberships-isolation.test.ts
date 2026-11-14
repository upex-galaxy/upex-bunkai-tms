import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createMembershipFixture, hasLockEnv } from './membership-lock-test-support';

// BK-1901 — the last_membership guard of bunkai_leave_workspace (migration 0128)
// against the REAL database. A soft-deleted workspace keeps its member rows
// `active` (ADR-0015: restore moves no data), so the guard must count only
// memberships in live workspaces. Before 0128 the "live + deleted" cases below
// let the caller leave their only live workspace.
//
// Workspaces are deleted and restored by stamping `deleted_at` with the service
// client, not through the BK-512 RPCs: the guard reads only that column, and
// the RPCs write a `workspace_deletions` tombstone that references the user and
// would outlive the fixture's cleanup.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment.

if (!hasLockEnv) {
  console.warn('[leave-live-memberships-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the guard.');
}
const describeOrSkip = hasLockEnv ? describe : describe.skip;

const PERSONAS = ['lead', 'member', 'solo', 'pair', 'duo', 'back', 'ghost'] as const;
type Persona = typeof PERSONAS[number];
const f = createMembershipFixture('jungla-bk1901', PERSONAS);
const { users, clients } = f;

function leave(caller: Persona, workspaceId: string) {
  return clients[caller].rpc('bunkai_leave_workspace', { p_workspace_id: workspaceId });
}

async function setDeleted(workspaceId: string, deleted: boolean): Promise<void> {
  const { error } = await f.service()
    .from('workspaces')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', workspaceId);
  if (error) {
    throw new Error(`[jungla-bk1901] could not ${deleted ? 'delete' : 'restore'} a fixture workspace: ${error.message}`);
  }
}

async function seedDeleted(name: string, members: Partial<Record<Persona, 'owner' | 'admin' | 'member'>>): Promise<string> {
  const { workspaceId } = await f.seedWorkspace(name, members);
  await setDeleted(workspaceId, true);
  return workspaceId;
}

beforeAll(async () => {
  if (hasLockEnv) {
    await f.setup();
  }
}, 120_000);

afterAll(async () => {
  if (!hasLockEnv) {
    return;
  }
  const userIds = PERSONAS.map(p => users[p].id).filter(Boolean);
  await f.teardown();
  // Re-count what the fixture may have left behind, by prefix and by id.
  const db = f.service();
  const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${f.prefix}%`);
  const { count: membersLeft } = await db.from('workspace_members').select('user_id', { count: 'exact', head: true }).in('user_id', userIds);
  let usersLeft = 0;
  for (const id of userIds) {
    if ((await db.auth.admin.getUserById(id)).data?.user) {
      usersLeft += 1;
    }
  }
  console.warn(`[jungla-bk1901] leftovers after cleanup: workspaces=${workspacesLeft ?? 'unknown'} members=${membersLeft ?? 'unknown'} users=${usersLeft}`);
  expect([workspacesLeft, membersLeft, usersLeft]).toEqual([0, 0, 0]);
}, 120_000);

describeOrSkip('BK-1901 — leave counts only memberships in live workspaces (real database)', () => {
  it('a member of one live and one deleted workspace cannot leave the live one: last_membership', async () => {
    expect.hasAssertions();
    // The defect's precondition: owner of A, non-owner member of B, nothing else.
    await seedDeleted('m-deleted', { member: 'owner' });
    const live = await f.seedWorkspace('m-live', { lead: 'owner', member: 'member' });

    const { error } = await leave('member', live.workspaceId);

    expect(error?.code).toBe('45212');
    expect(error?.message).toBe('last_membership');
    expect(await f.memberRow(live.workspaceId, 'member')).toEqual({ role: 'member', status: 'active' });
  }, 60_000);

  it('the sole owner of the only live workspace gets last_membership, not sole_owner', async () => {
    expect.hasAssertions();
    await seedDeleted('s-deleted', { solo: 'member' });
    const live = await f.seedWorkspace('s-live', { solo: 'owner' });

    const { error } = await leave('solo', live.workspaceId);

    expect(error?.code).toBe('45212');
    expect(error?.message).toBe('last_membership');
    expect(await f.memberRow(live.workspaceId, 'solo')).toEqual({ role: 'owner', status: 'active' });
  }, 60_000);

  it('a sole owner who keeps another live workspace still gets sole_owner', async () => {
    expect.hasAssertions();
    await f.seedWorkspace('p-other', { lead: 'owner', pair: 'member' });
    const owned = await f.seedWorkspace('p-owned', { pair: 'owner' });

    const { error } = await leave('pair', owned.workspaceId);

    expect(error?.code).toBe('45213');
    expect(error?.message).toBe('sole_owner');
    expect(await f.memberRow(owned.workspaceId, 'pair')).toEqual({ role: 'owner', status: 'active' });
  }, 60_000);

  it('a member of two live workspaces can leave one, and is then blocked on the last one', async () => {
    expect.hasAssertions();
    await seedDeleted('d-deleted', { duo: 'member' });
    const first = await f.seedWorkspace('d-first', { lead: 'owner', duo: 'member' });
    const second = await f.seedWorkspace('d-second', { lead: 'owner', duo: 'member' });

    const left = await leave('duo', first.workspaceId);
    expect(left.error).toBeNull();
    expect(await f.memberRow(first.workspaceId, 'duo')).toBeNull();

    const last = await leave('duo', second.workspaceId);
    expect(last.error?.code).toBe('45212');
    expect(await f.memberRow(second.workspaceId, 'duo')).toEqual({ role: 'member', status: 'active' });
  }, 60_000);

  it('a restore inside the grace window makes the old membership count again', async () => {
    expect.hasAssertions();
    const deleted = await seedDeleted('r-deleted', { back: 'member' });
    const live = await f.seedWorkspace('r-live', { lead: 'owner', back: 'member' });

    const blocked = await leave('back', live.workspaceId);
    expect(blocked.error?.code).toBe('45212');

    // The deletion never rewrote the member row, so restore is enough.
    expect(await f.memberRow(deleted, 'back')).toEqual({ role: 'member', status: 'active' });
    await setDeleted(deleted, false);

    const allowed = await leave('back', live.workspaceId);
    expect(allowed.error).toBeNull();
    expect(await f.memberRow(live.workspaceId, 'back')).toBeNull();
    expect(await f.memberRow(deleted, 'back')).toEqual({ role: 'member', status: 'active' });
  }, 60_000);

  it('leaving an already deleted workspace stays allowed while a live one remains', async () => {
    expect.hasAssertions();
    const deleted = await seedDeleted('g-deleted', { ghost: 'member' });
    const live = await f.seedWorkspace('g-live', { lead: 'owner', ghost: 'member' });

    const { error } = await leave('ghost', deleted);

    expect(error).toBeNull();
    expect(await f.memberRow(deleted, 'ghost')).toBeNull();
    expect(await f.memberRow(live.workspaceId, 'ghost')).toEqual({ role: 'member', status: 'active' });
  }, 60_000);
});
