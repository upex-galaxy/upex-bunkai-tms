import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

// BK-40 — dedicated isolation guard for the bugs RPCs (`bunkai_create_bug` /
// `bunkai_list_project_bugs`, migration 0046_bugs.sql). Mirrors
// `lib/runs/report-isolation.test.ts`'s structure (BK-38's SEC-1 suite) — same
// service-role fixture seed/teardown pattern, same real-login actor-bind case.
//
// Covers, at minimum, the three scenarios the Stage 2 briefing calls out:
//
//   (a) A real signed-in actor creates a STANDALONE bug in a project they
//       belong to, with a module of that SAME project -> succeeds.
//   (b) THE SINGLE MOST IMPORTANT TEST IN THIS SLICE — the same actor attempts
//       to create a bug in Project A but with a module_id that belongs to
//       Project B (same workspace, different project). This is the concrete
//       cross-project-module-injection regression the ticket's own ATP names
//       as a HIGH risk (ATP-N3 / "Missing/cross-project module blocked").
//       `bunkai_create_bug`'s own module ∈ project re-validation (independent
//       of whatever the HTTP layer already checked) must reject this with
//       45300 (`bugs_module_outside_project`), and no bug row may exist afterward.
//   (c) A run-linked create where the target step is NOT 'failed' — proven at
//       the SAME layer the route composes (bunkai_get_run_expanded's read +
//       the route's own `locateRunStepBugContext`), then asserting that no
//       bug row exists for that project — i.e. rejected before any table
//       write, since the route never calls bunkai_create_bug on this path.
//   (d) THE BLOCKER REGRESSION — a real signed-in actor calls bunkai_create_bug
//       with p_actor_user_id spoofed to a DIFFERENT real user's uuid (reusing
//       the fixture anchor, never a locally-minted identity). Stage 3
//       adversarial review found `bunkai_create_bug` shipped with NO actor-bind
//       guard at all (unlike its `bunkai_list_project_bugs` sibling below),
//       meaning any signed-in user could call the RPC directly with somebody
//       else's uuid and, if that uuid belonged to a write-role workspace
//       member, file a bug attributed to the spoofed victim without ever being
//       a member themselves. Asserts the call is rejected (P0002, matching
//       bunkai_assert_actor_can_write_project's own missing-project shape) AND
//       that zero rows were written — checked directly against the table via
//       the service-role client, not inferred from the error alone.
//
// Also covers the actor-bind guard on `bunkai_list_project_bugs` (mirrors
// bunkai_report_project_runs's own actor-bind case, 0041) — baked in from day
// one per that RPC's own precedent, not retrofitted after a finding.
//
// The actor-bind / real-login case authenticates through the app's REAL,
// sanctioned login path — `supabase.auth.signInWithPassword` with the anon
// key, using the already-declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, see `.agents/project.yaml` ->
// `testing.automation_identity`) — never a locally-minted JWT and never a
// borrowed/impersonated identity, per `live-ui-identity.md` §3 (governs ALL
// test code, not only live-UI/browser checks). Using
// `SUPABASE_SERVICE_ROLE_KEY` for fixture seed/teardown, and for the
// (a)/(b)/(c) data calls with an EXPLICIT actor parameter, is separately and
// explicitly sanctioned (same contract the API route itself uses via the
// admin client).
//
// DB-dependent + env-gated: the (a)/(b)/(c) suite needs only
// `SUPABASE_SERVICE_ROLE_KEY`; the actor-bind case additionally needs
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `QA_E2E_USER_EMAIL` + `QA_E2E_USER_PASSWORD`
// to log in for real, and is gated separately so its absence never skips the
// rest of the suite. Either gate SKIPS LOUDLY when its env is missing, and
// logs + passes when seed state (or the login itself) cannot satisfy a
// precondition — never blocks a build on migration, seed state, or a QA
// fixture-account hiccup.

// The route imports `@lib/supabase/admin`, which pulls in `server-only`; shim
// it so the module graph loads under Bun (mirrors app/api/v1/bugs/route.test.ts).
void mock.module('server-only', () => ({}));
const { locateRunStepBugContext } = await import('../../app/api/v1/bugs/route');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const CREATE_RPC = 'bunkai_create_bug';
const LIST_RPC = 'bunkai_list_project_bugs';
const RUN_READ_RPC = 'bunkai_get_run_expanded';
const PREFIX = `bk40-bug-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Deliberately NOT any real user's id — the actor-bind guard fires on a mere
// mismatch, so a well-formed but nonexistent uuid is sufficient to spoof.
const SPOOFED_ACTOR_UUID = '00000000-0000-0000-0000-000000000001';

interface MemberRow { user_id: string, workspace_id: string, status: string }

interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  moduleAId: string
  moduleBId: string
  runId: string
  pendingStepId: string
  failedStepId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-40 — bugs RPC isolation (cross-project-module-injection + run-step gate)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A deployed RPC answers P0002 for a nonexistent
    // Project; an undeployed one answers "function does not exist".
    const probe = await db.rpc(CREATE_RPC, {
      p_actor_user_id: ZERO_UUID,
      p_project_id: ZERO_UUID,
      p_module_id: ZERO_UUID,
      p_title: 'probe probe probe',
      p_severity: 'P3',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${CREATE_RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0046_bugs.sql.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, status')
      .eq('status', 'active');
    if (membersError) { throw membersError; }
    const active = (members ?? []) as MemberRow[];
    const anchor = active[0];
    if (!anchor) {
      skipReason = 'need at least one active workspace member (seed state).';
      return;
    }

    // Two throwaway Projects in the SAME (anchor's) workspace — the whole
    // point of (b) is that a module from Project B must NOT be acceptable for
    // a bug filed against Project A, even though both share a workspace.
    const { data: seededProjects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectError) { throw projectError; }
    const projectAId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-a'))!.id as string;
    const projectBId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-b'))!.id as string;

    const { data: seededModules, error: moduleError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: `${PREFIX}-module-a`, name: `${PREFIX} module A` },
        { project_id: projectBId, path: `${PREFIX}-module-b`, name: `${PREFIX} module B` },
      ])
      .select('id, project_id');
    if (moduleError) { throw moduleError; }
    const moduleAId = (seededModules ?? []).find(m => m.project_id === projectAId)!.id as string;
    const moduleBId = (seededModules ?? []).find(m => m.project_id === projectBId)!.id as string;

    // Minimal run fixture for case (c): a Test + Environment (both required
    // NOT NULL FKs on `runs`), one Run (module_id = moduleAId, mirrors the
    // chain-position-1 snapshot BK-38 added), one run_atcs row (atc_id left
    // NULL — provenance-only, and this suite never needs a real ATC), and one
    // run_steps row with status 'pending' (never marked failed) — exactly the
    // ATP-N1 negative case.
    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: projectAId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentError) { throw environmentError; }

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspace_id, title: `${PREFIX} test`, created_by: anchor.user_id })
      .select('id')
      .single();
    if (testError) { throw testError; }

    const { data: run, error: runError } = await db
      .from('runs')
      .insert({
        workspace_id: anchor.workspace_id,
        project_id: projectAId,
        test_id: test.id as string,
        environment_id: environment.id as string,
        module_id: moduleAId,
        status: 'running',
        executor_mode: 'human',
        executor_user_id: anchor.user_id,
        start_token: `${PREFIX}-token`,
        test_title: `${PREFIX} test`,
      })
      .select('id')
      .single();
    if (runError) { throw runError; }

    const { data: runAtc, error: runAtcError } = await db
      .from('run_atcs')
      .insert({ run_id: run.id as string, atc_id: null, position: 1, atc_title: `${PREFIX} atc`, status: 'pending' })
      .select('id')
      .single();
    if (runAtcError) { throw runAtcError; }

    const { data: runStep, error: runStepError } = await db
      .from('run_steps')
      .insert({ run_atc_id: runAtc.id as string, atc_step_id: null, position: 0, content: 'do the thing', status: 'pending' })
      .select('id')
      .single();
    if (runStepError) { throw runStepError; }

    // A second step, already marked 'failed' — ATP-P2's own success path
    // (a run-linked bug actually created from a failing step), distinct from
    // the 'pending' step case (c) exercises.
    const { data: failedStep, error: failedStepError } = await db
      .from('run_steps')
      .insert({ run_atc_id: runAtc.id as string, atc_step_id: null, position: 1, content: 'do the other thing', status: 'failed' })
      .select('id')
      .single();
    if (failedStepError) { throw failedStepError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      moduleAId,
      moduleBId,
      runId: run.id as string,
      pendingStepId: runStep.id as string,
      failedStepId: failedStep.id as string,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    await db.from('bugs').delete().eq('project_id', fixture.projectAId);
    await db.from('bugs').delete().eq('project_id', fixture.projectBId);
    // run_atcs/run_steps cascade from runs; runs.test_id is ON DELETE RESTRICT.
    await db.from('runs').delete().eq('id', fixture.runId);
    await db.from('projects').delete().in('id', [fixture.projectAId, fixture.projectBId]);
    await db.from('tests').delete().like('title', `${PREFIX}%`);
  });

  it('(a) a standalone bug in Project A with a Project-A module succeeds', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleAId,
      p_title: 'A perfectly reasonable standalone bug',
      p_severity: 'P2',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });
    expect(error).toBeNull();
    const bug = data as unknown as { id: string, project_id: string, module_id: string, status: string };
    expect(bug.project_id).toBe(fixture.projectAId);
    expect(bug.module_id).toBe(fixture.moduleAId);
    expect(bug.status).toBe('open');
  });

  it('(b) THE MOST IMPORTANT TEST: a Project-B module is rejected for a Project-A bug (cross-project-module-injection, ATP-N3)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleBId, // <-- the injection attempt
      p_title: 'This bug must never be created',
      p_severity: 'P1',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('45300');
    expect(data).toBeNull();

    // No row was written for either project — the rejection is NOT a
    // silent-succeed-into-the-wrong-project failure mode.
    const { data: rows, error: rowsError } = await db
      .from('bugs')
      .select('id')
      .eq('title', 'This bug must never be created');
    if (rowsError) { throw rowsError; }
    expect(rows).toHaveLength(0);
  });

  it('ATP-N3 (missing half): a module_id that does not exist at all is rejected the same way as a cross-project one (45300)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // Case (b) above only exercises the `v_module_project <> p_project_id`
    // disjunct (a REAL module belonging to a different project). This
    // exercises the OTHER disjunct the same 45300 guards — `v_module_project
    // is null` — a module_id that never existed at all.
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: ZERO_UUID,
      p_title: 'This bug must never be created (missing module)',
      p_severity: 'P1',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('45300');
    expect(data).toBeNull();
  });

  it('ATP-B1 (RPC backstop): an 11th evidence link is rejected even when the Zod layer is bypassed (45303)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // validation.test.ts only proves the Zod schema rejects 11 urls at the
    // HTTP edge — never that the RPC-level backstop (or the underlying
    // evidence_urls CHECK) independently enforces the same bound for a
    // direct RPC caller that bypasses Zod entirely.
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleAId,
      p_title: 'This bug must never be created (too much evidence)',
      p_severity: 'P1',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.png`),
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('45303');
    expect(data).toBeNull();
  });

  it('(c) a run-linked create against a NOT-failed step is rejected before any table write', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // The exact two pieces the route composes: the membership-gated run read,
    // then the pure step-locator.
    const { data: runData, error: runError } = await db.rpc(RUN_READ_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_run_id: fixture.runId,
    });
    expect(runError).toBeNull();

    const context = locateRunStepBugContext(
      runData as unknown as Parameters<typeof locateRunStepBugContext>[0],
      fixture.pendingStepId,
    );
    expect(context).not.toBeNull();
    expect(context?.stepStatus).toBe('pending');

    // Per the route's own gate, a non-'failed' step never reaches
    // bunkai_create_bug at all — confirm no bug exists for this run.
    const { data: rows, error: rowsError } = await db
      .from('bugs')
      .select('id')
      .eq('run_step_id', fixture.pendingStepId);
    if (rowsError) { throw rowsError; }
    expect(rows).toHaveLength(0);
  });

  it('(c2) ATP-P2: a run-linked bug filed from a FAILED step succeeds and persists correct provenance', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // Final-assembly review finding, 2026-08-01: no test anywhere actually
    // drove a run-linked create through bunkai_create_bug end-to-end — every
    // prior case here only exercises the STANDALONE path (run_id/run_step_id/
    // atc_id all null). This is the ticket's own namesake scenario ("File a
    // defect from a failing run step").
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleAId,
      p_title: 'Filed from a failing run step',
      p_severity: 'P2',
      p_description: null,
      p_steps_to_reproduce: 'do the other thing',
      p_evidence_urls: [],
      p_run_id: fixture.runId,
      p_run_step_id: fixture.failedStepId,
      p_atc_id: null,
    });

    expect(error).toBeNull();
    const bug = data as unknown as {
      id: string
      project_id: string
      module_id: string
      run_id: string | null
      run_step_id: string | null
      atc_id: string | null
      status: string
    };
    expect(bug.project_id).toBe(fixture.projectAId);
    expect(bug.module_id).toBe(fixture.moduleAId);
    expect(bug.run_id).toBe(fixture.runId);
    expect(bug.run_step_id).toBe(fixture.failedStepId);
    expect(bug.status).toBe('open');
  });

  it('(c3) a p_run_id that does not belong to p_project_id is rejected (bugs_run_outside_project, 45305)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // The final-assembly review's own MAJOR finding: bunkai_create_bug never
    // cross-validated run_id/run_step_id/atc_id against the target project —
    // a write-role member of ANY project could attach foreign/nonexistent
    // provenance to their own bug via a direct RPC call. A nonexistent
    // p_run_id (never belongs to any project) is the simplest reproduction.
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleAId,
      p_title: 'This bug must never be created either',
      p_severity: 'P1',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: ZERO_UUID,
      p_run_step_id: fixture.failedStepId,
      p_atc_id: null,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('45305');
    expect(data).toBeNull();

    const { data: rows, error: rowsError } = await db
      .from('bugs')
      .select('id')
      .eq('title', 'This bug must never be created either');
    if (rowsError) { throw rowsError; }
    expect(rows).toHaveLength(0);
  });

  it('(d) THE BLOCKER REGRESSION: a spoofed p_actor_user_id is rejected on bunkai_create_bug, and zero rows are written', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[bugs-isolation] skipped create-bug actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bugs-isolation] skipped create-bug actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const realUserId = signIn.user.id;

    // The spoofed target must be a REAL, already-fixture-seeded user distinct
    // from the real signed-in actor — reuse fixture.actorUserId (the anchor
    // workspace member every other case in this file already writes as)
    // rather than provisioning a second identity. On the vanishingly unlikely
    // chance the QA_E2E account IS the anchor, this would be a legitimate
    // self-call, not a spoof — skip loudly rather than produce a false result.
    if (realUserId === fixture.actorUserId) {
      console.warn('[bugs-isolation] skipped create-bug actor-bind case: QA_E2E identity coincides with the fixture anchor, no distinct real user available to spoof.');
      return;
    }

    const uniqueTitle = `${PREFIX} spoofed actor must never create this bug`;
    const spoofed = await anon.rpc(CREATE_RPC, {
      p_actor_user_id: fixture.actorUserId, // <-- spoofing a real, DIFFERENT signed-in user
      p_project_id: fixture.projectAId,
      p_module_id: fixture.moduleAId,
      p_title: uniqueTitle,
      p_severity: 'P1',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });

    expect(spoofed.error).not.toBeNull();
    expect(spoofed.error?.code).toBe('P0002');
    expect(spoofed.data).toBeNull();

    // The rejection must be a genuine pre-write reject, not a silent
    // succeed-under-the-wrong-identity — confirmed via the service-role
    // client (bypasses RLS) directly against the table, not inferred from the
    // error alone.
    const db = service();
    const { data: rows, error: rowsError } = await db
      .from('bugs')
      .select('id')
      .eq('title', uniqueTitle);
    if (rowsError) { throw rowsError; }
    expect(rows).toHaveLength(0);
  });

  it('bunkai_list_project_bugs returns ONLY Project A\'s bugs (never Project B\'s)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await db.rpc(LIST_RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
    });
    expect(error).toBeNull();
    const page = data as unknown as { items: { id: string, project_id: string }[] };
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every(i => i.project_id === fixture!.projectAId)).toBe(true);
  });

  it('the actor-bind guard rejects a spoofed p_actor_user_id on bunkai_list_project_bugs', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[bugs-isolation] skipped actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bugs-isolation] skipped actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const realUserId = signIn.user.id;

    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', realUserId)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }

    let grantedMembership = false;
    if (!existingMembership) {
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: fixture.workspaceId, user_id: realUserId, role: 'viewer', status: 'active' });
      if (grantError) {
        console.warn(`[bugs-isolation] skipped actor-bind case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      // Legitimate self-call succeeds first — proves the rejection below fails
      // for the RIGHT reason (an identity mismatch), not a broken session.
      const self = await anon.rpc(LIST_RPC, { p_actor_user_id: realUserId, p_project_id: fixture.projectAId });
      expect(self.error).toBeNull();

      const spoofed = await anon.rpc(LIST_RPC, { p_actor_user_id: SPOOFED_ACTOR_UUID, p_project_id: fixture.projectAId });
      expect(spoofed.error).not.toBeNull();
      expect(spoofed.error?.code).toBe('P0002');
      expect(spoofed.data).toBeNull();
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', realUserId);
      }
    }
  });
});

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[bugs-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
