import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createMembershipFixture, expectEveryCallBlocked, hasLockEnv, overlapHolding, overlapOnMemberRow, pgUrl, withLocklessCopy } from './membership-lock-test-support';

// BK-1589 G4/G5 — bunkai_accept_workspace_invite against the REAL database
// (migration 0118): the inviter is re-validated under lock and fails closed
// (AC-4), the BK-62 never-demote rule holds, and the grant keeps every user
// session out. It is called through the service client, its only shipped caller.
//
// Each lock proof has a mutation test beside it. A new function has no lock-less
// live version to go red against, so those tests recreate it in pg_temp with one
// lock clause deleted (session-local, gone with the connection, nothing persists
// in the schema) and show the same scenario then lets the member in.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only when there is no database
// environment or the function is not deployed (42883 / PGRST202). Any other
// probe answer fails the file.

const RPC = 'bunkai_accept_workspace_invite';
const ACCEPT = 'public.bunkai_accept_workspace_invite(uuid,uuid)';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const PERSONAS = ['owner', 'admin', 'admin2', 'invitee', 'bootstrapper'] as const;
type Persona = typeof PERSONAS[number];
const f = createMembershipFixture('bk1589-accept', PERSONAS);
const { users, clients } = f;

let deployed = false;
if (hasLockEnv) {
  const probe = await f.service().rpc(RPC, { p_invite_id: ZERO_UUID, p_user_id: ZERO_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[invite-accept-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}). Apply migration 0118_member_write_paths_locked.sql.`);
  }
  else {
    throw new Error(`[invite-accept-isolation] unexpected probe answer (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
else {
  console.warn('[invite-accept-isolation] SKIPPED ENTIRELY: no database environment. Nothing here is evidence about the function.');
}
const describeOrSkip = hasLockEnv && deployed ? describe : describe.skip;

async function seedInvite(workspaceId: string, args: { role: string, invitedBy: Persona | null, expiresAt?: string }): Promise<string> {
  const row = f.must(await f.service().from('workspace_invites').insert({
    workspace_id: workspaceId,
    email: users.invitee.email,
    role: args.role,
    invited_by_user_id: args.invitedBy ? users[args.invitedBy].id : null,
    ...(args.expiresAt ? { expires_at: args.expiresAt } : {}),
  }).select('id').single(), `invite ${args.role}`);
  return row.id;
}

function accept(inviteId: string, persona: Persona = 'invitee') {
  return f.service().rpc(RPC, { p_invite_id: inviteId, p_user_id: users[persona].id });
}

function remove(caller: Persona, workspaceId: string, target: string) {
  return clients[caller].rpc('bunkai_remove_workspace_member', { p_workspace_id: workspaceId, p_user_id: target });
}

async function inviteRow(inviteId: string) {
  return f.must(await f.service().from('workspace_invites').select('accepted_at, accepted_by_user_id, revoked_at').eq('id', inviteId).single(), 'invite read-back');
}

describeOrSkip('BK-1589 — invite accept re-validates the inviter under lock (AC-4, real database)', () => {
  beforeAll(f.setup, 120_000);
  afterAll(f.teardown, 120_000);

  it('a pending admin invite whose inviter was removed is refused, writes nothing and stays revocable (AC-4.1)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('removed', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'admin', invitedBy: 'admin' });
    expect((await remove('owner', seed.workspaceId, users.admin.id)).error).toBeNull();

    const answer = await accept(invite);
    expect(answer.error?.code).toBe('45222');
    expect(answer.error?.message).toBe('inviter_not_authorized');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
    expect(await inviteRow(invite)).toEqual({ accepted_at: null, accepted_by_user_id: null, revoked_at: null });
  }, 60_000);

  it.each([
    ['member', 'admin'],
    ['member', 'member'],
    ['viewer', 'viewer'],
  ])('an inviter demoted to %s cannot bring in a %s (AC-4.2)', async (demotedTo, invited) => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace(`demoted-${demotedTo}-${invited}`, { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: invited, invitedBy: 'admin' });
    await f.service().from('workspace_members').update({ role: demotedTo }).eq('workspace_id', seed.workspaceId).eq('user_id', users.admin.id);

    expect((await accept(invite)).error?.code).toBe('45222');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('an inviter whose membership is no longer active cannot bring anyone in (AC-4.2)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('suspended', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'viewer', invitedBy: 'admin' });
    await f.service().from('workspace_members').update({ status: 'suspended' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.admin.id);

    expect((await accept(invite)).error?.code).toBe('45222');
  }, 60_000);

  it('a null inviter fails closed (AC-4.5)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('null-inviter', { owner: 'owner' });
    const invite = await seedInvite(seed.workspaceId, { role: 'viewer', invitedBy: null });

    expect((await accept(invite)).error?.code).toBe('45222');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('an inviter removed while the accept is in flight: it waits, then is refused, never a membership (AC-4.3)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('in-flight', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results: [removal, answer] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.admin.id },
      [() => remove('owner', seed.workspaceId, users.admin.id), () => accept(invite)],
    );

    expectEveryCallBlocked(blocked);
    expect(removal.error).toBeNull();
    expect(answer.error?.code).toBe('45222');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
    expect((await inviteRow(invite)).accepted_at).toBeNull();
  }, 60_000);

  it('with the member lock clause deleted the same scenario does not wait and lets the member in (G5, AC-4.3)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('mutant-member', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked } = await withLocklessCopy(
      { signature: ACCEPT, clause: /order by wm\.user_id\s+for update/, unlocked: 'order by wm.user_id', tempName: 'accept_without_member_lock' },
      async session => overlapOnMemberRow(
        { workspaceId: seed.workspaceId, userId: users.admin.id },
        [async () => session.unsafe('select pg_temp.accept_without_member_lock($1::uuid, $2::uuid)', [invite, users.invitee.id])],
        async () => {
          // The row is still held, and the member is already in.
          expect(await f.memberRow(seed.workspaceId, 'invitee')).not.toBeNull();
        },
      ),
    );
    // Red for the test above: nothing queued behind the held inviter row.
    expect(blocked).toEqual([0]);
  }, 60_000);

  it('a workspace being deleted: accept waits on it, then answers the never-existed refusal', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('ws-lock', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results: [answer] } = await overlapHolding(
      {
        hold: async holder => holder`update public.workspaces set deleted_at = now() where id = ${seed.workspaceId}::uuid returning 1`,
        release: 'commit',
      },
      [() => accept(invite)],
    );

    expectEveryCallBlocked(blocked);
    expect(answer.error?.code).toBe('P0002');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('with the workspace lock clause deleted the member joins a workspace being deleted (G5)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('ws-lock-mutant', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked } = await withLocklessCopy(
      { signature: ACCEPT, clause: /where w\.id = v_workspace_id\s+for share/, unlocked: 'where w.id = v_workspace_id', tempName: 'accept_without_workspace_lock' },
      async session => overlapHolding(
        {
          hold: async holder => holder`update public.workspaces set deleted_at = now() where id = ${seed.workspaceId}::uuid returning 1`,
          release: 'commit',
        },
        [async () => session.unsafe('select pg_temp.accept_without_workspace_lock($1::uuid, $2::uuid)', [invite, users.invitee.id])],
      ),
    );
    expect(blocked).toEqual([0]);
    expect(await f.memberRow(seed.workspaceId, 'invitee')).not.toBeNull();
  }, 60_000);

  it('an invite being revoked: accept waits on its row, then is refused as revoked', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('invite-lock', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results: [answer] } = await overlapHolding(
      {
        hold: async holder => holder`update public.workspace_invites set revoked_at = now() where id = ${invite}::uuid returning 1`,
        release: 'commit',
      },
      [() => accept(invite)],
    );

    expectEveryCallBlocked(blocked);
    expect(answer.error?.code).toBe('45224');
    expect(answer.error?.message).toBe('invite_revoked');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('with the invite lock clause deleted a revoked invite still lets the member in (G5)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('invite-lock-mutant', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    await withLocklessCopy(
      { signature: ACCEPT, clause: /where i\.id = p_invite_id\s+for update/, unlocked: 'where i.id = p_invite_id', tempName: 'accept_without_invite_lock' },
      async session => overlapHolding(
        {
          hold: async holder => holder`update public.workspace_invites set revoked_at = now() where id = ${invite}::uuid returning 1`,
          release: 'commit',
        },
        [async () => session.unsafe('select pg_temp.accept_without_invite_lock($1::uuid, $2::uuid)', [invite, users.invitee.id])],
      ),
    );
    // Red for the test above. It still waits, on its own stamp, so the answer is
    // what convicts it.
    expect(await f.memberRow(seed.workspaceId, 'invitee')).not.toBeNull();
  }, 60_000);

  it('an invite resent during the wait is refused: the row locked is no longer its inviter\'s', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('restamped', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results: [answer] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.admin.id },
      [() => accept(invite)],
      async () => {
        await f.service().from('workspace_invites').update({ invited_by_user_id: users.owner.id }).eq('id', invite);
      },
    );

    expectEveryCallBlocked(blocked);
    expect(answer.error?.code).toBe('45222');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
    // The retry has the new inviter's row to lock.
    expect((await accept(invite)).error).toBeNull();
  }, 60_000);

  it('a removed Admin cannot have forged the invite: issuer, addressee and role are out of a session\'s reach (G4)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('forge', { owner: 'owner', admin: 'admin' });
    const own = await seedInvite(seed.workspaceId, { role: 'admin', invitedBy: 'admin' });
    const ownersInvite = await seedInvite(seed.workspaceId, { role: 'viewer', invitedBy: 'owner' });
    const invites = () => clients.admin.from('workspace_invites');

    expect((await invites().update({ invited_by_user_id: users.owner.id }).eq('id', own)).error?.code).toBe('42501');
    expect((await invites().update({ email: 'alt@example.test' }).eq('id', ownersInvite)).error?.code).toBe('42501');
    expect((await invites().update({ role: 'admin' }).eq('id', ownersInvite)).error?.code).toBe('42501');
    expect((await invites().update({ workspace_id: seed.workspaceId }).eq('id', ownersInvite)).error?.code).toBe('42501');
    // A brand-new invite must name its real issuer.
    const forged = await invites().insert({ workspace_id: seed.workspaceId, email: `${f.prefix}-forged@example.test`, role: 'admin', invited_by_user_id: users.owner.id });
    expect(forged.error?.code).toBe('42501');

    // So the removal really does end what that Admin issued.
    expect((await remove('owner', seed.workspaceId, users.admin.id)).error).toBeNull();
    expect((await accept(own)).error?.code).toBe('45222');
    const { data } = await f.service().from('workspace_invites').select('invited_by_user_id, role').eq('id', ownersInvite).single();
    expect(data).toEqual({ invited_by_user_id: users.owner.id, role: 'viewer' });
  }, 60_000);

  it('a soft-deleted workspace mid-flight answers the never-existed refusal and writes nothing', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('deleted-mid-flight', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results: [answer] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.admin.id },
      [() => accept(invite)],
      async () => {
        await f.service().from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', seed.workspaceId);
      },
    );

    expectEveryCallBlocked(blocked);
    expect(answer.error?.code).toBe('P0002');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('an invite revoked during the wait is refused as revoked', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('revoked-mid-flight', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { results: [answer] } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.admin.id },
      [() => accept(invite)],
      async () => {
        await f.service().from('workspace_invites').update({ revoked_at: new Date().toISOString() }).eq('id', invite);
      },
    );

    expect(answer.error?.code).toBe('45224');
    expect(answer.error?.message).toBe('invite_revoked');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('two accepts of one invite: exactly one wins and it is stamped once', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('double', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });

    const { blocked, results } = await overlapOnMemberRow(
      { workspaceId: seed.workspaceId, userId: users.admin.id },
      [() => accept(invite), () => accept(invite)],
    );

    expectEveryCallBlocked(blocked);
    expect(results.map(r => r.error?.code ?? 'ok').sort()).toEqual(['45224', 'ok']);
    expect(results.find(r => r.error)?.error?.message).toBe('invite_already_accepted');
    expect((await inviteRow(invite)).accepted_by_user_id).toBe(users.invitee.id);
  }, 60_000);

  it.each([
    ['admin', 'admin'],
    ['admin', 'viewer'],
    ['owner', 'admin'],
  ] as const)('an active %s inviter brings in a %s: accepted once, row active (AC-4.4, rank equality included)', async (inviter, invited) => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace(`happy-${inviter}-${invited}`, { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: invited, invitedBy: inviter });

    const answer = await accept(invite);
    expect(answer.error).toBeNull();
    expect(answer.data).toEqual({ workspace_id: seed.workspaceId, role: invited });
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: invited, status: 'active' });
    const stamped = await inviteRow(invite);
    expect(stamped.accepted_by_user_id).toBe(users.invitee.id);
    expect(stamped.accepted_at).not.toBeNull();

    const again = await accept(invite);
    expect(again.error?.code).toBe('45224');
    expect(again.error?.message).toBe('invite_already_accepted');
    expect((await inviteRow(invite)).accepted_at).toBe(stamped.accepted_at);
  }, 60_000);

  it('an invitee with an equal or higher role keeps it and gets the BK-62 refusal (AC-4.6)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('never-demote', { owner: 'owner', admin: 'admin', invitee: 'admin' });
    for (const role of ['admin', 'member']) {
      const invite = await seedInvite(seed.workspaceId, { role, invitedBy: 'admin' });
      const answer = await accept(invite);
      expect(answer.error?.code).toBe('45223');
      expect(answer.error?.message).toBe('already_member_equal_or_higher_role');
      expect((await inviteRow(invite)).accepted_at).toBeNull();
    }
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: 'admin', status: 'active' });
  }, 60_000);

  it('the BK-62 refusal answers first when the inviter also lost the authority (AC-4.6, check order)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('both-refusals', { owner: 'owner', admin: 'admin', invitee: 'member' });
    const invite = await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' });
    expect((await remove('owner', seed.workspaceId, users.admin.id)).error).toBeNull();

    expect((await accept(invite)).error?.code).toBe('45223');
  }, 60_000);

  it('a higher invite promotes, and a non-active row is activated with the invite\'s role', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('promote', { owner: 'owner', admin: 'admin', invitee: 'viewer' });
    expect((await accept(await seedInvite(seed.workspaceId, { role: 'member', invitedBy: 'admin' }))).error).toBeNull();
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: 'member', status: 'active' });

    await f.service().from('workspace_members').update({ status: 'suspended', role: 'admin' }).eq('workspace_id', seed.workspaceId).eq('user_id', users.invitee.id);
    expect((await accept(await seedInvite(seed.workspaceId, { role: 'viewer', invitedBy: 'admin' }))).error).toBeNull();
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: 'viewer', status: 'active' });
  }, 60_000);

  it('expired and unknown invites are refused, and a deleted workspace looks like an unknown invite', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('states', { owner: 'owner', admin: 'admin' });
    const expired = await seedInvite(seed.workspaceId, { role: 'viewer', invitedBy: 'admin', expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const answer = await accept(expired);
    expect(answer.error?.code).toBe('45224');
    expect(answer.error?.message).toBe('invite_expired');

    const unknown = await accept(crypto.randomUUID());
    expect(unknown.error?.code).toBe('P0002');

    const gone = await f.seedWorkspace('states-deleted', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(gone.workspaceId, { role: 'viewer', invitedBy: 'admin' });
    await f.service().from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', gone.workspaceId);
    const deleted = await accept(invite);
    expect(deleted.error?.code).toBe(unknown.error?.code);
    expect(deleted.error?.message).toBe(unknown.error?.message);
  }, 60_000);

  it('no user session can reach the RPC: only the service role holds EXECUTE (ADR-0012)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('grant', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'admin', invitedBy: 'admin' });

    // Past the route's email gate this is how a stranger would join: refused.
    const attempt = await clients.owner.rpc(RPC, { p_invite_id: invite, p_user_id: users.owner.id });
    expect(attempt.error?.code).toBe('42501');
    const asInvitee = await clients.invitee.rpc(RPC, { p_invite_id: invite, p_user_id: users.invitee.id });
    expect(asInvitee.error?.code).toBe('42501');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();

    const sql = new SQL(pgUrl!);
    try {
      const fn = 'public.bunkai_accept_workspace_invite(uuid,uuid)';
      const [row] = await sql`
        select has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
               has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authenticated,
               has_function_privilege('service_role', ${fn}, 'EXECUTE') as service_role,
               has_function_privilege('qa_inspector_ro', ${fn}, 'EXECUTE') as qa_ro,
               has_function_privilege('qa_inspector_rw', ${fn}, 'EXECUTE') as qa_rw`;
      expect({ ...row }).toEqual({ anon: false, authenticated: false, service_role: true, qa_ro: false, qa_rw: false });
    }
    finally {
      await sql.close();
    }
  }, 60_000);

  it('the actor bind refuses a session that is not the user named, before anything is read (ADR-0012)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('actor-bind', { owner: 'owner', admin: 'admin' });
    const invite = await seedInvite(seed.workspaceId, { role: 'admin', invitedBy: 'admin' });

    const sql = new SQL(pgUrl!);
    let raised = '';
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: users.owner.id, role: 'authenticated' })}, true)`;
        await tx`select public.bunkai_accept_workspace_invite(${invite}::uuid, ${users.invitee.id}::uuid)`;
      });
    }
    catch (error) {
      raised = (error as Error).message;
    }
    finally {
      await sql.close();
    }
    expect(raised).toBe('invite_not_found');
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('bootstrap still creates a workspace with its Owner through a user session (AC-1.4)', async () => {
    expect.hasAssertions();
    const slug = `bk1589-boot-${Date.now()}`;
    const { data, error } = await clients.bootstrapper.rpc('bunkai_bootstrap_workspace', { p_name: `${f.prefix} bootstrap`, p_slug: slug });
    expect(error).toBeNull();
    f.trackWorkspace(data as string);
    expect(await f.memberRow(data as string, 'bootstrapper')).toEqual({ role: 'owner', status: 'active' });
  }, 60_000);
});
