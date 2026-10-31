import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { isProjectInDeletedWorkspaceOf } from './deleted-project';

// BK-1129 — the project-layout discriminator for BK-512 Scenario N3 on a
// reload. The real soft-delete is exercised in
// `lib/runs/deleted-workspace-refusal.test.ts`; this pins every branch with a
// fake chainable client. Each table answers one chain, awaited at its end.

const USER = '22222222-2222-2222-2222-222222222222';
const WS = '33333333-3333-3333-3333-333333333333';

interface Result { data: unknown, error: { message: string } | null }

function fakeDb(byTable: Record<string, Result>): SupabaseClient<Database> {
  const chain = (result: Result) => {
    const c = {
      select: () => c,
      eq: () => c,
      in: () => c,
      not: () => c,
      limit: () => c,
      maybeSingle: async () => result,
      then: async (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return c;
  };
  return {
    from: (table: string) => {
      const result = byTable[table];
      if (!result) {
        throw new Error(`unexpected read of ${table}`);
      }
      return chain(result);
    },
  } as unknown as SupabaseClient<Database>;
}

const ok = (data: unknown): Result => ({ data, error: null });

describe('isProjectInDeletedWorkspaceOf (BK-1129)', () => {
  it('is true when the slug lives in a soft-deleted workspace the caller is a member of', async () => {
    const db = fakeDb({
      workspace_members: ok([{ workspace_id: WS }]),
      workspaces: ok([{ id: WS }]),
      projects: ok({ id: 'p1' }),
    });
    expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: 'checkout', userId: USER })).toBe(true);
  });

  it('is false when none of the caller\'s workspaces is deleted (a plain unknown slug)', async () => {
    const db = fakeDb({ workspace_members: ok([{ workspace_id: WS }]), workspaces: ok([]) });
    expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: 'checkout', userId: USER })).toBe(false);
  });

  it('is false when the slug is not in the caller\'s deleted workspace', async () => {
    const db = fakeDb({
      workspace_members: ok([{ workspace_id: WS }]),
      workspaces: ok([{ id: WS }]),
      projects: ok(null),
    });
    expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: 'checkout', userId: USER })).toBe(false);
  });

  it('is false for a caller with no memberships, without reading further', async () => {
    const db = fakeDb({ workspace_members: ok([]) });
    expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: 'checkout', userId: USER })).toBe(false);
  });

  it('fails silent to false on a read error', async () => {
    const db = fakeDb({ workspace_members: { data: null, error: { message: 'boom' } } });
    expect(await isProjectInDeletedWorkspaceOf(db, { projectSlug: 'checkout', userId: USER })).toBe(false);
  });
});
