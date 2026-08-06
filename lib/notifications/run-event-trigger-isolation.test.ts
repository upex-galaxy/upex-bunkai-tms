import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

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
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))];
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
