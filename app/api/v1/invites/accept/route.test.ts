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

// Minimal `.from(t).select().eq().maybeSingle()` chain keyed by table name.
function fakeDb(f: Fixture): SupabaseClient<Database> {
  const rows: Record<string, unknown> = {
    workspace_invite_secrets: f.secret,
    workspace_invites: f.invite,
    workspaces: f.workspace,
  };
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
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

  it('a valid pending invite to a live workspace resolves', async () => {
    const result = await resolveRedeemableInvite(fakeDb({
      secret: { invite_id: INVITE_ID },
      invite: invite(),
      workspace: { deleted_at: null },
    }), 'hash');
    expect(result).toEqual({ id: INVITE_ID, workspace_id: WORKSPACE_ID, email: 'invitee@example.com', role: 'member' });
  });
});
