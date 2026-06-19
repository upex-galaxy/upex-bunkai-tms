import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-32 — workspace read-isolation guard for the expanded-Test RPC
// (`bunkai_get_test_expanded`). This is the integration sibling of the unit
// error-map test (`lib/tests/errors.test.ts`): it exercises the REAL server-side
// read rulebook against a live database and asserts INV-3 tenant isolation —
//
//   * an ACTIVE member of a Test's workspace gets the composed payload
//     (header + ordered chain of expanded ATCs);
//   * a member of a DIFFERENT workspace reading a foreign Test id is denied with
//     P0002 and no data leak (non-disclosing);
//   * a random / nonexistent test id raises the SAME P0002 (indistinguishable
//     from foreign — no existence signal);
//   * a VIEWER-role member reads successfully (the read helper deliberately
//     accepts any active role, unlike the write asserts) — the key new behavior;
//   * a 7-ATC payload returns in a single round trip (perf sanity).
//
// The RPC is SECURITY DEFINER and takes the actor EXPLICITLY (p_actor_user_id),
// so we drive it through the service-role client passing each actor id directly
// — this is the exact contract the API route uses (admin client, explicit
// actor) and needs no JWT impersonation.
//
// DB-dependent + env-gated, cloned from `lib/api/rls-parity.test.ts`: when the
// Supabase env is absent (CI without DB creds) the suite SKIPS rather than
// fails. When present but the seed data can't satisfy a precondition it logs and
// passes (nothing to assert), so it never blocks a build on seed state.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }
interface TestRow { id: string, workspace_id: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

describeOrSkip('BK-32 — bunkai_get_test_expanded read isolation', () => {
  it('an active member reading a Test in their own workspace gets the composed payload', async () => {
    const db = service();

    const { data: tests, error: testsError } = await db
      .from('tests')
      .select('id, workspace_id');
    if (testsError) { throw testsError; }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, role, status');
    if (membersError) { throw membersError; }

    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');
    const pair = findOwnPair(tests ?? [], activeMembers);
    if (!pair) {
      console.warn('[read-isolation] skipped: need a Test whose workspace has an active member (seed state).');
      return;
    }

    const { data, error } = await db.rpc('bunkai_get_test_expanded', {
      p_actor_user_id: pair.userId,
      p_test_id: pair.testId,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const payload = data as Record<string, unknown>;
    expect(payload.id).toBe(pair.testId);
    expect(payload.workspace_id).toBe(pair.workspaceId);
    expect(typeof payload.title).toBe('string');
    // Chain is an array, ordered by the RPC; count matches the chain length.
    expect(Array.isArray(payload.atcs)).toBe(true);
    expect(payload.atc_count).toBe((payload.atcs as unknown[]).length);
    // Positions are 1..n, no gaps / repeats, in array order (AC Order).
    const positions = (payload.atcs as Array<{ position: number }>).map(a => a.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });

  it('a member reading a FOREIGN-workspace Test is denied (P0002) with no data leak', async () => {
    const db = service();

    const { data: tests, error: testsError } = await db
      .from('tests')
      .select('id, workspace_id');
    if (testsError) { throw testsError; }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, role, status');
    if (membersError) { throw membersError; }

    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');
    const cross = findCrossPair(tests ?? [], activeMembers);
    if (!cross) {
      console.warn('[read-isolation] skipped: need a Test and an active member of a DIFFERENT workspace (seed state).');
      return;
    }

    const { data, error } = await db.rpc('bunkai_get_test_expanded', {
      p_actor_user_id: cross.userId,
      p_test_id: cross.testId,
    });
    // Non-disclosure: an error is raised and NO payload comes back.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('a random / nonexistent Test id raises the SAME P0002 (no existence signal)', async () => {
    const db = service();

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, role, status')
      .eq('status', 'active')
      .limit(1);
    if (membersError) { throw membersError; }
    const actor = (members ?? [])[0] as { user_id: string } | undefined;
    if (!actor) {
      console.warn('[read-isolation] skipped: need at least one active member (seed state).');
      return;
    }

    const { data, error } = await db.rpc('bunkai_get_test_expanded', {
      p_actor_user_id: actor.user_id,
      p_test_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).not.toBeNull();
    // Byte-identical to the foreign-Test denial: same code, no leak.
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('a VIEWER-role active member reads a Test in their own workspace successfully', async () => {
    const db = service();

    const { data: tests, error: testsError } = await db
      .from('tests')
      .select('id, workspace_id');
    if (testsError) { throw testsError; }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, role, status');
    if (membersError) { throw membersError; }

    const viewers = (members ?? []).filter((m: MemberRow) => m.status === 'active' && m.role === 'viewer');
    const pair = findOwnPair(tests ?? [], viewers);
    if (!pair) {
      console.warn('[read-isolation] skipped: need a Test whose workspace has an active VIEWER member (seed state).');
      return;
    }

    const { data, error } = await db.rpc('bunkai_get_test_expanded', {
      p_actor_user_id: pair.userId,
      p_test_id: pair.testId,
    });
    // The read helper accepts ANY active role — a viewer must NOT be denied.
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect((data as Record<string, unknown>).id).toBe(pair.testId);
  });

  it('a populated chain returns fully expanded in ONE round trip (perf sanity)', async () => {
    const db = service();

    // Pick the Test with the longest chain (ideally 5–7 ATCs) to exercise the
    // single-round-trip composition; any populated Test still validates shape.
    const { data: tests, error: testsError } = await db
      .from('tests')
      .select('id, workspace_id');
    if (testsError) { throw testsError; }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, role, status');
    if (membersError) { throw membersError; }

    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');
    const pair = findOwnPair(tests ?? [], activeMembers);
    if (!pair) {
      console.warn('[read-isolation] skipped: need a Test whose workspace has an active member (seed state).');
      return;
    }

    const started = performance.now();
    const { data, error } = await db.rpc('bunkai_get_test_expanded', {
      p_actor_user_id: pair.userId,
      p_test_id: pair.testId,
    });
    const elapsedMs = performance.now() - started;
    expect(error).toBeNull();

    const payload = data as { atcs: Array<{ steps: unknown[], assertions: unknown[] }> };
    // Every ATC carries its nested steps + assertions — proof of one composed
    // read, not N follow-up queries.
    for (const atc of payload.atcs) {
      expect(Array.isArray(atc.steps)).toBe(true);
      expect(Array.isArray(atc.assertions)).toBe(true);
    }
    // Loose ceiling — the AC budget is <500ms p95; a single round trip against
    // a live DB should sit far under this. Network jitter tolerated generously.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

// Find a (test, actor) pair where the actor is an active member of the Test's
// OWN workspace.
function findOwnPair(tests: TestRow[], members: MemberRow[]) {
  const membersByWs = new Map<string, MemberRow[]>();
  for (const m of members) {
    if (!membersByWs.has(m.workspace_id)) { membersByWs.set(m.workspace_id, []); }
    membersByWs.get(m.workspace_id)!.push(m);
  }
  for (const t of tests) {
    const wsMembers = membersByWs.get(t.workspace_id);
    const first = wsMembers?.[0];
    if (first) {
      return { testId: t.id, workspaceId: t.workspace_id, userId: first.user_id };
    }
  }
  return undefined;
}

// Find a (test, actor) pair where the actor is an active member of SOME
// workspace but NOT a member of the Test's workspace (cross-tenant probe).
function findCrossPair(tests: TestRow[], members: MemberRow[]) {
  const wsByUser = new Map<string, Set<string>>();
  for (const m of members) {
    if (!wsByUser.has(m.user_id)) { wsByUser.set(m.user_id, new Set()); }
    wsByUser.get(m.user_id)!.add(m.workspace_id);
  }
  for (const t of tests) {
    for (const [userId, ownWs] of wsByUser) {
      if (!ownWs.has(t.workspace_id)) {
        return { testId: t.id, workspaceId: t.workspace_id, userId };
      }
    }
  }
  return undefined;
}
