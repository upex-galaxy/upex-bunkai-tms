import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasLiveMembership } from '@app/(app)/onboarding/live-membership';
import { resolveNewActiveWorkspace } from '@app/api/v1/workspaces/[id]/membership/response';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createMembershipFixture, hasLockEnv } from './membership-lock-test-support';

// BK-1903 — the two reads that decide "which workspaces does this account
// belong to" after a deletion, against the REAL database:
//   - `/onboarding` (`hasLiveMembership`): form vs redirect to /projects;
//   - Leave (`resolveNewActiveWorkspace`): which workspace becomes active.
// A soft-deleted workspace keeps its member rows `active` (ADR-0015: restore
// moves no data), so both reads must skip it, and count it again after a
// restore.
//
// Each read runs twice: through the member's own session (RLS on) and through
// the service client (RLS off). The `workspace_members` SELECT policy (0084a)
// already hides rows of deleted workspaces from the session, so the session
// run alone cannot tell the explicit filter from the policy. The service run
// can: there only the query's own `deleted_at is null` keeps the deleted
// workspace out. The service client stands in for "a client the policy does
// not narrow", never for how the app reads.
//
// Workspaces are deleted and restored by stamping `deleted_at` with the service
// client, as in `leave-live-memberships-isolation.test.ts` (BK-1901): the reads
// look only at that column, and the BK-512 RPCs write a tombstone that would
// outlive the fixture's cleanup.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment.

if (!hasLockEnv) {
  console.warn('[live-workspace-reads-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the two reads.');
}
const describeOrSkip = hasLockEnv ? describe : describe.skip;

const PERSONAS = ['lead', 'orphan', 'mover'] as const;
const f = createMembershipFixture('jungla-bk1903', PERSONAS);
const { users, clients } = f;

function asApp(client: unknown): SupabaseClient<Database> {
  return client as SupabaseClient<Database>;
}

async function setDeleted(workspaceId: string, deleted: boolean): Promise<void> {
  const { error } = await f.service()
    .from('workspaces')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', workspaceId);
  if (error) {
    throw new Error(`[jungla-bk1903] could not ${deleted ? 'delete' : 'restore'} a fixture workspace: ${error.message}`);
  }
}

// Pins the membership order the Leave rotation depends on (oldest first),
// instead of trusting insert timing.
async function setJoinedAt(workspaceId: string, userId: string, iso: string): Promise<void> {
  const { error } = await f.service()
    .from('workspace_members')
    .update({ joined_at: iso })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);
  if (error) {
    throw new Error(`[jungla-bk1903] could not set joined_at on a fixture membership: ${error.message}`);
  }
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
  console.warn(`[jungla-bk1903] leftovers after cleanup: workspaces=${workspacesLeft ?? 'unknown'} members=${membersLeft ?? 'unknown'} users=${usersLeft}`);
  expect([workspacesLeft, membersLeft, usersLeft]).toEqual([0, 0, 0]);
}, 120_000);

describeOrSkip('BK-1903 — onboarding and Leave read only live workspaces (real database)', () => {
  it('onboarding: an account whose only workspace is deleted gets the form, and is redirected again after a restore', async () => {
    expect.hasAssertions();
    const { workspaceId } = await f.seedWorkspace('o-only', { orphan: 'owner' });
    await setDeleted(workspaceId, true);

    // The membership row itself is untouched by the deletion.
    expect(await f.memberRow(workspaceId, 'orphan')).toEqual({ role: 'owner', status: 'active' });

    // The pre-fix query shape, through the session: RLS already returns nothing.
    const { data: preFixSession } = await clients.orphan
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', users.orphan.id)
      .eq('status', 'active')
      .limit(1);
    console.warn(`[jungla-bk1903] pre-fix onboarding query through the session returned ${preFixSession?.length ?? 'null'} row(s) for a deleted-only account`);
    expect(preFixSession).toEqual([]);

    expect(await hasLiveMembership(asApp(clients.orphan), users.orphan.id)).toBe(false);
    expect(await hasLiveMembership(asApp(f.service()), users.orphan.id)).toBe(false);

    await setDeleted(workspaceId, false);

    expect(await hasLiveMembership(asApp(clients.orphan), users.orphan.id)).toBe(true);
    expect(await hasLiveMembership(asApp(f.service()), users.orphan.id)).toBe(true);
  }, 60_000);

  it('leave: the new active workspace is the oldest LIVE membership, and a restored one counts again', async () => {
    expect.hasAssertions();
    const a = await f.seedWorkspace('m-a', { lead: 'owner', mover: 'member' });
    const b = await f.seedWorkspace('m-b', { lead: 'owner', mover: 'member' });
    const c = await f.seedWorkspace('m-c', { lead: 'owner', mover: 'member' });
    await setJoinedAt(a.workspaceId, users.mover.id, '2026-01-01T00:00:00Z');
    await setJoinedAt(b.workspaceId, users.mover.id, '2026-02-01T00:00:00Z');
    await setJoinedAt(c.workspaceId, users.mover.id, '2026-03-01T00:00:00Z');
    await setDeleted(a.workspaceId, true);

    // The defect's reproduction 2: member of A (deleted, oldest), B and C
    // (live), active B, leave B.
    const { error: leaveError } = await clients.mover.rpc('bunkai_leave_workspace', { p_workspace_id: b.workspaceId });
    expect(leaveError).toBeNull();
    const params = { userId: users.mover.id, leftWorkspaceId: b.workspaceId, currentActiveId: b.workspaceId };

    // Without any filter, the oldest remaining active row is the deleted A.
    const { data: unfiltered } = await f.service()
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', users.mover.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });
    expect(unfiltered?.[0]?.workspace_id).toBe(a.workspaceId);

    expect((await resolveNewActiveWorkspace(asApp(clients.mover), params)).newActiveWorkspaceId).toBe(c.workspaceId);
    expect((await resolveNewActiveWorkspace(asApp(f.service()), params)).newActiveWorkspaceId).toBe(c.workspaceId);

    // Restore inside the grace: the untouched membership counts again and, as
    // the oldest, is the one picked.
    await setDeleted(a.workspaceId, false);

    const restored = await resolveNewActiveWorkspace(asApp(clients.mover), params);
    expect(restored.newActiveWorkspaceId).toBe(a.workspaceId);
    expect(restored.newActiveWorkspaceName).toBe(`${f.prefix} m-a`);
  }, 60_000);
});
