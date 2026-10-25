import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-212 Slice 1 — DB-integration test for `bunkai_notify_bug_event`
// (migration 0056_bug_event_notifications.sql), the AFTER INSERT trigger on
// `activity_log` that turns BK-264's bug lifecycle events (`bug.assigned` /
// `bug.reassigned` / `bug.unassigned` / `bug.status_changed`, written by the
// REAL `bunkai_assign_bug` / `bunkai_transition_bug_status` RPCs, 0054) into
// `notifications` rows (BK-209, 0053). Mandatory per ADR-0012 / rpc-
// authorization.md §7 Stage 2: "the DB-integration test ships in the same
// slice as the migration, not a later one."
//
// `bunkai_notify_bug_event` takes NO caller-supplied parameter at all (it is
// a trigger, not an RPC) — there is nothing to actor-bind or spoof. What this
// suite actually proves is (a) the RECIPIENT rule, taken verbatim from
// BK-212's own business-rules.md/scope.md (never invented — see this
// migration's header for the exact quotes), and (b) result scoping: every
// row this trigger inserts carries the correct `workspace_id` /
// `recipient_user_id`, derived only from the triggering `activity_log` row
// and `public.bugs`/`public.projects`, never a caller-supplied value.
//
// Every mutation below (assign/reassign/unassign/transition) MUST go through
// the REAL RPCs as a REAL authenticated session — the trigger only fires on
// a genuine `activity_log` INSERT, and both RPCs are `grant execute ...
// to authenticated` only (no `service_role`), so QA_E2E (the project's
// declared automation identity, `live-ui-identity.md` §3) is the only actor
// this suite can use, exactly like `assign-bug-isolation.test.ts` and
// `transition-bug-status-isolation.test.ts` before it. That also means QA_E2E
// is ALWAYS the actor for every event this suite generates — recipient
// checks that need a genuine, non-excluded recipient are proven via a
// service-role read of the `notifications` row's own columns (workspace_id /
// recipient_user_id/payload), not by signing in as the recipient — the
// briefing for this slice explicitly scopes it this way: "you don't need to
// re-test RLS itself [BK-209 already does], just that your INSERT lands in
// the right row."
//
// FIXTURE SHAPE — one dedicated throwaway workspace (this project's Supabase
// instance is shared live infra — see `list-activity-isolation.test.ts`'s own
// header for why a brand-new workspace is the only way to make scoping
// assertions meaningful), 3 distinct real user ids other than QA_E2E
// (workspace owner + two eligible 'member' assignees, borrowed purely as
// DATA values, mirroring `assign-bug-isolation.test.ts`'s own pattern), and
// several throwaway bugs — one per recipient-rule scenario, so ordering
// across scenarios never matters (only the assign -> reassign -> unassign
// lifecycle on the SAME bug is intentionally sequential, mirroring
// `assign-bug-isolation.test.ts`'s own (e)/(f)/(g) chain).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const PREFIX = `bk212-notify-trigger-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface NotificationRow {
  id: string
  workspace_id: string
  recipient_user_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: {
    title?: string
    project_slug?: string
    assignee_user_id?: string | null
    previous_assignee_user_id?: string | null
    previous_status?: string
    status?: string
  }
  source_event_id: string | null
}

interface Fixture {
  workspaceId: string
  qaUserId: string
  ownerUserId: string // workspace owner FK, never a workspace_members row
  memberA: string // active 'member', eligible assignee
  memberB: string // active 'member', eligible assignee
  bugAssignFlowId: string // walks assign -> reassign -> unassign, in order
  bugStatusBothId: string // assignee = memberA, reporter = ownerUserId (both notified)
  bugStatusSelfAssigneeId: string // assignee = QA_E2E itself (self-exclusion)
  bugStatusSameReporterAssigneeId: string // reporter = assignee = memberA (dedupe)
  bugStatusNoAssigneeId: string // assignee null, reporter = ownerUserId
  bugStatusNoRecipientId: string // reporter = QA_E2E, assignee null, actor = QA_E2E (zero recipients)
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function assign(anon: ReturnType<typeof service>, bugId: string, assigneeUserId: string | null) {
  return anon.rpc('bunkai_assign_bug', { p_bug_id: bugId, p_assignee_user_id: assigneeUserId });
}

async function transition(anon: ReturnType<typeof service>, bugId: string, newStatus: string) {
  return anon.rpc('bunkai_transition_bug_status', { p_bug_id: bugId, p_new_status: newStatus });
}

// The activity_log row a given RPC call just wrote — the trigger's own
// input row, used to look up the notifications it should have produced by
// `source_event_id`, independent of timing/ordering.
async function latestActivityId(db: ReturnType<typeof service>, bugId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('id')
    .eq('entity_type', 'bug')
    .eq('entity_id', bugId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { throw error; }
  return (data as { id: string } | null)?.id ?? null;
}

async function withoutDisabledPreferences(db: ReturnType<typeof service>, userIds: string[]) {
  if (userIds.length === 0) { return userIds; }
  const { data, error } = await db
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('event_type', 'bug_lifecycle')
    .eq('enabled', false);
  if (error) { throw error; }
  const disabled = new Set((data ?? []).map(r => r.user_id as string));
  return userIds.filter(id => !disabled.has(id));
}

async function notificationsForEvent(db: ReturnType<typeof service>, sourceEventId: string) {
  const { data, error } = await db
    .from('notifications')
    .select('id, workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, source_event_id')
    .eq('source_event_id', sourceEventId);
  if (error) { throw error; }
  return (data ?? []) as unknown as NotificationRow[];
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-212 — bunkai_notify_bug_event trigger (recipient rule, idempotency, result scoping)', () => {
  beforeAll(async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    const qaUserId = signIn.user.id;

    const db = service();

    // Is the trigger's own producer RPC deployed? A nonexistent bug always
    // resolves to P0002 regardless of membership, so this is a safe probe
    // before any fixture exists (mirrors assign-bug-isolation.test.ts).
    const probe = await anon.rpc('bunkai_assign_bug', { p_bug_id: ZERO_UUID, p_assignee_user_id: null });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `bunkai_assign_bug is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0054_bug_assignment_status.sql.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    // BK-1217: the trigger now honours channel preferences, so a borrowed
    // recipient with Bug lifecycle switched off would make these assertions
    // depend on that person's settings. Only users with no disabled
    // bug_lifecycle row are eligible as DATA recipients here.
    const distinctIds = await withoutDisabledPreferences(
      db,
      [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId),
    );
    if (distinctIds.length < 3) {
      skipReason = 'need at least 3 distinct real user ids (other than QA_E2E) among active workspace members (seed state).';
      return;
    }
    const [ownerUserId, memberA, memberB] = distinctIds;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // memberA/memberB seeded as ordinary DATA members for the whole suite
    // (never authenticated as). QA_E2E itself is granted 'member' for the
    // whole suite too — this suite is not re-proving BK-264's own
    // non-member/Viewer rejection paths (already covered by
    // assign-bug-isolation.test.ts / transition-bug-status-isolation.test.ts),
    // so there is no per-test grant/revoke needed here.
    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: memberA, role: 'member', status: 'active' },
        { workspace_id: workspaceId, user_id: memberB, role: 'member', status: 'active' },
        { workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw seedMembersError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id, slug')
      .single();
    if (projectError) { throw projectError; }

    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id as string, path: `${PREFIX}-module`, name: `${PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    const bugRow = (title: string, extra: Record<string, unknown>) => ({
      workspace_id: workspaceId,
      project_id: project.id as string,
      module_id: module.id as string,
      title: `${PREFIX} ${title}`,
      severity: 'P2',
      created_by: ownerUserId,
      ...extra,
    });

    const { data: seededBugs, error: bugError } = await db
      .from('bugs')
      .insert([
        bugRow('assign flow', {}),
        bugRow('status both', { assignee_user_id: memberA }),
        bugRow('status self assignee', { assignee_user_id: qaUserId }),
        bugRow('status same reporter assignee', { created_by: memberA, assignee_user_id: memberA }),
        bugRow('status no assignee', {}),
        bugRow('status no recipient', { created_by: qaUserId }),
      ])
      .select('id, title');
    if (bugError) { throw bugError; }
    const byTitle = (suffix: string) => (seededBugs ?? []).find(b => (b.title as string).endsWith(suffix))!.id as string;

    fixture = {
      workspaceId,
      qaUserId,
      ownerUserId,
      memberA,
      memberB,
      bugAssignFlowId: byTitle('assign flow'),
      bugStatusBothId: byTitle('status both'),
      bugStatusSelfAssigneeId: byTitle('status self assignee'),
      bugStatusSameReporterAssigneeId: byTitle('status same reporter assignee'),
      bugStatusNoAssigneeId: byTitle('status no assignee'),
      bugStatusNoRecipientId: byTitle('status no recipient'),
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces (0001/0002/0046/0053) cover bugs/projects/
    // modules/workspace_members/activity_log/notifications — deleting the
    // throwaway workspace alone is sufficient.
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) assigning a bug notifies the new assignee only, with the expected snapshot payload', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    const { error } = await assign(anon, fixture.bugAssignFlowId, fixture.memberA);
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugAssignFlowId, 'bug.assigned');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.workspace_id).toBe(fixture.workspaceId);
    expect(row.recipient_user_id).toBe(fixture.memberA);
    expect(row.event_type).toBe('bug.assigned');
    expect(row.entity_type).toBe('bug');
    expect(row.entity_id).toBe(fixture.bugAssignFlowId);
    expect(row.payload.title).toBe(`${PREFIX} assign flow`);
    expect(row.payload.project_slug).toMatch(`${PREFIX}-project`);
    expect(row.payload.assignee_user_id).toBe(fixture.memberA);
    expect(row.payload.previous_assignee_user_id).toBeNull();
  });

  it('(b) reassigning notifies the new assignee only — the previous assignee gets no notification for this event', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Continues from (a): bugAssignFlowId is currently assigned to memberA.
    const { error } = await assign(anon, fixture.bugAssignFlowId, fixture.memberB);
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugAssignFlowId, 'bug.reassigned');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.memberB);
    expect(rows[0].payload.previous_assignee_user_id).toBe(fixture.memberA);
    expect(rows.some(r => r.recipient_user_id === fixture!.memberA)).toBe(false);
  });

  it('(c) unassigning produces no notification at all — no new assignee, not a status change', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Continues from (b): bugAssignFlowId is currently assigned to memberB.
    const { error } = await assign(anon, fixture.bugAssignFlowId, null);
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugAssignFlowId, 'bug.unassigned');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(0);
  });

  it('(d) a status change notifies both the reporter and the current assignee, excluding the actor', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // bugStatusBothId: assignee = memberA, reporter = ownerUserId, actor = QA_E2E.
    // Neither recipient is the actor, so both must be notified.
    const { error } = await transition(anon, fixture.bugStatusBothId, 'in_progress');
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugStatusBothId, 'bug.status_changed');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    const recipients = rows.map(r => r.recipient_user_id).sort();
    expect(recipients).toEqual([fixture.memberA, fixture.ownerUserId].sort());
    for (const row of rows) {
      expect(row.workspace_id).toBe(fixture.workspaceId);
      expect(row.event_type).toBe('bug.status_changed');
      expect(row.payload.previous_status).toBe('open');
      expect(row.payload.status).toBe('in_progress');
    }
  });

  it('(e) the actor is never notified of their own status change, even when they are the current assignee', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // bugStatusSelfAssigneeId: assignee = QA_E2E, reporter = ownerUserId,
    // actor = QA_E2E. The assignee IS the actor -> self-excluded; the
    // reporter is a distinct person -> still notified.
    const { error } = await transition(anon, fixture.bugStatusSelfAssigneeId, 'in_progress');
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugStatusSelfAssigneeId, 'bug.status_changed');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.ownerUserId);
    expect(rows.some(r => r.recipient_user_id === fixture!.qaUserId)).toBe(false);
  });

  it('(f) reporter and assignee being the same person yields exactly ONE notification, not two', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // bugStatusSameReporterAssigneeId: reporter = memberA, assignee = memberA,
    // actor = QA_E2E (distinct from memberA).
    const { error } = await transition(anon, fixture.bugStatusSameReporterAssigneeId, 'in_progress');
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugStatusSameReporterAssigneeId, 'bug.status_changed');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.memberA);
  });

  it('(g) a bug with no assignee notifies only the reporter on a status change', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // bugStatusNoAssigneeId: assignee = null, reporter = ownerUserId, actor = QA_E2E.
    const { error } = await transition(anon, fixture.bugStatusNoAssigneeId, 'in_progress');
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugStatusNoAssigneeId, 'bug.status_changed');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.ownerUserId);
  });

  it('(h) a bug with no assignee, reported by the actor, produces zero notifications (no valid recipient)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // bugStatusNoRecipientId: assignee = null, reporter = QA_E2E, actor = QA_E2E.
    // Reporter === actor (self-excluded), assignee is null (filtered) -> {}.
    const { error } = await transition(anon, fixture.bugStatusNoRecipientId, 'in_progress');
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, fixture.bugStatusNoRecipientId, 'bug.status_changed');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(0);
  });

  it('(i) idempotency: the same (source_event_id, recipient_user_id) pair can never be inserted twice', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const eventId = await latestActivityId(db, fixture.bugStatusBothId, 'bug.status_changed');
    expect(eventId).not.toBeNull();
    const existing = await notificationsForEvent(db, eventId!);
    expect(existing.length).toBeGreaterThan(0);
    const { recipient_user_id: recipientUserId } = existing[0];

    const { error } = await db.from('notifications').insert({
      workspace_id: fixture.workspaceId,
      recipient_user_id: recipientUserId,
      event_type: 'bug.status_changed',
      entity_type: 'bug',
      entity_id: fixture.bugStatusBothId,
      payload: {},
      source_event_id: eventId,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505'); // unique_violation on notifications_source_event_recipient_key
  });
});

// The suite never fails on missing migration / seed state / login — it says
// why and passes.
function warn() {
  console.warn(`[bug-event-trigger-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}

// ============================================================================
// BK-1217 — channel preferences at write time (migration 0107)
// ============================================================================
//
// AI Product Owner decision 13138 / AI Tech Lead decision 13139: In-app off +
// Email on stores an email-only row (`in_app_suppressed = true`) the
// recipient's own RLS-scoped session can never see; both channels off stores
// nothing for THAT recipient; the decision is a snapshot at event time.
//
// QA_E2E is the only identity this suite may sign in as (declared automation
// identity, real password path), and the assign/transition RPCs only run as an
// authenticated session, so QA_E2E is both actor and recipient here:
// assignment events have no actor exclusion, so QA_E2E self-assigning (the
// defect's own repro: "re-assign a bug to yourself") notifies QA_E2E.
// `bug.status_changed` always excludes the actor, so that one case writes the
// trigger's input row directly with the service role (actor = a borrowed
// owner, reporter = QA_E2E, assignee = a borrowed member). The REAL trigger
// still produces every notification; only the activity_log row is
// hand-shaped, and it proves the per-recipient `continue` leaves the other
// recipient of the same event untouched. QA_E2E's own bug_lifecycle
// preferences are toggled with the service role after a snapshot and restored
// in afterAll even when setup fails partway.
//
// FAIL-CLOSED GATE (precedent: lib/runs/compare-isolation.test.ts). This block
// is SKIPPED, with a loud warning, only when there is no database environment
// or `bunkai_notification_channel_enabled` does not exist (migration 0107 not
// applied yet). Everything else (missing automation identity, failed login,
// fixture seed failure, an unexpected probe answer) FAILS. Every test asserts
// at least once.

const hasDbEnv = Boolean(url && serviceKey);
const PREFS_PREFIX = `bk1217-bug-prefs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let prefsDeployed = false;
if (hasDbEnv) {
  const probe = await service().rpc('bunkai_notification_channel_enabled', {
    p_user_id: ZERO_UUID,
    p_event_type: 'bug.assigned',
    p_channel: 'in_app',
  });
  const code = probe.error?.code ?? 'no error';
  if (!probe.error && probe.data === true) {
    prefsDeployed = true;
  }
  else if (code === 'PGRST202' || code === '42883') {
    console.warn(`[bug-event-trigger-isolation] BK-1217 block SKIPPED: bunkai_notification_channel_enabled is not deployed (${code}). Apply migration 0107_notification_inapp_suppression.sql. No BK-1217 assertion in this file ran.`);
  }
  else {
    throw new Error(`[bug-event-trigger-isolation] unexpected answer from the BK-1217 deploy probe (${code}: ${probe.error?.message ?? JSON.stringify(probe.data)}). Expected true (deployed) or PGRST202/42883 (not deployed).`);
  }
}
const describeIfPrefsDeployed = hasDbEnv && prefsDeployed ? describe : describe.skip;

interface PreferenceRow { event_type: string, channel: string, enabled: boolean }
interface PrefsFixture {
  workspaceId: string
  projectId: string
  moduleId: string
  qaUserId: string
  ownerUserId: string // workspace owner + actor of the hand-shaped status event
  memberA: string // co-recipient with default preferences
}

let prefsFixture: PrefsFixture | null = null;
let qaClient: ReturnType<typeof service> | null = null;
let prefsSnapshot: { userId: string, rows: PreferenceRow[] } | null = null;
let prefsWorkspaceId: string | null = null;

function needPrefsFixture(): PrefsFixture {
  if (!prefsFixture || !qaClient) {
    throw new Error('[bug-event-trigger-isolation] the BK-1217 fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return prefsFixture;
}

async function setBugPreferences(userId: string, channels: { in_app: boolean, email: boolean }) {
  const { error } = await service()
    .from('notification_preferences')
    .upsert([
      { user_id: userId, event_type: 'bug_lifecycle', channel: 'in_app', enabled: channels.in_app },
      { user_id: userId, event_type: 'bug_lifecycle', channel: 'email', enabled: channels.email },
    ], { onConflict: 'user_id,event_type,channel' });
  if (error) { throw new Error(`[bug-event-trigger-isolation] could not set bug_lifecycle preferences: ${error.message}`); }
}

async function clearBugPreferences(userId: string) {
  const { error } = await service().from('notification_preferences').delete().eq('user_id', userId).eq('event_type', 'bug_lifecycle');
  if (error) { throw new Error(`[bug-event-trigger-isolation] could not clear bug_lifecycle preferences: ${error.message}`); }
}

async function seedPrefsBug(fx: PrefsFixture, key: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await service()
    .from('bugs')
    .insert({
      workspace_id: fx.workspaceId,
      project_id: fx.projectId,
      module_id: fx.moduleId,
      title: `${PREFS_PREFIX} ${key}`,
      severity: 'P2',
      created_by: fx.ownerUserId,
      ...extra,
    })
    .select('id')
    .single();
  if (error) { throw new Error(`[bug-event-trigger-isolation] fixture seed failed at "bug ${key}": ${error.message}`); }
  return data.id as string;
}

async function rowsForEvent(sourceEventId: string) {
  const { data, error } = await service()
    .from('notifications')
    .select('id, recipient_user_id, in_app_suppressed, emailed_at')
    .eq('source_event_id', sourceEventId);
  if (error) { throw error; }
  return (data ?? []) as { id: string, recipient_user_id: string, in_app_suppressed: boolean, emailed_at: string | null }[];
}

async function visibleToQa(notificationId: string) {
  const { data, error } = await qaClient!.from('notifications').select('id').eq('id', notificationId);
  expect(error).toBeNull();
  return (data ?? []).length > 0;
}

async function qaSelfAssign(bugId: string, action: 'bug.assigned' | 'bug.reassigned', fx: PrefsFixture) {
  const { error } = await assign(qaClient!, bugId, fx.qaUserId);
  // The assignment itself must never fail because of the preference gate.
  expect(error).toBeNull();
  const eventId = await latestActivityId(service(), bugId, action);
  expect(eventId).not.toBeNull();
  return eventId!;
}

describeIfPrefsDeployed('BK-1217 — bunkai_notify_bug_event honours bug_lifecycle channel preferences per recipient', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[bug-event-trigger-isolation] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present: the bug RPCs and the recipient-visibility check both need a real session.');
    }
    const client = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[bug-event-trigger-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    qaClient = client;
    const qaUserId = signIn.user.id;
    const db = service();

    const { data: existing, error: existingError } = await db
      .from('notification_preferences')
      .select('event_type, channel, enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'bug_lifecycle');
    if (existingError) { throw new Error(`[bug-event-trigger-isolation] could not snapshot QA_E2E preferences: ${existingError.message}`); }
    prefsSnapshot = { userId: qaUserId, rows: (existing ?? []) as PreferenceRow[] };

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .neq('user_id', qaUserId)
      .limit(20);
    if (membersError) { throw new Error(`[bug-event-trigger-isolation] could not read workspace members: ${membersError.message}`); }
    const borrowed = await withoutDisabledPreferences(db, [...new Set((members ?? []).map(m => m.user_id as string))]);
    if (borrowed.length < 2) {
      throw new Error('[bug-event-trigger-isolation] need 2 active workspace members other than QA_E2E with default bug_lifecycle preferences (seed state).');
    }
    const [ownerUserId, memberA] = borrowed;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFS_PREFIX}-ws`, name: PREFS_PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw new Error(`[bug-event-trigger-isolation] fixture seed failed at "workspace": ${workspaceError.message}`); }
    prefsWorkspaceId = workspace.id as string;

    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: prefsWorkspaceId, user_id: qaUserId, role: 'member', status: 'active' },
        { workspace_id: prefsWorkspaceId, user_id: memberA, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw new Error(`[bug-event-trigger-isolation] fixture seed failed at "members": ${seedMembersError.message}`); }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: prefsWorkspaceId, slug: `${PREFS_PREFIX}-project`, name: `${PREFS_PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw new Error(`[bug-event-trigger-isolation] fixture seed failed at "project": ${projectError.message}`); }

    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id as string, path: `${PREFS_PREFIX}-module`, name: `${PREFS_PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw new Error(`[bug-event-trigger-isolation] fixture seed failed at "module": ${moduleError.message}`); }

    prefsFixture = {
      workspaceId: prefsWorkspaceId,
      projectId: project.id as string,
      moduleId: module.id as string,
      qaUserId,
      ownerUserId,
      memberA,
    };
  });

  afterAll(async () => {
    const db = service();
    if (prefsSnapshot) {
      await db.from('notification_preferences').delete().eq('user_id', prefsSnapshot.userId).eq('event_type', 'bug_lifecycle');
      if (prefsSnapshot.rows.length > 0) {
        await db.from('notification_preferences').insert(prefsSnapshot.rows.map(r => ({ user_id: prefsSnapshot!.userId, ...r })));
      }
    }
    if (prefsWorkspaceId) {
      // Cascades cover bugs/projects/modules/members/activity_log/notifications.
      await db.from('workspaces').delete().eq('id', prefsWorkspaceId);
    }
  });

  it('default (no preference rows): a self-assignment is stored visible and the recipient sees it', async () => {
    const fx = needPrefsFixture();
    await clearBugPreferences(fx.qaUserId);
    const bugId = await seedPrefsBug(fx, 'default');

    const eventId = await qaSelfAssign(bugId, 'bug.assigned', fx);
    const rows = await rowsForEvent(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fx.qaUserId);
    expect(rows[0].in_app_suppressed).toBe(false);
    expect(await visibleToQa(rows[0].id)).toBe(true);
  });

  it('In-app off + Email on: bug.assigned is stored email-only and hidden from the recipient', async () => {
    const fx = needPrefsFixture();
    await setBugPreferences(fx.qaUserId, { in_app: false, email: true });
    const bugId = await seedPrefsBug(fx, 'assigned-inapp-off');

    const eventId = await qaSelfAssign(bugId, 'bug.assigned', fx);
    const rows = await rowsForEvent(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].in_app_suppressed).toBe(true);
    expect(rows[0].emailed_at).toBeNull();
    expect(await visibleToQa(rows[0].id)).toBe(false);
  });

  it('In-app off + Email on: bug.reassigned to self is stored email-only and hidden from the recipient', async () => {
    const fx = needPrefsFixture();
    await setBugPreferences(fx.qaUserId, { in_app: false, email: true });
    const bugId = await seedPrefsBug(fx, 'reassigned-inapp-off', { assignee_user_id: fx.memberA });

    const eventId = await qaSelfAssign(bugId, 'bug.reassigned', fx);
    const rows = await rowsForEvent(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fx.qaUserId);
    expect(rows[0].in_app_suppressed).toBe(true);
    expect(await visibleToQa(rows[0].id)).toBe(false);
  });

  it('both channels off: a self-assignment stores nothing, and the assignment still succeeds', async () => {
    const fx = needPrefsFixture();
    await setBugPreferences(fx.qaUserId, { in_app: false, email: false });
    const bugId = await seedPrefsBug(fx, 'both-off');

    const eventId = await qaSelfAssign(bugId, 'bug.assigned', fx);
    expect(await rowsForEvent(eventId)).toHaveLength(0);
  });

  it('snapshot at event time: re-enabling In-app later leaves an already-suppressed row hidden', async () => {
    const fx = needPrefsFixture();
    await setBugPreferences(fx.qaUserId, { in_app: false, email: true });
    const bugId = await seedPrefsBug(fx, 'snapshot');
    const eventId = await qaSelfAssign(bugId, 'bug.assigned', fx);
    const rows = await rowsForEvent(eventId);
    expect(rows).toHaveLength(1);

    await setBugPreferences(fx.qaUserId, { in_app: true, email: true });
    expect(await visibleToQa(rows[0].id)).toBe(false);
  });

  for (const scenario of [
    { name: 'both channels off', prefs: { in_app: false, email: false }, qaRow: 'none' as const },
    { name: 'In-app off + Email on', prefs: { in_app: false, email: true }, qaRow: 'suppressed' as const },
  ]) {
    it(`bug.status_changed, ${scenario.name} for one recipient: that recipient is gated, the other recipient is untouched`, async () => {
      const fx = needPrefsFixture();
      await setBugPreferences(fx.qaUserId, scenario.prefs);
      // Reporter = QA_E2E, assignee = memberA, actor = ownerUserId (neither recipient).
      const bugId = await seedPrefsBug(fx, `status-${scenario.qaRow}`, { created_by: fx.qaUserId, assignee_user_id: fx.memberA });

      const db = service();
      const { data: event, error } = await db
        .from('activity_log')
        .insert({
          workspace_id: fx.workspaceId,
          actor_user_id: fx.ownerUserId,
          entity_type: 'bug',
          entity_id: bugId,
          action: 'bug.status_changed',
          payload: { previous_status: 'open', status: 'in_progress', assignee_user_id: fx.memberA },
        })
        .select('id')
        .single();
      expect(error).toBeNull();

      const rows = await rowsForEvent(event!.id as string);
      const memberRow = rows.find(r => r.recipient_user_id === fx.memberA);
      const qaRow = rows.find(r => r.recipient_user_id === fx.qaUserId);
      expect(memberRow).toBeDefined();
      expect(memberRow!.in_app_suppressed).toBe(false);
      if (scenario.qaRow === 'none') {
        expect(qaRow).toBeUndefined();
        expect(rows).toHaveLength(1);
      }
      else {
        expect(qaRow).toBeDefined();
        expect(qaRow!.in_app_suppressed).toBe(true);
        expect(await visibleToQa(qaRow!.id)).toBe(false);
        expect(rows).toHaveLength(2);
      }
    });
  }
});
