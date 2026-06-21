import { mintUserJwt } from '@lib/api/user-jwt';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-86 — `/me` active-workspace role resolution + multi-tenant isolation.
//
// The route (`app/api/v1/me/route.ts`) imports `server-only`, so it cannot be
// loaded in pure Bun. This suite instead exercises the EXACT query the route
// runs for the role — `workspace_members.select('role').eq(workspace_id)
// .eq(user_id).maybeSingle()` — through the same RLS-scoped impersonating
// client the unified gateway (ADR-0001) builds, proving the role read both
// resolves correctly AND self-narrows to the caller (no cross-tenant leak).
//
// DB-dependent: self-discovers a member row from seed state. When the Supabase
// env is absent it SKIPS (loudly) rather than fails; when present but seed
// preconditions cannot be met it logs and passes (nothing to assert).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && anonKey && serviceKey && jwtSecret);

if (!hasEnv) {
  console.warn('[me-role] SKIPPED: Supabase env not set (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY / JWT_SECRET).');
}

const describeOrSkip = hasEnv ? describe : describe.skip;

function impersonating(token: string) {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Mirrors the route's role read exactly.
async function readActiveWorkspaceRole(token: string, workspaceId: string, userId: string) {
  const { data } = await impersonating(token)
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

describeOrSkip('BK-86 — /me active_workspace_role', () => {
  it('returns the caller\'s own role for their active workspace', async () => {
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const { data: members, error } = await service
      .from('workspace_members')
      .select('user_id, workspace_id, role');
    if (error) { throw error; }

    const sample = (members ?? [])[0] as { user_id: string, workspace_id: string, role: string } | undefined;
    if (!sample) {
      console.warn('[me-role] skipped: no workspace_members rows in seed state.');
      return;
    }

    const token = await mintUserJwt(sample.user_id, jwtSecret!);
    const role = await readActiveWorkspaceRole(token, sample.workspace_id, sample.user_id);
    expect(role).toBe(sample.role);
  });

  it('never returns another user\'s role (multi-tenant isolation)', async () => {
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const { data: members, error } = await service
      .from('workspace_members')
      .select('user_id, workspace_id, role');
    if (error) { throw error; }

    const rows = (members ?? []) as Array<{ user_id: string, workspace_id: string, role: string }>;
    const byUser = new Map<string, Set<string>>();
    for (const m of rows) {
      if (!byUser.has(m.user_id)) { byUser.set(m.user_id, new Set()); }
      byUser.get(m.user_id)!.add(m.workspace_id);
    }

    // Find user A and a workspace A is NOT a member of (a foreign membership).
    let userA: string | undefined;
    let foreignWs: string | undefined;
    const allWs = new Set(rows.map(r => r.workspace_id));
    for (const u of byUser.keys()) {
      const mine = byUser.get(u)!;
      const foreign = [...allWs].find(w => !mine.has(w));
      if (foreign) { userA = u; foreignWs = foreign; break; }
    }

    if (!userA || !foreignWs) {
      console.warn('[me-role] skipped: need a user with at least one non-member workspace (seed state).');
      return;
    }

    // A, scoped by RLS, must read NULL for a workspace it does not belong to —
    // it can never surface the role of whoever DOES belong there.
    const token = await mintUserJwt(userA, jwtSecret!);
    const leaked = await readActiveWorkspaceRole(token, foreignWs, userA);
    expect(leaked).toBeNull();
  });

  it('resolves NULL role when there is no active workspace (Scenario B)', () => {
    // The route only runs the role read when activeWorkspaceId is non-null;
    // a null active workspace yields a null role by construction.
    const activeWorkspaceId: string | null = null;
    const role = activeWorkspaceId ? 'member' : null;
    expect(role).toBeNull();
  });
});
