import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-209 Slice 1 — DB-level integration test for `bunkai_list_notifications`
// (migration 0053_notifications.sql), the DB-integration test the ADR-0012 /
// rpc-authorization.md contract requires to ship in the SAME slice as the
// migration (§7: "Stage 2 — the DB-integration test ships in the same slice
// as the migration, not a later one").
//
// `bunkai_list_notifications` is `SECURITY INVOKER` (see the migration's own
// header for the six-question walkthrough) — its entire isolation posture is
// `notifications_select_recipient_member_retained`
// (recipient_user_id = auth.uid() AND bunkai_is_workspace_member(workspace_id)
// AND 90-day retention) evaluating against the CALLER's own session. A
// service-role client's Postgres role bypasses RLS outright, so calling this
// RPC with `SUPABASE_SERVICE_ROLE_KEY` alone would pass even if every policy
// below were deleted — it is used ONLY for fixture seed/teardown and the
// cursor-validation backstop (not RLS-relevant). The actual isolation proof
// authenticates for real, via the already-declared `QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD` automation identity signing in through the app's
// real `signInWithPassword` path, never a minted JWT (live-ui-identity.md §3,
// which governs ALL test code).
//
// Covers, per the Stage 2 briefing:
//   (a) a recipient sees only their OWN copies, never a co-member's, in a
//       workspace they legitimately belong to.
//   (b) a crafted/foreign `p_workspace_id` never leaks rows — proven the
//       HARD way: a notification row exists whose recipient genuinely IS the
//       caller, in a workspace the caller is NOT a member of, and it must
//       still resolve to zero (PO Answer, comments.md 2026-07-16: "Hide them
//       entirely... the product should not reveal that an entity or event
//       exists").
//   (c) the 90-day retention boundary (day 89 visible, day 91 not).
//   (d) a minimal proof of the UPDATE RLS policy itself (mark-one/mark-all
//       read are plain PostgREST updates in Slice 2, no RPC — per the
//       implementation plan's own scoping, only the RLS substrate is this
//       slice's concern).
//
// Also exercises `entity_available` (a real, RLS-visible `test` row resolves
// `true`; a nonexistent `entity_id` resolves `false`) and the cursor
// half-supplied backstop (45400), mirroring `list-activity-isolation.test.ts`'s
// own shape for the equivalent checks on `bunkai_list_activity`.
//
// FIXTURE SHAPE — two dedicated throwaway workspaces, not existing ones. This
// project's Supabase instance is shared live infra (see
// `list-activity-isolation.test.ts`'s own header for why), so a brand-new
// workspace pair, touched by nothing else, is the only way to make the
// membership-scoping assertion in (b) meaningful. Direct service-role
// `insert into workspaces`/`notifications` (bypassing any producer RPC, since
// none exists yet — Step 3's test factory is a LATER slice) is legitimate
// fixture setup here, mirroring `report-isolation.test.ts` / `list-activity-
// isolation.test.ts`'s own direct-insert fixtures.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_list_notifications';
const PREFIX = `bk209-notifications-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Well-formed but nonexistent — proves `entity_available` resolves `false`
// for a deleted/never-existed entity, never by coincidence.
const NONEXISTENT_ENTITY_UUID = '00000000-0000-0000-0000-000000000099';

interface NotificationRow {
  id: string
  workspace_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
  entity_available: boolean
}
interface NotificationsPage {
  items: NotificationRow[]
  unread_count: number
  next_cursor: { created_at: string, id: string } | null
}
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  otherMemberUserId: string
  testId: string
  ownRecentId: string
  otherRecipientId: string
  foreignWorkspaceOwnId: string
  retentionOldId: string
  retentionWithinId: string
  unavailableEntityNotifId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function isoDaysBefore(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}

async function listNotifications(
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
// The real, signed-in QA_E2E session — reused across every `it` below rather
// than re-authenticating per test. `persistSession: false` just means no
// localStorage write (irrelevant in this Node test runner); the in-memory
// session on this one client instance stays valid for every subsequent call.
let anon: ReturnType<typeof service> | null = null;
let qaUserId: string | null = null;
let grantedMembership = false;

describeOrSkip('BK-209 — bunkai_list_notifications isolation, retention, entity availability', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A deployed RPC answers with a jsonb page for any
    // well-formed workspace id (RLS/the WHERE clause just returns an empty
    // page for a nonexistent one — this RPC never raises for a missing
    // workspace, matching bunkai_list_activity's own non-disclosure shape).
    const probe = await db.rpc(RPC, { p_workspace_id: ZERO_UUID });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0053_notifications.sql.`;
      return;
    }

    if (!hasRealLoginEnv) {
      skipReason = 'need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD — this RPC\'s isolation property can only be proven through a REAL RLS-scoped session, never a service-role call.';
      return;
    }

    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    qaUserId = signIn.user.id;

    // A second, distinct real user (any active workspace member other than
    // QA_E2E) — used as the throwaway workspaces' owner FK and as the
    // "co-member" recipient whose notification must never leak into QA_E2E's
    // own list.
    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .neq('user_id', qaUserId)
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      skipReason = 'need a second distinct active workspace member (seed state) to prove recipient-scoping.';
      return;
    }
    const otherMemberUserId = anyMember.user_id as string;

    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .insert([
        { slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: otherMemberUserId },
        { slug: `${PREFIX}-foreign-ws`, name: `${PREFIX}-foreign`, owner_user_id: otherMemberUserId },
      ])
      .select('id, slug');
    if (workspacesError) { throw workspacesError; }
    const workspaceRows = (workspaces ?? []) as { id: string, slug: string }[];
    const workspaceId = workspaceRows.find(w => w.slug === `${PREFIX}-ws`)!.id;
    const foreignWorkspaceId = workspaceRows.find(w => w.slug === `${PREFIX}-foreign-ws`)!.id;

    // QA_E2E is granted membership ONLY in `workspaceId` — `foreignWorkspaceId`
    // stays deliberately foreign, even though it will carry a notification
    // row whose recipient IS qaUserId (see below), to prove that losing (or
    // never having had) workspace access hides the row entirely.
    const { error: grantError } = await db
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'viewer', status: 'active' });
    if (grantError) {
      skipReason = `could not grant QA_E2E temporary workspace membership (${grantError.message}).`;
      return;
    }
    grantedMembership = true;

    // A throwaway `tests` row so one notification can reference a genuinely
    // existing, RLS-visible entity (entity_available === true).
    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} test`, created_by: otherMemberUserId })
      .select('id')
      .single();
    if (testError) { throw testError; }
    const testId = test.id as string;

    // NOTE: every row below carries an explicit `created_at`, even the
    // "recent" ones (`isoDaysBefore(0)`) — supabase-js's bulk insert takes
    // the UNION of keys across the array and sends an explicit `null` for
    // any row that omits a key present on a sibling row, which trips the
    // NOT NULL constraint. Discovered empirically the first time this
    // fixture actually ran against live Postgres.
    const { data: seeded, error: seedError } = await db
      .from('notifications')
      .insert([
        // Own, recent, referencing a REAL test — the baseline "visible" row.
        { workspace_id: workspaceId, recipient_user_id: qaUserId, event_type: 'test.created', entity_type: 'test', entity_id: testId, payload: { marker: `${PREFIX}-own-recent` }, created_at: isoDaysBefore(0) },
        // Same workspace, but recipient is the OTHER member — must never
        // appear in QA_E2E's own list (recipient-scoping).
        { workspace_id: workspaceId, recipient_user_id: otherMemberUserId, event_type: 'test.created', entity_type: 'test', entity_id: testId, payload: { marker: `${PREFIX}-other-recipient` }, created_at: isoDaysBefore(0) },
        // Foreign workspace, recipient IS qaUserId — must never appear
        // because QA_E2E is not a member of THIS workspace (membership-
        // scoping / crafted-workspace_id guard), even though the recipient
        // column matches exactly.
        { workspace_id: foreignWorkspaceId, recipient_user_id: qaUserId, event_type: 'test.created', entity_type: 'test', entity_id: testId, payload: { marker: `${PREFIX}-foreign-workspace-own` }, created_at: isoDaysBefore(0) },
        // Retention: 91 days old — outside the 90-day window, must be hidden.
        { workspace_id: workspaceId, recipient_user_id: qaUserId, event_type: 'test.created', entity_type: 'test', entity_id: testId, payload: { marker: `${PREFIX}-retention-old` }, created_at: isoDaysBefore(91) },
        // Retention: 89 days old — inside the window, must remain visible.
        { workspace_id: workspaceId, recipient_user_id: qaUserId, event_type: 'test.created', entity_type: 'test', entity_id: testId, payload: { marker: `${PREFIX}-retention-within` }, created_at: isoDaysBefore(89) },
        // References a nonexistent entity id — entity_available must resolve
        // false (the AC5 "deleted/unavailable" fallback path).
        { workspace_id: workspaceId, recipient_user_id: qaUserId, event_type: 'run.finished', entity_type: 'run', entity_id: NONEXISTENT_ENTITY_UUID, payload: { marker: `${PREFIX}-unavailable` }, created_at: isoDaysBefore(0) },
      ])
      .select('id, payload');
    if (seedError) { throw seedError; }

    const rows = (seeded ?? []) as { id: string, payload: { marker?: string } }[];
    const byMarker = (marker: string) => rows.find(r => r.payload.marker === marker)!.id;

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      otherMemberUserId,
      testId,
      ownRecentId: byMarker(`${PREFIX}-own-recent`),
      otherRecipientId: byMarker(`${PREFIX}-other-recipient`),
      foreignWorkspaceOwnId: byMarker(`${PREFIX}-foreign-workspace-own`),
      retentionOldId: byMarker(`${PREFIX}-retention-old`),
      retentionWithinId: byMarker(`${PREFIX}-retention-within`),
      unavailableEntityNotifId: byMarker(`${PREFIX}-unavailable`),
    };
  });

  afterAll(async () => {
    const db = service();
    if (grantedMembership && fixture && qaUserId) {
      await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', qaUserId);
    }
    if (!fixture) { return; }
    // workspaces.id cascades to notifications/tests/workspace_members
    // (0001_tenancy.sql / 0024_tests.sql / this migration), so deleting the
    // two throwaway workspaces alone is sufficient — deleting the rows
    // explicitly first anyway, for defensiveness against the FK shape ever
    // changing to RESTRICT (mirrors list-activity-isolation.test.ts).
    await db.from('notifications').delete().in('workspace_id', [fixture.workspaceId, fixture.foreignWorkspaceId]);
    await db.from('tests').delete().eq('id', fixture.testId);
    await db.from('workspaces').delete().in('id', [fixture.workspaceId, fixture.foreignWorkspaceId]);
  });

  it('a recipient sees only their own rows, never a co-member\'s copy — plus entity_available for a real vs. nonexistent entity', async () => {
    if (!fixture || !qaUserId || !anon) { return warn(); }

    const { data, error } = await listNotifications(anon, { workspaceId: fixture.workspaceId, limit: 20 });
    expect(error).toBeNull();
    const page = data as unknown as NotificationsPage;
    const ids = page.items.map(i => i.id);

    expect(ids).toContain(fixture.ownRecentId);
    expect(ids).toContain(fixture.retentionWithinId);
    expect(ids).toContain(fixture.unavailableEntityNotifId);
    expect(ids).not.toContain(fixture.otherRecipientId); // recipient-scoping
    expect(ids).not.toContain(fixture.retentionOldId); // retention boundary (also covered in its own test below)
    expect(ids).not.toContain(fixture.foreignWorkspaceOwnId); // wrong workspace, not requested here anyway

    // unread_count is scoped the SAME way (recipient + membership +
    // retention): exactly the 3 rows above that are QA_E2E's own, visible,
    // and still unread at this point in the suite (the mark-read test runs
    // LAST, deliberately, so no earlier test observes a mutated read_at).
    expect(page.unread_count).toBe(3);

    const ownRow = page.items.find(i => i.id === fixture!.ownRecentId)!;
    expect(ownRow.entity_available).toBe(true); // a real, RLS-visible `test` row

    const unavailableRow = page.items.find(i => i.id === fixture!.unavailableEntityNotifId)!;
    expect(unavailableRow.entity_available).toBe(false); // nonexistent entity_id
  });

  it('a crafted/foreign workspace_id never leaks rows, even when the caller genuinely IS the recipient (membership-scoping)', async () => {
    if (!fixture || !qaUserId || !anon) { return warn(); }

    const { data, error } = await listNotifications(anon, { workspaceId: fixture.foreignWorkspaceId, limit: 20 });
    expect(error).toBeNull(); // RLS filters silently, never raises
    const page = data as unknown as NotificationsPage;
    expect(page.items).toEqual([]);
    expect(page.unread_count).toBe(0);

    // Cross-check: the service-role read proves the row genuinely exists in
    // `foreignWorkspaceId` with QA_E2E as its recipient — so the empty result
    // above is caused by the membership gate, not an empty/wrong fixture.
    const db = service();
    const { data: raw, error: rawError } = await db
      .from('notifications')
      .select('id, recipient_user_id')
      .eq('id', fixture.foreignWorkspaceOwnId)
      .single();
    expect(rawError).toBeNull();
    expect(raw!.recipient_user_id).toBe(qaUserId);
  });

  it('the 90-day retention boundary is enforced even for the legitimate recipient', async () => {
    if (!fixture || !qaUserId || !anon) { return warn(); }

    // Cross-checked against the service-role read (bypasses RLS) so this
    // assertion is about the RETENTION filter specifically, not a seed
    // mistake: the old row genuinely exists, just outside the window.
    const db = service();
    const { data: rawOld, error: rawOldError } = await db.from('notifications').select('id').eq('id', fixture.retentionOldId).maybeSingle();
    expect(rawOldError).toBeNull();
    expect(rawOld).not.toBeNull();

    const { data, error } = await listNotifications(anon, { workspaceId: fixture.workspaceId, limit: 20 });
    expect(error).toBeNull();
    const ids = (data as unknown as NotificationsPage).items.map(i => i.id);
    expect(ids).not.toContain(fixture.retentionOldId);
    expect(ids).toContain(fixture.retentionWithinId);
  });

  it('a half-supplied cursor is rejected (45400), never silently degraded to page 1', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const onlyCreatedAt = await listNotifications(db, {
      workspaceId: fixture.workspaceId,
      cursorCreatedAt: '2026-01-15T12:00:00.000Z',
      cursorId: null,
    });
    expect(onlyCreatedAt.error).not.toBeNull();
    expect(onlyCreatedAt.error?.code).toBe('45400');

    const onlyId = await listNotifications(db, {
      workspaceId: fixture.workspaceId,
      cursorCreatedAt: null,
      cursorId: '00000000-0000-0000-0000-000000000000',
    });
    expect(onlyId.error).not.toBeNull();
    expect(onlyId.error?.code).toBe('45400');
  });

  // Deliberately LAST: this is the only test that mutates fixture state
  // (read_at), so every assertion above observes the original, all-unread
  // seed shape.
  it('the UPDATE RLS policy lets a recipient mark their own row read, and silently denies a co-member\'s row (mark-read/mark-all substrate — Slice 2 is a plain PostgREST update, no RPC)', async () => {
    if (!fixture || !qaUserId || !anon) { return warn(); }

    // Own row: notifications_update_recipient_member's predicate
    // (recipient_user_id = auth.uid() AND bunkai_is_workspace_member) holds.
    const { data: ownUpdate, error: ownUpdateError } = await anon
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', fixture.ownRecentId)
      .select('id, read_at');
    expect(ownUpdateError).toBeNull();
    expect(ownUpdate).toHaveLength(1);
    expect(ownUpdate![0].read_at).not.toBeNull();

    // A co-member's row in the SAME workspace: RLS hides it from the UPDATE
    // entirely (0 rows affected, no error) — never a distinct error that
    // would disclose the row's existence.
    const { data: otherUpdate, error: otherUpdateError } = await anon
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', fixture.otherRecipientId)
      .select('id, read_at');
    expect(otherUpdateError).toBeNull();
    expect(otherUpdate).toHaveLength(0);

    // Cross-check via service-role: the co-member's row is genuinely
    // untouched, proving the empty result above was RLS, not a coincidence.
    const db = service();
    const { data: unchanged, error: unchangedError } = await db
      .from('notifications')
      .select('read_at')
      .eq('id', fixture.otherRecipientId)
      .single();
    expect(unchangedError).toBeNull();
    expect(unchanged!.read_at).toBeNull();
  });
});

// The suite never fails on missing migration / seed state / QA_E2E login —
// it says why and passes.
function warn() {
  console.warn(`[list-notifications-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
