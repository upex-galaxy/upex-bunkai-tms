import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createMembershipFixture, expectEveryCallBlocked, hasLockEnv, overlapOnMemberRow } from './membership-lock-test-support';

// BK-1589 G5 — the lock proofs for assign Bug (AC-2), against the REAL database
// (migration 0118). Outcome-only assertions do not count here: each test forces
// the overlap and asserts the second backend is waiting on a lock, then the
// outcome. Run against a function without its lock clause, these tests go red:
// that run is recorded in the PR.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment. A deployed function that does not lock FAILS the file.

if (!hasLockEnv) {
  console.warn('[membership-lock-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the locks.');
}
const describeOrSkip = hasLockEnv ? describe : describe.skip;

const PERSONAS = ['owner', 'member', 'other'] as const;
const f = createMembershipFixture('bk1589-lock', PERSONAS);
const { users, clients } = f;

function assign(caller: typeof PERSONAS[number], bugId: string, assignee: string | null) {
  return clients[caller].rpc('bunkai_assign_bug', { p_bug_id: bugId, p_assignee_user_id: assignee });
}

function remove(caller: typeof PERSONAS[number], workspaceId: string, target: string) {
  return clients[caller].rpc('bunkai_remove_workspace_member', { p_workspace_id: workspaceId, p_user_id: target });
}

beforeAll(async () => {
  if (hasLockEnv) {
    await f.setup();
  }
}, 120_000);
afterAll(async () => {
  if (hasLockEnv) {
    await f.teardown();
  }
}, 120_000);

describeOrSkip('BK-1589 — assign Bug takes the member lock (AC-2, real database)', () => {
  it('a removal that holds the member lock wins: assign waits, then fails 45312 and the Bug stays unassigned (AC-2.1)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('assign-loses', { owner: 'owner', member: 'member' });
    const bug = await f.seedBug(seed, { title: 'nobody holds it', author: 'owner' });

    const { blocked, results: [removal, assignment] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => remove('owner', seed.workspaceId, users.member.id), () => assign('owner', bug, users.member.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(removal.error).toBeNull();
    // The discriminator: a lock-less assign reads the row as active and succeeds.
    expect(assignment.error?.code).toBe('45312');
    expect(await f.bugAssignee(bug)).toBeNull();
    expect(await f.memberRow(seed.workspaceId, 'member')).toBeNull();
    expect(await f.activity(seed.workspaceId, 'bug.assigned')).toEqual([]);
  }, 60_000);

  it('an assign that goes first wins: the removal waits, then unassigns the Bug with a trail (AC-2.2)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('assign-wins', { owner: 'owner', member: 'member' });
    const bug = await f.seedBug(seed, { title: 'assigned during removal', author: 'owner' });

    const { blocked, results: [assignment, removal] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => assign('owner', bug, users.member.id), () => remove('owner', seed.workspaceId, users.member.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(assignment.error).toBeNull();
    expect(removal.error).toBeNull();
    expect((removal.data as { unassigned_bug_count: number }).unassigned_bug_count).toBe(1);
    expect(await f.bugAssignee(bug)).toBeNull();
    const trail = await f.activity(seed.workspaceId, 'bug.unassigned');
    expect(trail.map(t => t.entity_id)).toEqual([bug]);
    expect((trail[0].payload as Record<string, unknown>).previous_assignee_user_id).toBe(users.member.id);
  }, 60_000);

  it('does not deadlock when an assign and a removal cross on the same rows (lock order: members, then Bugs)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('crossing', { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'moving away from the leaver', author: 'owner', assignee: 'member' });
    const stays = await f.seedBug(seed, { title: 'stays with the leaver', author: 'owner', assignee: 'member' });

    // Reassign to the removal's caller, whose row both calls need, while the
    // removal also has to reach the same Bug.
    const { blocked, results: [assignment, removal] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.owner.id },
      [() => assign('other', bug, users.owner.id), () => remove('owner', seed.workspaceId, users.member.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(assignment.error).toBeNull();
    expect(removal.error).toBeNull();
    // The reassignment committed first, so this removal must not touch that Bug.
    expect(await f.bugAssignee(bug)).toBe(users.owner.id);
    expect(await f.bugAssignee(stays)).toBeNull();
    expect((removal.data as { unassigned_bug_count: number }).unassigned_bug_count).toBe(1);
  }, 60_000);

  it('a wait outdates nothing: the trail names the assignee the Bug had once the lock was granted', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('stale-previous', { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'previous assignee moves during the wait', author: 'owner', assignee: 'other' });

    // The reassignment waits on `member`'s row. Meanwhile `other` is removed,
    // which unassigns the Bug, so when the assign resumes nobody holds it.
    const { blocked, results: [assignment] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => assign('owner', bug, users.member.id)],
      async () => {
        const removal = await remove('owner', seed.workspaceId, users.other.id);
        expect(removal.error).toBeNull();
      },
    );
    expectEveryCallBlocked(blocked);
    expect(assignment.error).toBeNull();
    expect(await f.bugAssignee(bug)).toBe(users.member.id);
    expect(await f.activity(seed.workspaceId, 'bug.reassigned')).toEqual([]);
    const assigned = await f.activity(seed.workspaceId, 'bug.assigned');
    expect((assigned[0].payload as Record<string, unknown>).previous_assignee_user_id).toBeNull();
  }, 60_000);

  it('unassign takes no member lock: it finishes while the row is held (AC-2.4)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('unassign', { owner: 'owner', member: 'member' });
    const bug = await f.seedBug(seed, { title: 'unassigned under a held row', author: 'owner', assignee: 'member' });

    const { blocked, results: [unassigned] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [async () => {
        const answer = await assign('owner', bug, null);
        // It answered while the holder still holds the row: nothing was queued.
        return { ...answer, assigneeWhileHeld: await f.bugAssignee(bug) };
      }],
    );
    expect(blocked).toEqual([0]);
    expect(unassigned.error).toBeNull();
    expect(unassigned.assigneeWhileHeld).toBeNull();
  }, 60_000);

  it('a caller removed during the wait cannot complete the assign', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('caller-gone', { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'caller goes mid-wait', author: 'owner' });

    const { blocked, results: [assignment] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => assign('other', bug, users.member.id)],
      async () => {
        const removal = await remove('owner', seed.workspaceId, users.other.id);
        expect(removal.error).toBeNull();
      },
    );
    expectEveryCallBlocked(blocked);
    expect(assignment.error?.code).toBe('P0002');
    expect(await f.bugAssignee(bug)).toBeNull();
  }, 60_000);
});
