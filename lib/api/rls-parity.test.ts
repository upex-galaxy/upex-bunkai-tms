import { mintUserJwt } from '@lib/api/user-jwt';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// Cross-tenant isolation regression guard for ADR-0001 Path B (the impersonating
// client). It exercises the REAL code path — a user-scoped JWT minted exactly as
// resolveIdentity() does it, attached to an anon Supabase client — and asserts
// RLS scopes it to the caller's own rows.
//
// DB-dependent: it self-discovers two users with disjoint workspace membership.
// When the Supabase env is absent (CI without DB creds) the suite SKIPS rather
// than fails. When present but the data preconditions can't be met it logs and
// passes (nothing to assert), so it never blocks a build on seed state.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && anonKey && serviceKey && jwtSecret);

const describeOrSkip = hasEnv ? describe : describe.skip;

function impersonating(token: string) {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describeOrSkip('ADR-0001 Path B — impersonating client respects RLS', () => {
  it('scopes a PAT-impersonated user to its own workspaces and leaks none', async () => {
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });

    const { data: members, error } = await service
      .from('workspace_members')
      .select('user_id, workspace_id');
    if (error) { throw error; }

    const byUser = new Map<string, Set<string>>();
    for (const m of (members ?? []) as Array<{ user_id: string, workspace_id: string }>) {
      if (!byUser.has(m.user_id)) { byUser.set(m.user_id, new Set()); }
      byUser.get(m.user_id)!.add(m.workspace_id);
    }

    // Find a user A and a workspace that A is NOT a member of (owned by some B).
    const users = [...byUser.keys()];
    const allWorkspaces = new Set<string>((members ?? []).map((m: { workspace_id: string }) => m.workspace_id));
    let userA: string | undefined;
    let foreignWs: string | undefined;
    for (const u of users) {
      const mine = byUser.get(u)!;
      const foreign = [...allWorkspaces].find(w => !mine.has(w));
      if (foreign) { userA = u; foreignWs = foreign; break; }
    }

    if (!userA || !foreignWs) {
      console.warn('[rls-parity] skipped: need a user with at least one non-member workspace (seed state).');
      return;
    }

    const ownWorkspaces = byUser.get(userA)!;
    const token = await mintUserJwt(userA, jwtSecret!);
    const { data: seen, error: seenError } = await impersonating(token).from('workspaces').select('id');
    if (seenError) { throw seenError; }
    const seenIds = new Set((seen ?? []).map((r: { id: string }) => r.id));

    // Sees every workspace it belongs to…
    for (const w of ownWorkspaces) {
      expect(seenIds.has(w)).toBe(true);
    }
    // …and none it does not (no cross-tenant leak).
    expect(seenIds.has(foreignWs)).toBe(false);
  });

  it('an anon client (no user JWT) sees zero workspaces', async () => {
    const { data } = await createClient(url!, anonKey!, { auth: { persistSession: false } })
      .from('workspaces')
      .select('id');
    expect((data ?? []).length).toBe(0);
  });
});
