import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-337 — DB-level integration test for `bunkai_bug_json` as widened by
// migration 0070_bug_detail_composer.sql, the mandatory DB-integration test
// per `rpc-authorization.md` §4 question 6 (answered in `implementation-
// plan.md`). Mirrors `lib/bugs/list-isolation.test.ts`'s structure — same
// service-role fixture seed/teardown pattern, same real-login RLS proof.
//
// `bunkai_bug_json` carries NO actor parameter and stays SECURITY INVOKER
// (unchanged by this migration) — there is nothing to spoof at the function
// boundary. Isolation is enforced entirely by `bugs_select_workspace_member`
// (0046_bugs.sql) evaluating against the CALLER's own `auth.uid()`, which
// only happens when the RPC is invoked AS the caller — a service-role client
// bypasses RLS outright and is used ONLY for fixture setup/teardown and the
// non-RLS-relevant deployment probe below. Three properties this migration's
// own §4 answer calls mandatory:
//
//   (a) A caller who is NOT a member of the bug's workspace gets `null` —
//       the SAME collapse for "does not exist" and "exists, but hidden"
//       (Scenario E-1's non-disclosure boundary) — proven via a REAL
//       authenticated session, never a mocked `db.rpc` call.
//   (b) A caller who IS a member gets the full composed record for a
//       run-linked defect, including the WIDENED `origin` object (run id,
//       the stored 0-based `run_step_position`, the ATC's title/layer) —
//       positive proof the new subselects actually populate for an
//       authorized reader, not just that they stay hidden from an outsider.
//   (c) A defect filed against a module that was later archived still
//       renders in full, with `module.archived_at` set — proving this read
//       does NOT carry over `bunkai_list_bugs`'s `archived_at is null`
//       exclusion (PO Q3 / Scenario E-5).
//
// The actor-bind / real-login case authenticates through the app's REAL,
// sanctioned login path — `supabase.auth.signInWithPassword` with the anon
// key, using the already-declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, see `.agents/project.yaml` ->
// `testing.automation_identity`) — never a locally-minted JWT and never a
// borrowed/impersonated identity, per `live-ui-identity.md` §3. Using
// `SUPABASE_SERVICE_ROLE_KEY` for fixture seed/teardown and the deployment
// probe is separately and explicitly sanctioned.
//
// DB-dependent + env-gated: the deployment probe and fixture seed need only
// `SUPABASE_SERVICE_ROLE_KEY`; the RLS-proving cases additionally need
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `QA_E2E_USER_EMAIL` + `QA_E2E_USER_PASSWORD`
// to log in for real, gated separately so their absence never skips the rest
// of the suite. Either gate SKIPS LOUDLY when its env is missing.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_bug_json';
const PREFIX = `bk337-bug-detail-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface BugDetailJson {
  id: string
  module: { id: string, name: string, path: string, archived_at: string | null } | null
  origin: {
    run_id: string
    run_step_position: number | null
    atc_id: string | null
    atc_title: string | null
    atc_layer: string | null
  } | null
}

interface Fixture {
  workspaceId: string
  projectId: string
  moduleActiveId: string
  moduleArchivedId: string
  bugStandaloneId: string
  bugRunLinkedId: string
  bugArchivedModuleId: string
  runAtcId: string
  runStepId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;

describeOrSkip('BK-337 — bunkai_bug_json (0070_bug_detail_composer.sql) isolation', () => {
  beforeAll(async () => {
    const db = service();

    // Is the migration deployed? A deployed function answers with `null` for
    // a well-formed but nonexistent id, no error.
    const probe = await db.rpc(RPC, { p_bug_id: ZERO_UUID });
    if (probe.error) {
      throw new Error(`${RPC} is not callable (${probe.error.code ?? 'unknown'}: ${probe.error.message}). Apply migration 0070_bug_detail_composer.sql.`);
    }

    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      throw new Error('need at least one active workspace member to use as a real user id (seed state).');
    }
    const ownerUserId = anyMember.user_id as string;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    const projectId = project.id as string;

    const { data: seededModules, error: moduleError } = await db
      .from('modules')
      .insert([
        { project_id: projectId, path: `${PREFIX}-module-active`, name: `${PREFIX} module active` },
        { project_id: projectId, path: `${PREFIX}-module-archived`, name: `${PREFIX} module archived`, archived_at: new Date().toISOString() },
      ])
      .select('id, path');
    if (moduleError) { throw moduleError; }
    const moduleActiveId = (seededModules ?? []).find(m => (m.path as string).endsWith('-module-active'))!.id as string;
    const moduleArchivedId = (seededModules ?? []).find(m => (m.path as string).endsWith('-module-archived'))!.id as string;

    const { data: userStory, error: userStoryError } = await db
      .from('user_stories')
      .insert({ module_id: moduleActiveId, title: `${PREFIX} user story` })
      .select('id')
      .single();
    if (userStoryError) { throw userStoryError; }

    const { data: atc, error: atcError } = await db
      .from('atcs')
      .insert({
        project_id: projectId,
        module_id: moduleActiveId,
        user_story_id: userStory.id as string,
        slug: `${PREFIX}-atc`,
        title: `${PREFIX} ATC`,
        layer: 'API',
      })
      .select('id')
      .single();
    if (atcError) { throw atcError; }
    const atcId = atc.id as string;

    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: projectId, name: `${PREFIX}-env` })
      .select('id')
      .single();
    if (environmentError) { throw environmentError; }

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} test`, created_by: ownerUserId })
      .select('id')
      .single();
    if (testError) { throw testError; }

    const { data: run, error: runError } = await db
      .from('runs')
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        test_id: test.id as string,
        environment_id: environment.id as string,
        status: 'failed',
        executor_mode: 'human',
        executor_user_id: ownerUserId,
        start_token: `${PREFIX}-token`,
        test_title: `${PREFIX} test`,
      })
      .select('id')
      .single();
    if (runError) { throw runError; }
    const runId = run.id as string;

    const { data: runAtc, error: runAtcError } = await db
      .from('run_atcs')
      .insert({ run_id: runId, atc_id: atcId, position: 1, atc_title: `${PREFIX} ATC`, status: 'failed' })
      .select('id')
      .single();
    if (runAtcError) { throw runAtcError; }
    const runAtcId = runAtc.id as string;

    // position 1 (0-based) — the isolation assertion below expects the
    // composed origin's run_step_position to read back as 1, and the view
    // layer's failed-step number to be 2 (1 + 1).
    const { data: runStep, error: runStepError } = await db
      .from('run_steps')
      .insert({ run_atc_id: runAtcId, position: 1, content: `${PREFIX} step content`, status: 'failed' })
      .select('id')
      .single();
    if (runStepError) { throw runStepError; }
    const runStepId = runStep.id as string;

    const { data: seededBugs, error: bugError } = await db
      .from('bugs')
      .insert([
        { workspace_id: workspaceId, project_id: projectId, module_id: moduleActiveId, title: `${PREFIX} bug standalone`, severity: 'P3', created_by: ownerUserId, steps_to_reproduce: '' },
        { workspace_id: workspaceId, project_id: projectId, module_id: moduleActiveId, title: `${PREFIX} bug run-linked`, severity: 'P1', created_by: ownerUserId, run_id: runId, run_step_id: runStepId, atc_id: atcId, steps_to_reproduce: `${PREFIX} step content` },
        { workspace_id: workspaceId, project_id: projectId, module_id: moduleArchivedId, title: `${PREFIX} bug archived module`, severity: 'P4', created_by: ownerUserId, steps_to_reproduce: '' },
      ])
      .select('id, title');
    if (bugError) { throw bugError; }
    const bugStandaloneId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug standalone'))!.id as string;
    const bugRunLinkedId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug run-linked'))!.id as string;
    const bugArchivedModuleId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug archived module'))!.id as string;

    fixture = {
      workspaceId,
      projectId,
      moduleActiveId,
      moduleArchivedId,
      bugStandaloneId,
      bugRunLinkedId,
      bugArchivedModuleId,
      runAtcId,
      runStepId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Explicit deletes, dependency order first, defensively (mirrors
    // list-isolation.test.ts) — workspace cascade should already cover this.
    await db.from('bugs').delete().in('id', [fixture.bugStandaloneId, fixture.bugRunLinkedId, fixture.bugArchivedModuleId]);
    await db.from('run_steps').delete().eq('id', fixture.runStepId);
    await db.from('run_atcs').delete().eq('id', fixture.runAtcId);
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a caller who is NOT a workspace member gets null — never another tenant\'s bug, never a distinguishable error', async () => {
    if (!fixture) { throw new Error('fixture not seeded'); }
    if (!hasRealLoginEnv) {
      console.warn('[bug-detail-isolation] skipped non-member case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bug-detail-isolation] skipped non-member case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }

    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', signIn.user.id)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }
    if (existingMembership) {
      console.warn('[bug-detail-isolation] skipped non-member case: QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    // Cross-check: the service-role read proves the fixture bug genuinely
    // composes a non-null record — so the outsider's null below is caused by
    // RLS, not by a miswired fixture.
    const asService = await db.rpc(RPC, { p_bug_id: fixture.bugRunLinkedId });
    expect(asService.error).toBeNull();
    expect(asService.data).not.toBeNull();

    const asOutsider = await anon.rpc(RPC, { p_bug_id: fixture.bugRunLinkedId });
    expect(asOutsider.error).toBeNull(); // RLS filters silently — a null row, never a raised error
    expect(asOutsider.data).toBeNull();

    // Same outsider, the standalone bug — must not leak either.
    const asOutsiderStandalone = await anon.rpc(RPC, { p_bug_id: fixture.bugStandaloneId });
    expect(asOutsiderStandalone.error).toBeNull();
    expect(asOutsiderStandalone.data).toBeNull();
  });

  it('(b) a workspace member reading a run-linked defect gets the full record, including the widened origin object', async () => {
    if (!fixture) { throw new Error('fixture not seeded'); }
    if (!hasRealLoginEnv) {
      console.warn('[bug-detail-isolation] skipped member case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bug-detail-isolation] skipped member case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
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
        .insert({ workspace_id: fixture.workspaceId, user_id: realUserId, role: 'member', status: 'active' });
      if (grantError) {
        console.warn(`[bug-detail-isolation] skipped member case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      const asMember = await anon.rpc(RPC, { p_bug_id: fixture.bugRunLinkedId });
      expect(asMember.error).toBeNull();
      const bug = asMember.data as unknown as BugDetailJson;
      expect(bug).not.toBeNull();
      expect(bug.id).toBe(fixture.bugRunLinkedId);
      expect(bug.origin).not.toBeNull();
      expect(bug.origin!.run_step_position).toBe(1);
      expect(bug.origin!.atc_title).toBe(`${PREFIX} ATC`);
      expect(bug.origin!.atc_layer).toBe('API');

      // Standalone bug in the same workspace — origin stays null, never a
      // fabricated object (Scenario 2.1 / "Filed manually").
      const asMemberStandalone = await anon.rpc(RPC, { p_bug_id: fixture.bugStandaloneId });
      expect(asMemberStandalone.error).toBeNull();
      expect((asMemberStandalone.data as unknown as BugDetailJson).origin).toBeNull();
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', realUserId);
      }
    }
  });

  it('(c) a defect filed against a since-archived module still renders in full, with module.archived_at set', async () => {
    if (!fixture) { throw new Error('fixture not seeded'); }
    const db = service();

    const result = await db.rpc(RPC, { p_bug_id: fixture.bugArchivedModuleId });
    expect(result.error).toBeNull();
    const bug = result.data as unknown as BugDetailJson;
    expect(bug).not.toBeNull();
    expect(bug.module).not.toBeNull();
    expect(bug.module!.id).toBe(fixture.moduleArchivedId);
    expect(bug.module!.archived_at).not.toBeNull();
  });
});
