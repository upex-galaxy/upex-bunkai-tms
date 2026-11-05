import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, mock } from 'bun:test';

// BK-988 — AC-14 of BK-512: an invite to a deleted workspace must be refused
// with EXACTLY the shape a token that never existed gets (status + body).
// Exercises the route's extracted DB-parametrized resolver with a fake `db`,
// then serializes each thrown ApiError through the real `errorResponse` so the
// comparison is on the wire shape, not on object identity.
void mock.module('server-only', () => ({}));
const { resolveRedeemableInvite } = await import('./route');
const { ApiError, errorResponse } = await import('@lib/api/error-envelope');
const { INVITER_NOT_AUTHORIZED_MESSAGE, mapAcceptInviteError, redeemInvite } = await import('./response');

const INVITE_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

interface InviteRow {
  id: string
  workspace_id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

interface Fixture {
  secret: { invite_id: string } | null
  invite: InviteRow | null
  workspace: { deleted_at: string | null } | null
}

interface EqCall { table: string, column: string, value: unknown }

// Minimal `.from(t).select().eq().maybeSingle()` chain keyed by table name.
// The `workspaces` row is only returned when the lookup is keyed by the
// invite's OWN workspace_id (`.eq('id', invite.workspace_id)`); any other key
// resolves to no row, so a mis-keyed liveness check cannot pass the live-
// workspace cases by accident. Every `.eq()` is recorded in `calls`.
function fakeDb(f: Fixture, calls: EqCall[] = []): SupabaseClient<Database> {
  const rows: Record<string, unknown> = {
    workspace_invite_secrets: f.secret,
    workspace_invites: f.invite,
    workspaces: f.workspace,
  };
  return {
    from: (table: string) => {
      const mine: EqCall[] = [];
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          const call = { table, column, value };
          mine.push(call);
          calls.push(call);
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'workspaces') {
            const keyedByInviteWorkspace = mine.length === 1
              && mine[0].column === 'id'
              && mine[0].value === f.invite?.workspace_id;
            return { data: keyedByInviteWorkspace ? f.workspace : null, error: null };
          }
          return { data: rows[table] ?? null, error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

function invite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: INVITE_ID,
    workspace_id: WORKSPACE_ID,
    email: 'invitee@example.com',
    role: 'member',
    expires_at: FUTURE,
    accepted_at: null,
    revoked_at: null,
    ...overrides,
  };
}

async function wireShape(db: SupabaseClient<Database>) {
  try {
    await resolveRedeemableInvite(db, 'hash');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    const res = errorResponse(err as InstanceType<typeof ApiError>);
    return { status: res.status, body: await res.json() };
  }
  throw new Error('expected an ApiError but none was thrown');
}

const neverExisted = async () => wireShape(fakeDb({ secret: null, invite: null, workspace: null }));

describe('resolveRedeemableInvite — AC-14 non-disclosure (BK-988)', () => {
  it('a token that never existed is a 404 not_found', async () => {
    const shape = await neverExisted();
    expect(shape).toEqual({ status: 404, body: { error: { code: 'not_found', message: 'Invite token is invalid.' } } });
  });

  it('the BK-988 repro: a revoked invite to a soft-deleted workspace matches the never-existed shape exactly', async () => {
    const deleted = await wireShape(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite({ revoked_at: PAST }),
      workspace: { deleted_at: PAST },
    }));
    expect(deleted).toEqual(await neverExisted());
  });

  it.each([
    ['accepted', { accepted_at: PAST }],
    ['expired', { expires_at: PAST }],
    ['still pending (lost the deletion race)', {}],
  ])('a %s invite to a soft-deleted workspace matches the never-existed shape', async (_label, overrides) => {
    const deleted = await wireShape(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite(overrides),
      workspace: { deleted_at: PAST },
    }));
    expect(deleted).toEqual(await neverExisted());
  });

  it('an invite whose workspace row is gone (purged) matches the never-existed shape', async () => {
    const purged = await wireShape(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite({ revoked_at: PAST }),
      workspace: null,
    }));
    expect(purged).toEqual(await neverExisted());
  });

  it('a revoked invite to a LIVE workspace keeps its specific 409 (unchanged behaviour)', async () => {
    const live = await wireShape(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite({ revoked_at: PAST }),
      workspace: { deleted_at: null },
    }));
    expect(live).toEqual({ status: 409, body: { error: { code: 'conflict', message: 'Invite has been revoked.' } } });
  });

  it('a valid pending invite to a live workspace resolves, and liveness is looked up by the invite\'s own workspace_id', async () => {
    const calls: EqCall[] = [];
    const result = await resolveRedeemableInvite(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite(),
      workspace: { deleted_at: null },
    }, calls), 'hash');
    expect(result).toEqual({ id: INVITE_ID, workspace_id: WORKSPACE_ID, email: 'invitee@example.com', role: 'member' });
    expect(calls.filter(c => c.table === 'workspaces')).toEqual([{ table: 'workspaces', column: 'id', value: WORKSPACE_ID }]);
  });
});

// BK-1589 — what the RPC's refusals look like on the wire. The refusals themselves
// are proven against the real database in lib/workspaces/invite-accept-isolation.test.ts.
describe('redeemInvite — the accept RPC behind the route (BK-1589)', () => {
  function fakeAdmin(answer: { data?: unknown, error?: { code: string, message: string } }, calls: unknown[] = []): SupabaseClient<Database> {
    return {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: answer.data ?? null, error: answer.error ?? null };
      },
    } as unknown as SupabaseClient<Database>;
  }

  async function refusal(error: { code: string, message: string }) {
    try {
      await redeemInvite(fakeAdmin({ error }), { inviteId: INVITE_ID, userId: 'user' });
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const res = errorResponse(err as InstanceType<typeof ApiError>);
      return { status: res.status, body: await res.json() };
    }
    throw new Error('expected an ApiError but none was thrown');
  }

  it('sends the invite and the caller to the RPC and returns what it redeemed', async () => {
    const calls: unknown[] = [];
    const redeemed = await redeemInvite(fakeAdmin({ data: { workspace_id: WORKSPACE_ID, role: 'admin' } }, calls), { inviteId: INVITE_ID, userId: 'user' });
    expect(redeemed).toEqual({ workspace_id: WORKSPACE_ID, role: 'admin' });
    expect(calls).toEqual([{ name: 'bunkai_accept_workspace_invite', args: { p_invite_id: INVITE_ID, p_user_id: 'user' } }]);
  });

  it('an inviter who lost the authority is a 409 with the neutral message (AC-4.1, AC-4.2, AC-4.5)', async () => {
    expect(await refusal({ code: '45222', message: 'inviter_not_authorized' })).toEqual({
      status: 409,
      body: { error: { code: 'conflict', message: INVITER_NOT_AUTHORIZED_MESSAGE, details: { reason: 'inviter_not_authorized' } } },
    });
    expect(INVITER_NOT_AUTHORIZED_MESSAGE).toBe('This invite can no longer be used. Ask a workspace Admin for a new one.');
  });

  it('a role that rose after the early check is the same refusal BK-62 gives (AC-4.6)', async () => {
    const shape = await refusal({ code: '45223', message: 'already_member_equal_or_higher_role' });
    expect(shape.status).toBe(409);
    expect(shape.body.error.details).toEqual({ reason: 'already_member_equal_or_higher_role' });
  });

  it.each([
    ['invite_revoked', 'Invite has been revoked.'],
    ['invite_already_accepted', 'Invite has already been accepted.'],
    ['invite_expired', 'Invite has expired.'],
  ])('%s under the lock keeps the message the early check gives', async (message, expected) => {
    expect(await refusal({ code: '45224', message })).toEqual({ status: 409, body: { error: { code: 'conflict', message: expected } } });
  });

  it('a workspace deleted mid-flight matches the never-existed shape exactly (BK-988)', async () => {
    expect(await refusal({ code: 'P0002', message: 'invite_not_found' })).toEqual(await neverExisted());
  });

  it('anything else is an internal error, never a quiet success', () => {
    expect(() => mapAcceptInviteError({ code: '42501', message: 'permission denied' })).toThrow(ApiError);
  });
});
