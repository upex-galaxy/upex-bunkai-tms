import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-211 — DB-integration test for `bunkai_notify_run_event`
// (migration 0066_run_event_notifications.sql), the AFTER INSERT trigger on
// `activity_log` that turns BK-39's `bunkai_finish_run` (0037_run_finish.sql)
// and BK-36's `bunkai_abort_run` (0036_run_abort.sql) terminal events into
// `notifications` rows (BK-209, 0053), gated by the channel-aware
// self-suppression rule 0067_run_finish_abort_via.sql plumbs in (12196
// supersedes 12173's identity-only predicate; 12198 scores how to pay for
// it — Candidate A, `p_via`). Mandatory per ADR-0012 / rpc-authorization.md
// §7 Stage 2: "the DB-integration test ships in the same slice as the
// migration, not a later one."
//
// MIGRATION GATE (see this run's report): migrations 0066 and 0067 are
// WRITTEN but NOT APPLIED — `.agents/project.yaml` autonomous_delivery.
// migrations: autonomous covers additive DDL only, and 0067 rewrites two
// live SECURITY DEFINER functions, so it stops for human approval. Every
// test below therefore probes deployment first and SKIPS LOUDLY, naming the
// exact migrations to apply, exactly like `bug-event-trigger-isolation.
// test.ts` does for 0056 and `report-rpc.test.ts` does for 0041. This is the
// literal DB-backed assertion the migration gate makes impossible right now
// — recorded here, not silently weakened into something that would pass
// against the OLD 3-argument `bunkai_finish_run`/`bunkai_abort_run`.
//
// REAL PRODUCTION WRITE PATH: every mutation below goes through the REAL
// `bunkai_finish_run` / `bunkai_abort_run` RPCs (service-role client, actor
// id passed as the explicit-actor-contract parameter these RPCs already
// take — the same pattern `lib/runs/report-rpc.test.ts` and every other
// run-domain DB-integration suite in this repo uses; unlike the bug-event
// producer, both RPCs are `grant ... to authenticated, service_role`, so a
// signed-in session is not required to exercise them for real). The `runs`
// header row itself is fixture-seeded directly (mirrors `report-rpc.test.ts`
// — `bunkai_create_run` is a separate, already-covered RPC, not the one
// this suite is proving), but every `activity_log` row this suite reads is
// produced by the REAL RPC's own `insert`, and every `notifications` row is
// produced by the REAL trigger — never a hand-shaped `activity_log` insert.
//
// SCOPE NOTE: this suite does not re-drive `bunkai_list_notifications` (RLS
// read-path) — that is already `list-notifications-isolation.test.ts`'s job
// and BK-212's own trigger suite made the identical scoping choice (assert
// the inserted row's own `workspace_id`/`recipient_user_id` via a
// service-role read, not by signing in as the recipient).
//
// FIXTURE SHAPE: one throwaway workspace + project + environment + module +
// test (this project's Supabase instance is shared live infra — a brand-new
// workspace is the only way to make scoping assertions meaningful, mirrors
// `bug-event-trigger-isolation.test.ts`'s own header), 2 distinct real user
// ids (starter + teammate) borrowed as DATA values from active workspace
// membership elsewhere, one throwaway `runs` row per scenario so ordering
// across scenarios never matters.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const PREFIX = `bk211-run-notify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface NotificationRow {
  id: string
  workspace_id: string
  recipient_user_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: { title?: string, project_slug?: string, verdict?: string, reason?: string }
  source_event_id: string | null
}

interface Fixture {
  workspaceId: string
  projectId: string
  projectSlug: string
  environmentId: string
  testId: string
  starterUserId: string
  teammateUserId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function seedRun(
  db: ReturnType<typeof service>,
  fx: Fixture,
  opts: { key: string, executorUserId: string | null },
) {
  const { data, error } = await db
    .from('runs')
    .insert({
      workspace_id: fx.workspaceId,
      project_id: fx.projectId,
      test_id: fx.testId,
      environment_id: fx.environmentId,
      status: 'running',
      executor_mode: 'human',
      executor_user_id: opts.executorUserId,
      start_token: `${PREFIX}-${opts.key}`,
      test_title: `${PREFIX} test`,
    })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id as string;
}

async function latestActivityId(db: ReturnType<typeof service>, runId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('id')
    .eq('entity_type', 'run')
    .eq('entity_id', runId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { throw error; }
  return (data as { id: string } | null)?.id ?? null;
}

async function withoutDisabledPreferences(db: ReturnType<typeof service>, userIds: string[], category: 'run_lifecycle' | 'bug_lifecycle') {
  if (userIds.length === 0) { return userIds; }
  const { data, error } = await db
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('event_type', category)
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
let skipReason: string | null = null;

describeOrSkip('BK-211 — bunkai_notify_run_event trigger (channel-aware suppression, idempotency, result scoping)', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the ratified shape deployed? `p_via` must exist on `bunkai_finish_run`
    //    — probe with a nonexistent Run: a deployed 4-arg RPC answers P0002
    //    (run_not_found); the OLD 3-arg RPC (or an undeployed one) answers
    //    PGRST202 ("Could not find the function ... with these parameters").
    const probe = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: ZERO_UUID,
      p_run_id: ZERO_UUID,
      p_verdict: 'passed',
      p_via: 'cookie',
    });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `bunkai_finish_run(p_via) is not deployed yet (${probe.error.code ?? 'unknown'}: ${probe.error.message ?? ''}). Apply migrations 0066_run_event_notifications.sql AND 0067_run_finish_abort_via.sql (in that order — 0066 alone leaves the trigger reading a 'via' key nothing writes).`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    // BK-1217: the trigger now honours channel preferences, so a borrowed
    // starter with Run lifecycle switched off would make these assertions
    // depend on that person's settings. Only users with no disabled
    // run_lifecycle row are eligible as DATA recipients here.
    const distinctIds = await withoutDisabledPreferences(db, [...new Set((members ?? []).map(m => m.user_id as string))], 'run_lifecycle');
    if (distinctIds.length < 2) {
      skipReason = 'need at least 2 distinct real user ids among active workspace members (seed state).';
      return;
    }
    const [starterUserId, teammateUserId] = distinctIds;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: starterUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: starterUserId, role: 'member', status: 'active' },
        { workspace_id: workspaceId, user_id: teammateUserId, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw seedMembersError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id, slug')
      .single();
    if (projectError) { throw projectError; }

    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: project.id as string, name: 'Staging' })
      .select('id')
      .single();
    if (environmentError) { throw environmentError; }

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} test`, created_by: starterUserId })
      .select('id')
      .single();
    if (testError) { throw testError; }

    fixture = {
      workspaceId,
      projectId: project.id as string,
      projectSlug: project.slug as string,
      environmentId: environment.id as string,
      testId: test.id as string,
      starterUserId,
      teammateUserId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces cover projects/environments/workspace_members/
    // runs/activity_log/notifications — deleting the throwaway workspace
    // alone is sufficient (mirrors bug-event-trigger-isolation.test.ts).
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
    await db.from('tests').delete().eq('id', fixture.testId);
  });

  it('(a) a teammate finishing the starter\'s run notifies her, with the ratified payload shape', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'a-teammate-finish', executorUserId: fixture.starterUserId });
    const { error } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.teammateUserId,
      p_run_id: runId,
      p_verdict: 'passed',
      p_via: 'cookie',
    });
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.workspace_id).toBe(fixture.workspaceId);
    expect(row.recipient_user_id).toBe(fixture.starterUserId);
    expect(row.event_type).toBe('run.finished');
    expect(row.entity_type).toBe('run');
    expect(row.entity_id).toBe(runId);
    expect(row.payload.title).toBe(`${PREFIX} test`);
    expect(row.payload.project_slug).toBe(fixture.projectSlug);
    expect(row.payload.verdict).toBe('passed');
    expect(row.source_event_id).toBe(eventId);
  });

  it('(b) AC5 — the starter finishing her own run through an interactive session produces zero notifications', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'b-self-cookie', executorUserId: fixture.starterUserId });
    const { error } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.starterUserId,
      p_run_id: runId,
      p_verdict: 'passed',
      p_via: 'cookie',
    });
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(0);
  });

  // The property 12196/12198 actually add: identity alone is NOT sufficient
  // to suppress. This is AC1/AC4's headline delegation case — an agent
  // finishing Elena's run while authenticating AS Elena (ADR-0001 Path B, a
  // PAT impersonates its owning user) must still notify her, because the
  // call did not arrive through an interactive cookie session. A suite that
  // only asserted actor-identity parity (12173's original predicate) would
  // pass here for the wrong reason; this is the case that would have caught it.
  it('(c) the starter finishing her own run via a non-interactive (bearer) call still notifies her', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'c-self-bearer', executorUserId: fixture.starterUserId });
    const { error } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.starterUserId,
      p_run_id: runId,
      p_verdict: 'failed',
      p_via: 'bearer',
    });
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.starterUserId);
    expect(rows[0].payload.verdict).toBe('failed');
  });

  // The safe default (12198): an omitted `via` reads as non-interactive
  // (NULL is never 'cookie') and therefore notifies — a direct RPC caller
  // that never passes `p_via` at all (e.g. a PAT hitting the RPC without
  // going through the HTTP route's `principal.via` plumbing) must not
  // silently suppress a real self-finish either.
  it('(c2) the starter finishing her own run with `via` entirely omitted still notifies her (safe default)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'c2-self-omitted', executorUserId: fixture.starterUserId });
    const { error } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.starterUserId,
      p_run_id: runId,
      p_verdict: 'passed',
    });
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fixture.starterUserId);
  });

  it('(d) a teammate aborting the starter\'s run carries the reason in the payload', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'd-abort', executorUserId: fixture.starterUserId });
    const { error } = await db.rpc('bunkai_abort_run', {
      p_actor_user_id: fixture.teammateUserId,
      p_run_id: runId,
      p_reason: 'Wrong build deployed',
      p_via: 'cookie',
    });
    expect(error).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.aborted');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('run.aborted');
    expect(rows[0].payload.reason).toBe('Wrong build deployed');
    expect(rows[0].payload.title).toBe(`${PREFIX} test`);
  });

  it('(e) a run whose starter is null (account deleted) produces zero notifications, and the finish still succeeds', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'e-null-recipient', executorUserId: null });
    const { data, error } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.teammateUserId,
      p_run_id: runId,
      p_verdict: 'passed',
      p_via: 'cookie',
    });
    // The regression test for the NOT NULL recipient column: a producer
    // built to insert a null recipient would raise 23502 inside the trigger
    // and roll back this finish. It must not.
    expect(error).toBeNull();
    expect((data as { status?: string } | null)?.status).toBe('passed');

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();

    const rows = await notificationsForEvent(db, eventId!);
    expect(rows).toHaveLength(0);
  });

  it('(f) idempotency: the same (source_event_id, recipient_user_id) pair can never be inserted twice', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runId = await seedRun(db, fixture, { key: 'f-idempotency', executorUserId: fixture.starterUserId });
    const { error: finishError } = await db.rpc('bunkai_finish_run', {
      p_actor_user_id: fixture.teammateUserId,
      p_run_id: runId,
      p_verdict: 'passed',
      p_via: 'cookie',
    });
    expect(finishError).toBeNull();

    const eventId = await latestActivityId(db, runId, 'run.finished');
    expect(eventId).not.toBeNull();
    const existing = await notificationsForEvent(db, eventId!);
    expect(existing).toHaveLength(1);

    const { error } = await db.from('notifications').insert({
      workspace_id: fixture.workspaceId,
      recipient_user_id: existing[0].recipient_user_id,
      event_type: 'run.finished',
      entity_type: 'run',
      entity_id: runId,
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
  console.warn(`[run-event-trigger-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}

// ============================================================================
// BK-1217 — channel preferences at write time (migration 0107)
// ============================================================================
//
// AI Product Owner decision 13138 / AI Tech Lead decision 13139: In-app off +
// Email on stores an email-only row (`in_app_suppressed = true`) that the
// recipient's own RLS-scoped session can never see; both channels off stores
// nothing; the decision is a snapshot at event time.
//
// "The recipient sees nothing" can only be proven through a real session, and
// the only identity this suite may sign in as is the declared automation
// identity (QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD, `.agents/project.yaml`
// -> testing.automation_identity, through the app's real password path). So
// QA_E2E is the run STARTER (the recipient) here, and a borrowed teammate is
// the actor that finishes or aborts the run through the real RPCs. QA_E2E's
// own run_lifecycle preferences are toggled with the service role (fixture
// seed, sanctioned) after a snapshot, and restored in afterAll even when
// setup fails partway (see notification-digest-candidates-isolation.test.ts
// for the incident that rule comes from).
//
// FAIL-CLOSED GATE (precedent: lib/runs/compare-isolation.test.ts). This block
// is SKIPPED, with a loud warning, in exactly two cases: no database
// environment at all, or the database answers that
// `bunkai_notification_channel_enabled` does not exist (migration 0107 not
// applied yet). Every other problem (missing automation identity, failed
// login, a fixture that cannot be seeded, an unexpected probe answer) FAILS.
// Every test asserts at least once (`expect.hasAssertions()`).

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const PREFS_PREFIX = `bk1217-run-prefs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let prefsDeployed = false;
if (hasEnv) {
  const probe = await service().rpc('bunkai_notification_channel_enabled', {
    p_user_id: ZERO_UUID,
    p_event_type: 'run.finished',
    p_channel: 'in_app',
  });
  const code = probe.error?.code ?? 'no error';
  if (!probe.error && probe.data === true) {
    prefsDeployed = true;
  }
  else if (code === 'PGRST202' || code === '42883') {
    console.warn(`[run-event-trigger-isolation] BK-1217 block SKIPPED: bunkai_notification_channel_enabled is not deployed (${code}). Apply migration 0107_notification_inapp_suppression.sql. No BK-1217 assertion in this file ran.`);
  }
  else {
    throw new Error(`[run-event-trigger-isolation] unexpected answer from the BK-1217 deploy probe (${code}: ${probe.error?.message ?? JSON.stringify(probe.data)}). Expected true (deployed) or PGRST202/42883 (not deployed).`);
  }
}
const describeIfPrefsDeployed = hasEnv && prefsDeployed ? describe : describe.skip;

interface PreferenceRow { event_type: string, channel: string, enabled: boolean }
interface PrefsFixture extends Fixture { qaUserId: string }

let prefsFixture: PrefsFixture | null = null;
let qaClient: ReturnType<typeof service> | null = null;
let prefsSnapshot: { userId: string, rows: PreferenceRow[] } | null = null;
let prefsWorkspaceId: string | null = null;
let prefsTestId: string | null = null;

function needPrefsFixture(): PrefsFixture {
  if (!prefsFixture || !qaClient) {
    throw new Error('[run-event-trigger-isolation] the BK-1217 fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return prefsFixture;
}

async function setRunPreferences(userId: string, channels: { in_app: boolean, email: boolean }) {
  const { error } = await service()
    .from('notification_preferences')
    .upsert([
      { user_id: userId, event_type: 'run_lifecycle', channel: 'in_app', enabled: channels.in_app },
      { user_id: userId, event_type: 'run_lifecycle', channel: 'email', enabled: channels.email },
    ], { onConflict: 'user_id,event_type,channel' });
  if (error) { throw new Error(`[run-event-trigger-isolation] could not set run_lifecycle preferences: ${error.message}`); }
}

async function clearRunPreferences(userId: string) {
  const { error } = await service().from('notification_preferences').delete().eq('user_id', userId).eq('event_type', 'run_lifecycle');
  if (error) { throw new Error(`[run-event-trigger-isolation] could not clear run_lifecycle preferences: ${error.message}`); }
}

async function suppressionRow(sourceEventId: string) {
  const { data, error } = await service()
    .from('notifications')
    .select('id, recipient_user_id, in_app_suppressed, emailed_at')
    .eq('source_event_id', sourceEventId);
  if (error) { throw error; }
  return (data ?? []) as { id: string, recipient_user_id: string, in_app_suppressed: boolean, emailed_at: string | null }[];
}

async function visibleToRecipient(notificationId: string) {
  const { data, error } = await qaClient!.from('notifications').select('id').eq('id', notificationId);
  expect(error).toBeNull();
  return (data ?? []).length > 0;
}

// Finishes (or aborts) a fresh run started by QA_E2E, as the borrowed
// teammate, through the real RPC; returns the activity_log id it wrote.
async function closeQaRun(fx: PrefsFixture, opts: { key: string, action: 'run.finished' | 'run.aborted' }) {
  const db = service();
  const runId = await seedRun(db, fx, { key: `bk1217-${opts.key}`, executorUserId: fx.qaUserId });
  const { error } = opts.action === 'run.finished'
    ? await db.rpc('bunkai_finish_run', { p_actor_user_id: fx.teammateUserId, p_run_id: runId, p_verdict: 'passed', p_via: 'cookie' })
    : await db.rpc('bunkai_abort_run', { p_actor_user_id: fx.teammateUserId, p_run_id: runId, p_reason: 'BK-1217 abort', p_via: 'cookie' });
  // The finish/abort itself must never fail because of the preference gate.
  expect(error).toBeNull();
  const eventId = await latestActivityId(db, runId, opts.action);
  expect(eventId).not.toBeNull();
  return eventId!;
}

describeIfPrefsDeployed('BK-1217 — bunkai_notify_run_event honours run_lifecycle channel preferences at write time', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[run-event-trigger-isolation] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present: only a real session proves the recipient cannot see a suppressed row.');
    }
    const client = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[run-event-trigger-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    qaClient = client;
    const qaUserId = signIn.user.id;
    const db = service();

    // Snapshot BEFORE any mutation, so afterAll can always restore it.
    const { data: existing, error: existingError } = await db
      .from('notification_preferences')
      .select('event_type, channel, enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'run_lifecycle');
    if (existingError) { throw new Error(`[run-event-trigger-isolation] could not snapshot QA_E2E preferences: ${existingError.message}`); }
    prefsSnapshot = { userId: qaUserId, rows: (existing ?? []) as PreferenceRow[] };

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .neq('user_id', qaUserId)
      .limit(1)
      .maybeSingle();
    if (membersError || !members) {
      throw new Error(`[run-event-trigger-isolation] need one active workspace member other than QA_E2E to act as the teammate (${membersError?.message ?? 'none found'}).`);
    }
    const teammateUserId = members.user_id as string;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFS_PREFIX}-ws`, name: PREFS_PREFIX, owner_user_id: teammateUserId })
      .select('id')
      .single();
    if (workspaceError) { throw new Error(`[run-event-trigger-isolation] fixture seed failed at "workspace": ${workspaceError.message}`); }
    prefsWorkspaceId = workspace.id as string;

    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: prefsWorkspaceId, user_id: qaUserId, role: 'member', status: 'active' },
        { workspace_id: prefsWorkspaceId, user_id: teammateUserId, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw new Error(`[run-event-trigger-isolation] fixture seed failed at "members": ${seedMembersError.message}`); }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: prefsWorkspaceId, slug: `${PREFS_PREFIX}-project`, name: `${PREFS_PREFIX} project` })
      .select('id, slug')
      .single();
    if (projectError) { throw new Error(`[run-event-trigger-isolation] fixture seed failed at "project": ${projectError.message}`); }

    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: project.id as string, name: 'Staging' })
      .select('id')
      .single();
    if (environmentError) { throw new Error(`[run-event-trigger-isolation] fixture seed failed at "environment": ${environmentError.message}`); }

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: prefsWorkspaceId, title: `${PREFIX} test`, created_by: qaUserId })
      .select('id')
      .single();
    if (testError) { throw new Error(`[run-event-trigger-isolation] fixture seed failed at "test": ${testError.message}`); }
    prefsTestId = test.id as string;

    prefsFixture = {
      workspaceId: prefsWorkspaceId,
      projectId: project.id as string,
      projectSlug: project.slug as string,
      environmentId: environment.id as string,
      testId: prefsTestId,
      starterUserId: qaUserId,
      teammateUserId,
      qaUserId,
    };
  });

  afterAll(async () => {
    const db = service();
    // Restore first, keyed on the snapshot alone (not on the fixture), so a
    // crash partway through setup never leaves QA_E2E's preferences changed.
    if (prefsSnapshot) {
      await db.from('notification_preferences').delete().eq('user_id', prefsSnapshot.userId).eq('event_type', 'run_lifecycle');
      if (prefsSnapshot.rows.length > 0) {
        await db.from('notification_preferences').insert(prefsSnapshot.rows.map(r => ({ user_id: prefsSnapshot!.userId, ...r })));
      }
    }
    await db.from('runs').delete().like('start_token', `${PREFIX}-bk1217-%`);
    if (prefsWorkspaceId) {
      await db.from('workspaces').delete().eq('id', prefsWorkspaceId);
    }
    if (prefsTestId) {
      await db.from('tests').delete().eq('id', prefsTestId);
    }
  });

  it('default (no preference rows): the row is stored visible and the recipient sees it', async () => {
    const fx = needPrefsFixture();
    await clearRunPreferences(fx.qaUserId);

    const eventId = await closeQaRun(fx, { key: 'default', action: 'run.finished' });
    const rows = await suppressionRow(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_user_id).toBe(fx.qaUserId);
    expect(rows[0].in_app_suppressed).toBe(false);
    expect(await visibleToRecipient(rows[0].id)).toBe(true);
  });

  it('In-app off + Email on: the row is stored email-only and the recipient\'s own session cannot see it', async () => {
    const fx = needPrefsFixture();
    await setRunPreferences(fx.qaUserId, { in_app: false, email: true });

    const eventId = await closeQaRun(fx, { key: 'inapp-off', action: 'run.finished' });
    const rows = await suppressionRow(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].in_app_suppressed).toBe(true);
    expect(rows[0].emailed_at).toBeNull();
    expect(await visibleToRecipient(rows[0].id)).toBe(false);

    // The inbox RPC (items + unread_count) runs under the same RLS.
    const { data, error } = await qaClient!.rpc('bunkai_list_notifications', { p_workspace_id: fx.workspaceId, p_limit: 50 });
    expect(error).toBeNull();
    const page = data as { items: { id: string }[] };
    expect(page.items.map(i => i.id)).not.toContain(rows[0].id);
  });

  it('In-app off + Email on also applies to run.aborted', async () => {
    const fx = needPrefsFixture();
    await setRunPreferences(fx.qaUserId, { in_app: false, email: true });

    const eventId = await closeQaRun(fx, { key: 'abort-inapp-off', action: 'run.aborted' });
    const rows = await suppressionRow(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].in_app_suppressed).toBe(true);
    expect(await visibleToRecipient(rows[0].id)).toBe(false);
  });

  it('both channels off: nothing is stored, and the finish still succeeds', async () => {
    const fx = needPrefsFixture();
    await setRunPreferences(fx.qaUserId, { in_app: false, email: false });

    const eventId = await closeQaRun(fx, { key: 'both-off', action: 'run.finished' });
    expect(await suppressionRow(eventId)).toHaveLength(0);
  });

  it('In-app on + Email off: the row is stored visible', async () => {
    const fx = needPrefsFixture();
    await setRunPreferences(fx.qaUserId, { in_app: true, email: false });

    const eventId = await closeQaRun(fx, { key: 'email-off', action: 'run.finished' });
    const rows = await suppressionRow(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].in_app_suppressed).toBe(false);
    expect(await visibleToRecipient(rows[0].id)).toBe(true);
  });

  it('snapshot at event time: re-enabling In-app later leaves an already-suppressed row hidden', async () => {
    const fx = needPrefsFixture();
    await setRunPreferences(fx.qaUserId, { in_app: false, email: true });
    const eventId = await closeQaRun(fx, { key: 'snapshot', action: 'run.finished' });
    const rows = await suppressionRow(eventId);
    expect(rows).toHaveLength(1);

    await setRunPreferences(fx.qaUserId, { in_app: true, email: true });
    expect(await visibleToRecipient(rows[0].id)).toBe(false);
    const after = await suppressionRow(eventId);
    expect(after[0].in_app_suppressed).toBe(true);
  });
});
