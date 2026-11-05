import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createMembershipFixture, expectEveryCallBlocked, hasLockEnv, overlapHolding, overlapOnMemberRow, withLocklessCopy } from './membership-lock-test-support';

// BK-1589 G5 — the lock proofs for assign Bug (AC-2) and for Leave against Remove
// (AC-3), against the REAL database (migration 0118). Outcome-only assertions do
// not count here: each test forces the overlap and asserts the second backend is
// waiting on a lock, then the outcome. Run against a function without its lock
// clause, these tests go red: that run is recorded in the PR.
//
// Waiting alone would not convict Leave: a lock-less Leave still blocks on its
// own DELETE. What gives it away is the answer, so these tests assert both. It
// would succeed where it must answer not_a_member, and two Owners would both
// get out.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment. A deployed function that does not lock FAILS the file.

if (!hasLockEnv) {
  console.warn('[membership-lock-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the locks.');
}
const describeOrSkip = hasLockEnv ? describe : describe.skip;

const PERSONAS = ['owner', 'owner2', 'admin', 'member', 'other', 'loner'] as const;
const f = createMembershipFixture('bk1589-lock', PERSONAS);
const { users, clients } = f;

function assign(caller: typeof PERSONAS[number], bugId: string, assignee: string | null) {
  return clients[caller].rpc('bunkai_assign_bug', { p_bug_id: bugId, p_assignee_user_id: assignee });
}

function remove(caller: typeof PERSONAS[number], workspaceId: string, target: string) {
  return clients[caller].rpc('bunkai_remove_workspace_member', { p_workspace_id: workspaceId, p_user_id: target });
}

function leave(caller: typeof PERSONAS[number], workspaceId: string) {
  return clients[caller].rpc('bunkai_leave_workspace', { p_workspace_id: workspaceId });
}

// A second membership, or last_membership (45212) answers before the race does.
async function seedSpareMemberships(tag: string, members: Partial<Record<typeof PERSONAS[number], 'member'>>): Promise<void> {
  await f.seedWorkspace(`${tag}-spare`, members);
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
    const moving = await f.seedBug(seed, { title: 'reassigned away from the removed member', author: 'owner', assignee: 'member' });
    const stays = await f.seedBug(seed, { title: 'stays with the removed member', author: 'owner', assignee: 'member' });

    // The removal goes first and needs its caller's row and then the Bugs. The
    // reassignment wants the same caller's row and the same Bug. An assign that
    // locked the Bug first would hold it while waiting for the row the removal
    // holds, and Postgres would raise 40P01 on one of them.
    const { blocked, results: [removal, assignment] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.owner.id },
      [() => remove('owner', seed.workspaceId, users.member.id), () => assign('other', moving, users.owner.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(removal.error).toBeNull();
    expect(assignment.error).toBeNull();
    expect((removal.data as { unassigned_bug_count: number }).unassigned_bug_count).toBe(2);
    expect(await f.bugAssignee(moving)).toBe(users.owner.id);
    expect(await f.bugAssignee(stays)).toBeNull();
    const assigned = await f.activity(seed.workspaceId, 'bug.assigned');
    expect(assigned.map(a => a.entity_id)).toEqual([moving]);
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

  it('the Bug is read under its own lock: a write that commits during the wait is what the trail names', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('bug-lock', { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'written while the assign waits', author: 'owner' });

    const { blocked, results: [assignment] } = await overlapHolding(
      {
        hold: async holder => holder`update public.bugs set assignee_user_id = ${users.other.id}::uuid where id = ${bug}::uuid returning 1`,
        release: 'commit',
      },
      [() => assign('owner', bug, users.member.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(assignment.error).toBeNull();
    expect(await f.activity(seed.workspaceId, 'bug.assigned')).toEqual([]);
    const reassigned = await f.activity(seed.workspaceId, 'bug.reassigned');
    expect((reassigned[0].payload as Record<string, unknown>).previous_assignee_user_id).toBe(users.other.id);
  }, 60_000);

  it('with the Bug lock clause deleted the same scenario writes a false trail (G5)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('bug-lock-mutant', { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'written while the mutant waits', author: 'owner' });

    await withLocklessCopy(
      { signature: 'public.bunkai_assign_bug(uuid,uuid)', clause: /where id = p_bug_id\s+for update/, unlocked: 'where id = p_bug_id', tempName: 'assign_without_bug_lock', sub: users.owner.id },
      async (session) => {
        await overlapHolding(
          {
            hold: async holder => holder`update public.bugs set assignee_user_id = ${users.other.id}::uuid where id = ${bug}::uuid returning 1`,
            release: 'commit',
          },
          [async () => session.unsafe('select pg_temp.assign_without_bug_lock($1::uuid, $2::uuid)', [bug, users.member.id])],
        );
      },
    );

    // Red for the test above: the event claims the Bug had no assignee.
    expect(await f.activity(seed.workspaceId, 'bug.reassigned')).toEqual([]);
    const assigned = await f.activity(seed.workspaceId, 'bug.assigned');
    expect((assigned[0].payload as Record<string, unknown>).previous_assignee_user_id).toBeNull();
  }, 60_000);

  it.each([
    ['assign', 'member'],
    ['unassign', null],
  ] as const)('a caller removed while waiting on the Bug cannot complete the %s', async (_label, assignee) => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace(`caller-gone-bug-${_label}`, { owner: 'owner', member: 'member', other: 'member' });
    const bug = await f.seedBug(seed, { title: 'caller goes during the Bug wait', author: 'owner', assignee: assignee ? undefined : 'member' });

    const { blocked, results: [answer] } = await overlapHolding(
      { hold: async holder => holder`select 1 from public.bugs where id = ${bug}::uuid for update` },
      [() => assign('other', bug, assignee ? users[assignee].id : null)],
      async () => {
        const removal = await remove('owner', seed.workspaceId, users.other.id);
        expect(removal.error).toBeNull();
      },
    );

    expectEveryCallBlocked(blocked);
    expect(answer.error?.code).toBe('P0002');
    expect(await f.bugAssignee(bug)).toBe(assignee ? null : users.member.id);
  }, 60_000);
});

describeOrSkip('BK-1589 — Leave and Remove never leave a half state (AC-3, real database)', () => {
  it('Leave goes first: Remove waits and answers not found, and nothing is revoked twice (AC-3.1)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('leave-first', { owner: 'owner', admin: 'admin', member: 'member' });
    await seedSpareMemberships('leave-first', { member: 'member' });
    const token = await f.seedToken('member', seed.workspaceId, 'leave-first-scoped');
    const bug = await f.seedBug(seed, { title: 'held by the member who leaves', author: 'owner', assignee: 'member' });

    const { blocked, results: [left, removal] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => leave('member', seed.workspaceId), () => remove('admin', seed.workspaceId, users.member.id)],
    );

    expectEveryCallBlocked(blocked);
    expect(left.error).toBeNull();
    expect(removal.error?.code).toBe('P0002');
    expect(removal.error?.message).toBe('not_found');
    expect(await f.memberRow(seed.workspaceId, 'member')).toBeNull();
    expect(await f.tokenRevokedAt(token)).not.toBeNull();
    expect(await f.activity(seed.workspaceId, 'member.removed')).toEqual([]);
    // Pinned on purpose: Leave keeps its BK-90 side effects (AI Tech Lead decision).
    expect(await f.bugAssignee(bug)).toBe(users.member.id);
  }, 60_000);

  it('Remove goes first: Leave waits and answers not_a_member, and the removal shows exactly once (AC-3.2)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('remove-first', { owner: 'owner', admin: 'admin', member: 'member' });
    await seedSpareMemberships('remove-first', { member: 'member' });
    const token = await f.seedToken('member', seed.workspaceId, 'remove-first-scoped');
    const bug = await f.seedBug(seed, { title: 'held by the removed member', author: 'owner', assignee: 'member' });

    const { blocked, results: [removal, left] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.member.id },
      [() => remove('admin', seed.workspaceId, users.member.id), () => leave('member', seed.workspaceId)],
    );

    expectEveryCallBlocked(blocked);
    expect(removal.error).toBeNull();
    // The discriminator: a lock-less Leave reads the row as active, waits on its
    // own DELETE, deletes nothing and answers success.
    expect(left.error?.code).toBe('P0002');
    expect(left.error?.message).toBe('not_a_member');
    expect(await f.memberRow(seed.workspaceId, 'member')).toBeNull();
    expect(await f.tokenRevokedAt(token)).not.toBeNull();
    expect(await f.bugAssignee(bug)).toBeNull();
    expect((await f.activity(seed.workspaceId, 'member.removed')).length).toBe(1);
    expect((await f.activity(seed.workspaceId, 'bug.unassigned')).length).toBe(1);
  }, 60_000);

  it('two Owners leaving at once: exactly one gets out, the other gets sole_owner, an Owner remains (AC-3.3)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('two-owners', { owner: 'owner', owner2: 'owner', member: 'member' });
    await seedSpareMemberships('two-owners', { owner: 'member', owner2: 'member' });

    // Hold the lower user_id, the first row either Leave reaches.
    const [first] = [users.owner.id, users.owner2.id].sort();
    const { blocked, results } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: first },
      [() => leave('owner', seed.workspaceId), () => leave('owner2', seed.workspaceId)],
    );

    expectEveryCallBlocked(blocked);
    expect(results.map(r => r.error?.code ?? 'ok').sort()).toEqual(['45213', 'ok']);
    const { count } = await f.service().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', seed.workspaceId).eq('role', 'owner').eq('status', 'active');
    expect(count).toBe(1);
  }, 60_000);

  it('Leave still refuses a sole Owner and a last membership, and a plain Leave still works (AC-1.4)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('leave-guards', { owner: 'owner', member: 'member' });
    await seedSpareMemberships('leave-guards', { owner: 'member', member: 'member' });

    const soleOwner = await leave('owner', seed.workspaceId);
    expect(soleOwner.error?.code).toBe('45213');
    expect(await f.memberRow(seed.workspaceId, 'owner')).not.toBeNull();

    const onlyHome = await f.seedWorkspace('leave-only', { loner: 'member', owner: 'owner' });
    const lastMembership = await leave('loner', onlyHome.workspaceId);
    expect(lastMembership.error?.code).toBe('45212');

    const token = await f.seedToken('member', seed.workspaceId, 'plain-leave-scoped');
    const plain = await leave('member', seed.workspaceId);
    expect(plain.error).toBeNull();
    expect(await f.memberRow(seed.workspaceId, 'member')).toBeNull();
    expect(await f.tokenRevokedAt(token)).not.toBeNull();

    const notMember = await leave('member', seed.workspaceId);
    expect(notMember.error?.code).toBe('P0002');
  }, 60_000);
});
