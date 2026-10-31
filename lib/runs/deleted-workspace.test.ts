import type { ApiError } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { isRunInDeletedWorkspaceOf, refuseIfRunWorkspaceDeleted } from './deleted-workspace';

// BK-1129 — the route-side discriminator for BK-512 Scenario N3. The real
// soft-delete is exercised against the database in
// `deleted-workspace-refusal.test.ts`; this suite pins every branch with the
// fake-chainable-`db` + throwing-`NEVER_DB` style of
// `app/api/v1/workspaces/[id]/membership/route.test.ts`.

const RUN = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const WS = '33333333-3333-3333-3333-333333333333';

const NEVER_DB = {
  from() { throw new Error('db must not be queried on this path'); },
} as unknown as SupabaseClient<Database>;

interface Row<T> { data: T | null, error: { message: string } | null }

// Each table answers one `.select().eq()...maybeSingle()` chain.
function fakeDb(rows: {
  run: Row<{ workspace_id: string }>
  workspace?: Row<{ deleted_at: string | null }>
  membership?: Row<{ user_id: string }>
}): SupabaseClient<Database> {
  const chain = (result: unknown) => {
    const c = {
      select: () => c,
      eq: () => c,
      maybeSingle: async () => result,
    };
    return c;
  };
  const byTable: Record<string, unknown> = {
    runs: rows.run,
    workspaces: rows.workspace,
    workspace_members: rows.membership,
  };
  return {
    from: (table: string) => {
      if (!(table in byTable) || byTable[table] === undefined) {
        throw new Error(`unexpected read of ${table}`);
      }
      return chain(byTable[table]);
    },
  } as unknown as SupabaseClient<Database>;
}

const ok = <T>(data: T): Row<T> => ({ data, error: null });
const NONE: Row<never> = { data: null, error: null };
const DELETED_AT = '2026-10-31T03:00:00Z';

describe('isRunInDeletedWorkspaceOf (BK-1129)', () => {
  it('is true for an active member of the Run\'s soft-deleted workspace', async () => {
    const db = fakeDb({ run: ok({ workspace_id: WS }), workspace: ok({ deleted_at: DELETED_AT }), membership: ok({ user_id: USER }) });
    expect(await isRunInDeletedWorkspaceOf(db, { runId: RUN, userId: USER })).toBe(true);
  });

  it('is false while the workspace is live (a refusal there is a plain non-member)', async () => {
    const db = fakeDb({ run: ok({ workspace_id: WS }), workspace: ok({ deleted_at: null }) });
    expect(await isRunInDeletedWorkspaceOf(db, { runId: RUN, userId: USER })).toBe(false);
  });

  it('is false for a stranger to the deleted workspace: nothing is disclosed', async () => {
    const db = fakeDb({ run: ok({ workspace_id: WS }), workspace: ok({ deleted_at: DELETED_AT }), membership: NONE });
    expect(await isRunInDeletedWorkspaceOf(db, { runId: RUN, userId: USER })).toBe(false);
  });

  it('is false for a missing Run', async () => {
    const db = fakeDb({ run: NONE });
    expect(await isRunInDeletedWorkspaceOf(db, { runId: RUN, userId: USER })).toBe(false);
  });

  it('fails silent to false on a read error, keeping the RPC\'s own refusal', async () => {
    const db = fakeDb({ run: { data: null, error: { message: 'boom' } } });
    expect(await isRunInDeletedWorkspaceOf(db, { runId: RUN, userId: USER })).toBe(false);
  });
});

describe('refuseIfRunWorkspaceDeleted (BK-1129)', () => {
  const deletedMemberDb = () => fakeDb({
    run: ok({ workspace_id: WS }),
    workspace: ok({ deleted_at: DELETED_AT }),
    membership: ok({ user_id: USER }),
  });

  for (const code of ['42501', 'P0002']) {
    it(`turns ${code} into a 404 not_found with reason workspace_deleted for a member`, async () => {
      try {
        await refuseIfRunWorkspaceDeleted(deletedMemberDb(), { error: { code }, runId: RUN, userId: USER });
        throw new Error('expected to throw');
      }
      catch (err) {
        expect((err as ApiError).code).toBe('not_found');
        expect((err as ApiError).status).toBe(404);
        expect((err as ApiError).message).toBe('This workspace was deleted.');
        expect((err as ApiError).details).toEqual({ reason: 'workspace_deleted' });
      }
    });
  }

  it('returns without throwing when the caller is not a member of the deleted workspace', async () => {
    const db = fakeDb({ run: ok({ workspace_id: WS }), workspace: ok({ deleted_at: DELETED_AT }), membership: NONE });
    await refuseIfRunWorkspaceDeleted(db, { error: { code: '42501' }, runId: RUN, userId: USER });
  });

  it('never looks anything up for a domain error such as a closed Run', async () => {
    await refuseIfRunWorkspaceDeleted(NEVER_DB, { error: { code: '45212' }, runId: RUN, userId: USER });
    await refuseIfRunWorkspaceDeleted(NEVER_DB, { error: {}, runId: RUN, userId: USER });
  });
});
