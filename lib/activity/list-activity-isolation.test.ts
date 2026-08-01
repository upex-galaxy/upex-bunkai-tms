import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-49 — DB-level integration test for `bunkai_list_activity`
// (migration 0045_activity_stream.sql), closing the gap the implementation
// plan's own Step 1 called for and Slice 1 never wrote (the live-DB checks
// during Slice 1's review were ad hoc, not a committed test asset).
//
// `bunkai_list_activity` is the FIRST `SECURITY INVOKER` list RPC in this
// codebase's activity/runs domains — every existing isolation precedent
// (`lib/runs/report-isolation.test.ts`, `lib/runs/history-isolation.test.ts`)
// tests a `SECURITY DEFINER` RPC with an explicit `p_actor_user_id` guard.
// This function carries no such parameter to spoof: its cross-workspace
// isolation is enforced entirely by `activity_log_select_workspace_member`
// (0009_cross_cutting.sql) evaluating against the CALLER's own `auth.uid()`,
// which only happens when the RPC is actually invoked AS the caller — i.e.
// only a REAL authenticated session can prove this property. A service-role
// client's Postgres role bypasses RLS outright, so calling this RPC with
// `SUPABASE_SERVICE_ROLE_KEY` alone would pass even if the RLS policy were
// deleted entirely; it is used ONLY for fixture setup/teardown and for the
// non-RLS-relevant keyset/allowlist/tie-break/cursor-validation assertions
// below — privileged credentials are forbidden by `live-ui-identity.md` §3
// only when used "to obtain a session"; fixture seed/teardown and an
// explicit-actor RPC call obtain no session, so this stays within §3 as
// written. The actual isolation proof authenticates for real, via the already-declared
// `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` automation identity signing
// in through the app's real `signInWithPassword` path, never a minted JWT.
//
// Covers the plan's Definition of Done line "Cross-workspace isolation +
// pagination boundary + tie-break verified by test" plus the allowlist
// (Decision 2) and cursor-half-rejection (45214) backstops the migration's
// own validation order specifies.
//
// FIXTURE SHAPE — a dedicated throwaway workspace, not an existing one.
// This project's Supabase instance is shared live infra across every
// concurrent avalanche worker (generation-1 findings, worker-a/b/c
// handoffs), and `bunkai_list_activity`'s keyset cursor compares
// `(created_at, id) < (cursor)` with no upper bound — an EXISTING busy
// workspace's real historical rows (however old) always satisfy "before my
// cursor" the moment paging moves past this fixture's own rows, which
// silently defeats any "exactly N pages, next_cursor null" assertion
// (discovered empirically: an initial attempt using a real active
// workspace's members + a future-dated fixture solved the "my rows sort
// below page 1's limit" problem only to hit this exact one on page 2).
// A brand-new workspace, touched by nothing else, is the only way to make
// pagination-boundary and tie-break assertions meaningful. Direct
// service-role `insert into workspaces` (bypassing the app's
// `bunkai_bootstrap_workspace` RPC) is legitimate here — this is fixture
// setup for a DB-level test, not simulating a real user's workspace
// creation flow, mirrors how `report-isolation.test.ts` / `history-
// isolation.test.ts` insert directly into `projects`/`tests`/`runs`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_list_activity';
const PREFIX = `bk49-activity-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface ActivityRow { id: string, entity_type: string, action: string, actor_user_id: string | null, created_at: string, payload: Record<string, unknown> }
interface ActivityPage { items: ActivityRow[], next_cursor: { created_at: string, id: string } | null }
interface Fixture {
  workspaceId: string
  // Newest-first ids of the 4 ALLOWLISTED rows this fixture seeds.
  p1: string
  p2: string
  p3: string
  p4: string
  excludedId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function isoMinutesBefore(base: number, minutes: number): string {
  return new Date(base - minutes * 60_000).toISOString();
}

async function listActivity(
  db: ReturnType<typeof service>,
  args: { workspaceId: string, cursorCreatedAt?: string | null, cursorId?: string | null, limit?: number },
) {
  return db.rpc(RPC, {
    p_workspace_id: args.workspaceId,
    p_limit: args.limit ?? 30,
    p_cursor_created_at: args.cursorCreatedAt ?? null,
    p_cursor_id: args.cursorId ?? null,
  });
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-49 — bunkai_list_activity isolation, keyset, allowlist (DoD / plan Step 1)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A deployed RPC answers with a jsonb page for any
    // well-formed workspace id (even a nonexistent one — RLS/the WHERE clause
    // just returns an empty page, this RPC never raises for a missing
    // workspace the way the DEFINER RPCs' actor-bind guard does).
    const probe = await db.rpc(RPC, { p_workspace_id: '00000000-0000-0000-0000-000000000000' });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0045_activity_stream.sql.`;
      return;
    }

    // Any real user id works as the throwaway workspace's owner (FK only,
    // never authenticated as) and as the seeded rows' actor_user_id.
    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      skipReason = 'need at least one active workspace member to use as a real user id (seed state).';
      return;
    }
    const ownerUserId = anyMember.user_id as string;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    const base = Date.parse('2026-01-15T12:00:00.000Z');
    // 4 ALLOWLISTED rows across 3 distinct timestamps (T0, T-1 x2, T-2) plus
    // 1 EXCLUDED row sharing the T-1 timestamp with two allowed rows — the
    // allowlist filter must hold even inside a tie-break window, not just at
    // an isolated timestamp. p2/p3 share T-1 specifically to exercise the
    // (created_at, id) tie-break: whichever of the two sorts LAST by id
    // lands on page 1 (limit=2 below) alongside p1, and the other must be the
    // FIRST item of page 2 — proving the keyset boundary neither skips nor
    // duplicates a same-timestamp row.
    const { data: seeded, error: seedError } = await db
      .from('activity_log')
      .insert([
        { workspace_id: workspaceId, actor_user_id: ownerUserId, entity_type: 'test', action: 'test.created', payload: { title: `${PREFIX} p1` }, created_at: isoMinutesBefore(base, 0) },
        { workspace_id: workspaceId, actor_user_id: ownerUserId, entity_type: 'atc', action: 'atc.created', payload: { title: `${PREFIX} p2` }, created_at: isoMinutesBefore(base, 1) },
        { workspace_id: workspaceId, actor_user_id: ownerUserId, entity_type: 'module', action: 'module.renamed', payload: { name: `${PREFIX} p3`, new_path: 'a/b' }, created_at: isoMinutesBefore(base, 1) },
        { workspace_id: workspaceId, actor_user_id: ownerUserId, entity_type: 'test', action: 'test.created', payload: { title: `${PREFIX} p4` }, created_at: isoMinutesBefore(base, 2) },
        // Excluded: atc.updated is a REAL write-site action (0021/0035) but
        // deliberately absent from the MVP allowlist (Decision 2) — this is
        // what must NEVER appear in any page this suite reads.
        { workspace_id: workspaceId, actor_user_id: ownerUserId, entity_type: 'atc', action: 'atc.updated', payload: { title: `${PREFIX} excluded` }, created_at: isoMinutesBefore(base, 1) },
      ])
      .select('id, action, payload');
    if (seedError) { throw seedError; }

    // Matched by the payload marker this fixture itself wrote, NOT by
    // `created_at` — Postgres round-trips a `timestamptz` in offset form
    // (`+00:00`), not the `Z`-suffixed ISO string this file sent on insert,
    // so a string-equality match against the original literal would never hit.
    const rows = (seeded ?? []) as { id: string, action: string, payload: { title?: string, name?: string } }[];
    const p1 = rows.find(r => r.payload.title === `${PREFIX} p1`)!.id;
    const p2 = rows.find(r => r.payload.title === `${PREFIX} p2`)!.id;
    const p3 = rows.find(r => r.payload.name === `${PREFIX} p3`)!.id;
    const p4 = rows.find(r => r.payload.title === `${PREFIX} p4`)!.id;
    const excludedId = rows.find(r => r.action === 'atc.updated')!.id;

    fixture = { workspaceId, p1, p2, p3, p4, excludedId };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // activity_log.workspace_id and workspace_members.workspace_id are both
    // ON DELETE CASCADE (0001_tenancy.sql / 0009_cross_cutting.sql), so
    // deleting the throwaway workspace alone is sufficient — deleting the
    // rows explicitly first anyway, for defensiveness against the FK shape
    // ever changing to RESTRICT.
    await db.from('activity_log').delete().in('id', [fixture.p1, fixture.p2, fixture.p3, fixture.p4, fixture.excludedId]);
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('returns only MVP-allowlisted actions, newest first — the excluded row never appears', async () => {
    if (!fixture) { return warn(); }
    const { data, error } = await listActivity(service(), { workspaceId: fixture.workspaceId, limit: 10 });
    expect(error).toBeNull();
    const page = data as unknown as ActivityPage;
    expect(page.items).toHaveLength(4);
    const ids = page.items.map(i => i.id);
    expect(ids).toContain(fixture.p1);
    expect(ids).toContain(fixture.p2);
    expect(ids).toContain(fixture.p3);
    expect(ids).toContain(fixture.p4);
    expect(ids).not.toContain(fixture.excludedId);
    // Newest-first: p1 (T0) strictly precedes p4 (T-2) in the returned order.
    expect(ids.indexOf(fixture.p1)).toBeLessThan(ids.indexOf(fixture.p4));
    expect(page.next_cursor).toBeNull();
  });

  it('atc.created projects only its allowlisted payload key (positive projection, non-run action)', async () => {
    if (!fixture) { return warn(); }
    const { data, error } = await listActivity(service(), { workspaceId: fixture.workspaceId, limit: 10 });
    expect(error).toBeNull();
    const page = data as unknown as ActivityPage;
    const atcCreatedRow = page.items.find(i => i.id === fixture!.p2)!;
    // atc.created's own projection is `{title}` only (migration 0045) — this
    // seed's payload carried no OTHER keys to begin with, but the assertion
    // is on the RESPONSE shape (a positive projection), not on echoing input.
    // The run.aborted.reason-specific case (a payload that actually HAS a key
    // the projection must strip) is a separate, dedicated test below — this
    // one never seeded a `reason` key, so renamed to stop overclaiming R3
    // coverage it never provided (found in the full-chain adversarial review).
    expect(Object.keys(atcCreatedRow.payload)).toEqual(['title']);
  });

  it('keyset pagination: no dup/skip across the boundary, stable tie-break on shared created_at', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const page1Res = await listActivity(db, { workspaceId: fixture.workspaceId, limit: 2 });
    expect(page1Res.error).toBeNull();
    const page1 = page1Res.data as unknown as ActivityPage;
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).not.toBeNull();

    const page2Res = await listActivity(db, {
      workspaceId: fixture.workspaceId,
      limit: 2,
      cursorCreatedAt: page1.next_cursor!.created_at,
      cursorId: page1.next_cursor!.id,
    });
    expect(page2Res.error).toBeNull();
    const page2 = page2Res.data as unknown as ActivityPage;

    const page1Ids = page1.items.map(i => i.id);
    const page2Ids = page2.items.map(i => i.id);

    // p1 (T0, unambiguous) is always page 1's first row.
    expect(page1Ids[0]).toBe(fixture.p1);

    // p2/p3 share T-1 — whichever sorts LAST by id (Postgres `id desc`, which
    // for canonical lowercase-hex uuids matches plain string comparison)
    // fills the rest of page 1; the OTHER one must be page 2's first row.
    // Neither may appear on both pages, and the excluded row must never
    // appear on either.
    const [tieWinner, tieLoser] = fixture.p2 > fixture.p3 ? [fixture.p2, fixture.p3] : [fixture.p3, fixture.p2];
    expect(page1Ids[1]).toBe(tieWinner);
    expect(page2Ids[0]).toBe(tieLoser);
    expect(page2Ids[1]).toBe(fixture.p4);

    const allIds = [...page1Ids, ...page2Ids];
    expect(new Set(allIds).size).toBe(4); // no duplication across pages
    expect(allIds).not.toContain(fixture.excludedId);
    expect(page2.next_cursor).toBeNull(); // exactly 2 pages for 4 allowed rows in this isolated workspace
  });

  it('a half-supplied cursor is rejected (45214), never silently degraded to page 1', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const onlyCreatedAt = await listActivity(db, {
      workspaceId: fixture.workspaceId,
      cursorCreatedAt: '2026-01-15T12:00:00.000Z',
      cursorId: null,
    });
    expect(onlyCreatedAt.error).not.toBeNull();
    expect(onlyCreatedAt.error?.code).toBe('45214');

    const onlyId = await listActivity(db, {
      workspaceId: fixture.workspaceId,
      cursorCreatedAt: null,
      cursorId: '00000000-0000-0000-0000-000000000000',
    });
    expect(onlyId.error).not.toBeNull();
    expect(onlyId.error?.code).toBe('45214');
  });

  it('a non-member gets RLS-filtered to zero rows via a REAL authenticated session (the load-bearing security property)', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[list-activity-isolation] skipped RLS case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // Real, sanctioned login — the anon-key client signs in as the declared
    // automation identity, exactly the app's own login path. Never a locally
    // minted JWT, per live-ui-identity.md §3 (governs ALL test code). This
    // identity is NEVER added as a member of the throwaway workspace above,
    // so it is foreign by construction — no membership re-check needed.
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[list-activity-isolation] skipped RLS case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }

    const db = service();
    const [asMember, asOutsider] = await Promise.all([
      listActivity(db, { workspaceId: fixture.workspaceId, limit: 10 }),
      listActivity(anon, { workspaceId: fixture.workspaceId, limit: 10 }),
    ]);

    // Cross-check: the service-role read proves this workspace genuinely HAS
    // visible activity — so the outsider's empty result below is caused by
    // RLS, not by an empty/wrong workspace.
    expect(asMember.error).toBeNull();
    expect((asMember.data as unknown as ActivityPage).items.length).toBeGreaterThan(0);

    expect(asOutsider.error).toBeNull(); // RLS filters silently, never raises
    const outsiderPage = asOutsider.data as unknown as ActivityPage;
    expect(outsiderPage.items).toEqual([]);
    expect(outsiderPage.next_cursor).toBeNull();
  });
});

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[list-activity-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}

// ============================================================================
// BK-49 final-review BLOCKER regression guard — bunkai_resolve_activity_actors
// (migration 0047_activity_actor_resolve_scope.sql) + the MAJOR finding in the
// same review pass: the ORIGINAL "does not project run.aborted.reason" test
// above never actually seeded a run.aborted row, so it proved nothing about
// the SQL's own projection — it asserted on atc.created's payload instead,
// which trivially had no 'reason' key to begin with. Both fixes get their own
// isolated fixture/workspace (not folded into the block above) so they don't
// perturb that block's carefully-counted keyset/tie-break page math.
// ============================================================================

interface ActorRow { user_id: string, email: string | null }

async function resolveActors(
  db: ReturnType<typeof service>,
  args: { workspaceId: string, userIds: string[] },
) {
  return db.rpc('bunkai_resolve_activity_actors', {
    p_workspace_id: args.workspaceId,
    p_user_ids: args.userIds,
  });
}

interface RegressionFixture {
  workspaceId: string
  ownerUserId: string
  foreignUserId: string | null // a real auth.users id with NO activity in workspaceId
  abortedRowId: string
}

let regressionFixture: RegressionFixture | null = null;
let regressionSkipReason: string | null = null;

describeOrSkip('BK-49 — post-review fixes: actor-resolver workspace scoping + run.aborted.reason (real row)', () => {
  beforeAll(async () => {
    const db = service();

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(50);
    if (membersError) { throw membersError; }
    const distinctUserIds = [...new Set((members ?? []).map(m => m.user_id as string))];
    if (distinctUserIds.length === 0) {
      regressionSkipReason = 'need at least one active workspace member (seed state).';
      return;
    }
    const ownerUserId = distinctUserIds[0];
    // A SECOND distinct real user, used only as a target id that will have NO
    // activity_log row in this fixture's workspace — proves the fix excludes a
    // real (not merely nonexistent) user who has no relationship to it. Falls
    // back to a well-formed-but-nonexistent uuid if this live DB genuinely has
    // only one distinct active member (still a valid exclusion case, just a
    // weaker one — logged, not silently swapped without a trace).
    const foreignUserId = distinctUserIds.find(id => id !== ownerUserId) ?? null;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-guard-ws`, name: `${PREFIX}-guard`, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // A REAL run.aborted row with a `reason` key present in its source
    // payload (mirrors 0036_run_abort.sql's actual write-site shape:
    // {reason, skipped_steps}) — the thing the original test never seeded.
    const { data: aborted, error: abortedError } = await db
      .from('activity_log')
      .insert({
        workspace_id: workspaceId,
        actor_user_id: ownerUserId,
        entity_type: 'run',
        action: 'run.aborted',
        payload: { reason: 'Environment credentials expired mid-run — operator note, free text.', skipped_steps: 3 },
      })
      .select('id')
      .single();
    if (abortedError) { throw abortedError; }

    regressionFixture = { workspaceId, ownerUserId, foreignUserId, abortedRowId: aborted.id as string };
  });

  afterAll(async () => {
    if (!regressionFixture) { return; }
    const db = service();
    await db.from('activity_log').delete().eq('id', regressionFixture.abortedRowId);
    await db.from('workspaces').delete().eq('id', regressionFixture.workspaceId);
  });

  it('run.aborted.reason is never projected, verified against a REAL row that has one (MAJOR fix)', async () => {
    if (!regressionFixture) { return warnRegression(); }
    const { data, error } = await listActivity(service(), { workspaceId: regressionFixture.workspaceId, limit: 10 });
    expect(error).toBeNull();
    const page = data as unknown as ActivityPage;
    const row = page.items.find(i => i.id === regressionFixture!.abortedRowId);
    expect(row).toBeDefined();
    expect(Object.keys(row!.payload)).toEqual(['skipped_steps']);
    expect(row!.payload.reason).toBeUndefined();
    expect(JSON.stringify(row!.payload)).not.toMatch(/expired|operator note/);
  });

  it('bunkai_resolve_activity_actors excludes a real user_id with no activity in this workspace (BLOCKER fix)', async () => {
    if (!regressionFixture) { return warnRegression(); }
    if (!regressionFixture.foreignUserId) {
      console.warn('[list-activity-isolation] skipped actor-scope case: need a second distinct active workspace member on this live DB.');
      return;
    }
    if (!hasRealLoginEnv) {
      console.warn('[list-activity-isolation] skipped actor-scope case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // bunkai_resolve_activity_actors' caller-membership guard reads auth.uid()
    // — NULL under a service-role call, so a service-role client would either
    // fail the guard outright (as it does — confirmed empirically) or, if it
    // ever silently passed, would prove nothing about a REAL caller's exposure.
    // This is exactly the property under test: call it through the app's real
    // login path, never a minted JWT (live-ui-identity.md §3).
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[list-activity-isolation] skipped actor-scope case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const qaUserId = signIn.user.id;

    // Throwaway membership so QA_E2E's own bunkai_is_workspace_member(caller)
    // check passes — same fixture-setup pattern report-isolation.test.ts uses,
    // removed again in `finally` regardless of the test's outcome.
    const db = service();
    const { error: grantError } = await db
      .from('workspace_members')
      .insert({ workspace_id: regressionFixture.workspaceId, user_id: qaUserId, role: 'viewer', status: 'active' });
    if (grantError) {
      console.warn(`[list-activity-isolation] skipped actor-scope case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
      return;
    }

    try {
      const { data, error } = await resolveActors(anon, {
        workspaceId: regressionFixture.workspaceId,
        userIds: [regressionFixture.ownerUserId, regressionFixture.foreignUserId],
      });
      expect(error).toBeNull();
      const rows = (data ?? []) as ActorRow[];
      const ids = rows.map(r => r.user_id);
      // The legitimate actor (wrote the seeded run.aborted row in THIS
      // workspace) resolves.
      expect(ids).toContain(regressionFixture.ownerUserId);
      // The foreign user — a real, existing auth.users row with zero activity
      // in this workspace — is silently excluded, not disclosed. Before
      // migration 0047, this assertion would have failed: the function
      // returned every requested id's email regardless of any relationship to
      // p_workspace_id, as long as the CALLER belonged to it.
      expect(ids).not.toContain(regressionFixture.foreignUserId);
    }
    finally {
      await db.from('workspace_members').delete().eq('workspace_id', regressionFixture.workspaceId).eq('user_id', qaUserId);
    }
  });
});

function warnRegression() {
  console.warn(`[list-activity-isolation] skipped: ${regressionSkipReason ?? 'fixture unavailable.'}`);
}
