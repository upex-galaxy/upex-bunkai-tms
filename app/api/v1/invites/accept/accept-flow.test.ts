import type { Capability } from '@lib/api/capabilities';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST: ACCEPT } = await import('./route');
const { POST: ISSUE } = await import('@app/api/v1/workspaces/[id]/invites/route');
const { DELETE: REVOKE, POST: RESEND } = await import('@app/api/v1/workspaces/[id]/invites/[inviteId]/route');
const { mintPat } = await import('@lib/api/pat');
const { createMembershipFixture, hasLockEnv } = await import('@lib/workspaces/membership-lock-test-support');

// BK-1589 — the invite flow end to end through the real handlers, real Bearer PATs
// and the real database: what only the routes own. The token hash and the email
// gate stand in front of a service-role RPC, so a test has to reach them on the
// wire. The RPC's own refusals are in lib/workspaces/invite-accept-isolation.test.ts.
//
// FAIL-CLOSED GATE. Skipped, with a loud warning, only with no database environment.
// Before migration 0118 the accept calls fail here: that is the file doing its job.

if (!hasLockEnv) {
  console.warn('[accept-flow] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasLockEnv ? describe : describe.skip;

const PERSONAS = ['owner', 'admin', 'invitee', 'stranger'] as const;
type Persona = typeof PERSONAS[number];
const f = createMembershipFixture('bk1589-flow', PERSONAS);
const { users } = f;
const tokenIds: string[] = [];

function call(method: string, path: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`https://app.test/api/v1/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function pat(persona: Persona, workspaceId: string | null, scopes: Capability[]): Promise<string> {
  const minted = await mintPat({ admin: f.service(), userId: users[persona].id, workspaceId, name: `${f.prefix}-${persona}-${tokenIds.length}`, scopes });
  tokenIds.push(minted.id);
  return minted.token;
}

async function issue(workspaceId: string, persona: Persona, role = 'member') {
  const token = await pat(persona, workspaceId, ['workspace:admin']);
  const res = await ISSUE(call('POST', `workspaces/${workspaceId}/invites`, token, { email: users.invitee.email, role }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { inviteId: body.invite.id as string, inviteToken: body.token as string, adminToken: token };
}

async function acceptAs(persona: Persona, inviteToken: string) {
  const res = await ACCEPT(call('POST', 'invites/accept', await pat(persona, null, ['atc:read']), { token: inviteToken }));
  return { status: res.status, body: await res.json() };
}

describeOrSkip('BK-1589 — POST /api/v1/invites/accept through the real handlers', () => {
  beforeAll(f.setup, 120_000);
  afterAll(async () => {
    const db = f.service();
    for (const id of tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
    }
    await f.teardown();
  }, 120_000);

  it('a PAT caller redeems an invite issued through the shipped route (AC-4.4, column grants intact)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('happy', { owner: 'owner', admin: 'admin' });
    const { inviteToken } = await issue(seed.workspaceId, 'admin', 'admin');

    const answer = await acceptAs('invitee', inviteToken);
    expect(answer).toEqual({ status: 200, body: { ok: true, workspace_id: seed.workspaceId, role: 'admin' } });
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: 'admin', status: 'active' });
  }, 60_000);

  it('an invite for someone else is refused at the email gate, before the RPC', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('email-gate', { owner: 'owner', admin: 'admin' });
    const { inviteToken } = await issue(seed.workspaceId, 'admin');

    const answer = await acceptAs('stranger', inviteToken);
    expect(answer.status).toBe(403);
    expect(answer.body.error.code).toBe('forbidden');
    expect(await f.memberRow(seed.workspaceId, 'stranger')).toBeNull();
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('a token that never existed is the 404, and a removed inviter is the neutral 409 (AC-4.1)', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('removed', { owner: 'owner', admin: 'admin' });
    const { inviteToken } = await issue(seed.workspaceId, 'admin', 'admin');
    expect((await acceptAs('invitee', 'never-issued-token')).status).toBe(404);

    expect((await f.clients.owner.rpc('bunkai_remove_workspace_member', { p_workspace_id: seed.workspaceId, p_user_id: users.admin.id })).error).toBeNull();

    const refused = await acceptAs('invitee', inviteToken);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'conflict', message: 'This invite can no longer be used. Ask a workspace Admin for a new one.', details: { reason: 'inviter_not_authorized' } });
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toBeNull();
  }, 60_000);

  it('resending that invite gives the Admin a link that works, and revoking it still works', async () => {
    expect.hasAssertions();
    const seed = await f.seedWorkspace('resend', { owner: 'owner', admin: 'admin' });
    const { inviteId, inviteToken } = await issue(seed.workspaceId, 'admin');
    expect((await f.clients.owner.rpc('bunkai_remove_workspace_member', { p_workspace_id: seed.workspaceId, p_user_id: users.admin.id })).error).toBeNull();
    expect((await acceptAs('invitee', inviteToken)).status).toBe(409);

    const ownerToken = await pat('owner', seed.workspaceId, ['workspace:admin']);
    const resent = await RESEND(call('POST', `workspaces/${seed.workspaceId}/invites/${inviteId}`, ownerToken));
    expect(resent.status).toBe(200);
    const { token: freshToken } = await resent.json();
    const { data: stamped } = await f.service().from('workspace_invites').select('invited_by_user_id').eq('id', inviteId).single();
    expect(stamped?.invited_by_user_id).toBe(users.owner.id);

    expect((await acceptAs('invitee', freshToken as string)).status).toBe(200);
    expect(await f.memberRow(seed.workspaceId, 'invitee')).toEqual({ role: 'member', status: 'active' });

    const other = await f.seedWorkspace('revoke', { owner: 'owner' });
    const issued = await issue(other.workspaceId, 'owner');
    const revoked = await REVOKE(call('DELETE', `workspaces/${other.workspaceId}/invites/${issued.inviteId}`, issued.adminToken));
    expect(revoked.ok).toBe(true);
    const refused = await acceptAs('invitee', issued.inviteToken);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'conflict', message: 'Invite has been revoked.' });
  }, 90_000);
});
