import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { hasLiveMembership } from './live-membership';

// BK-1903 — the onboarding page's redirect decision. Fake-chainable `db`, same
// style as `workspaces/[id]/membership/route.test.ts`; the behaviour against
// the real database (deleted, then restored, workspace) is covered by
// `lib/workspaces/live-workspace-reads-isolation.test.ts`.

const USER = '22222222-2222-2222-2222-222222222222';

interface MembershipsResult { data: { workspace_id: string }[] | null, error: { message: string } | null }

// Stand-in for db.from('workspace_members').select().eq().eq().is().limit(),
// recording every step so the query shape can be asserted.
function fakeDb(result: MembershipsResult, calls: unknown[][] = []): SupabaseClient<Database> {
  const chain = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return chain; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return chain; },
    is: (...args: unknown[]) => { calls.push(['is', ...args]); return chain; },
    limit: async (...args: unknown[]) => { calls.push(['limit', ...args]); return result; },
  };
  return {
    from: (table: string) => { calls.push(['from', table]); return chain; },
  } as unknown as SupabaseClient<Database>;
}

describe('hasLiveMembership (BK-1903)', () => {
  it('asks only for active memberships in LIVE workspaces (inner join on workspaces, deleted_at is null)', async () => {
    const calls: unknown[][] = [];

    await hasLiveMembership(fakeDb({ data: [], error: null }, calls), USER);

    expect(calls).toEqual([
      ['from', 'workspace_members'],
      ['select', 'workspace_id, workspaces!inner(deleted_at)'],
      ['eq', 'user_id', USER],
      ['eq', 'status', 'active'],
      ['is', 'workspaces.deleted_at', null],
      ['limit', 1],
    ]);
  });

  it('is true when a live membership exists, so the page redirects to /projects', async () => {
    const db = fakeDb({ data: [{ workspace_id: '11111111-1111-1111-1111-111111111111' }], error: null });

    expect(await hasLiveMembership(db, USER)).toBe(true);
  });

  it('is false when no live membership exists (only deleted ones), so the page shows the onboarding form', async () => {
    expect(await hasLiveMembership(fakeDb({ data: [], error: null }), USER)).toBe(false);
  });

  it('is false when the query fails, keeping the page\'s previous behaviour of showing the form', async () => {
    expect(await hasLiveMembership(fakeDb({ data: null, error: { message: 'connection reset' } }), USER)).toBe(false);
  });
});
