import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

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
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId);
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
