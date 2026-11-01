import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTestChainProjectIds, isTestChainInProject } from '@lib/tests/project-scope';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { fetchExplorerTests } from './workbench-tree-query';

// BK-620 — a Test created in Project A must never be listed in, or opened
// from, Project B of the same workspace. Before the fix the project layout
// listed EVERY Test of the active workspace in every Project's Explorer, and
// the `/projects/{slug}/tests/{id}` route opened any workspace Test under any
// Project slug.
//
// Runs against the REAL database through a REAL authenticated session
// (QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD, granted `member` on a throwaway
// workspace), because that is the RLS context the project layout and the
// Test-detail loader read under: an embedded `atcs` row hidden by RLS would
// change the answer, and a mocked client cannot show that.
//
// Fixture (service role, prefixed, torn down by the workspace cascade): one
// workspace, Projects A and B, one ATC in each, and four Tests:
//   testA   -> chains A's ATC            (belongs to A)
//   testB   -> chains B's ATC            (belongs to B)
//   testAB  -> chains A's AND B's ATC    (spans two Projects: belongs to neither, 0076's ALL-match rule)
//   testNil -> empty chain               (belongs to none)
//
// Env-gated: skips when the Supabase or QA env is absent; when the env is
// present a failed precondition THROWS (a green on a missing fixture is a
// coverage gap, not a pass).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const PREFIX = `bk620-explorer-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Fixture {
  workspaceId: string
  projectAId: string
  projectBId: string
  testAId: string
  testBId: string
  testABId: string
  testNilId: string
}

function service() {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;
let member: SupabaseClient<Database> | null = null;

function requireFixture(): { f: Fixture, db: SupabaseClient<Database> } {
  if (!fixture || !member) { throw new Error('fixture setup failed — see beforeAll error above'); }
  return { f: fixture, db: member };
}

describeOrSkip('BK-620 — a Test is scoped to the Project its chain belongs to', () => {
  beforeAll(async () => {
    const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.user) {
      throw new Error(`[explorer-tests-project-isolation] precondition not met — QA_E2E login failed (${signInError?.message ?? 'no user'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: qaUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id;

    // The QA identity reads as a plain member, the same context the layout uses.
    const { error: memberError } = await db
      .from('workspace_members')
      .upsert({ workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' }, { onConflict: 'workspace_id,user_id' });
    if (memberError) { throw memberError; }

    const { data: projects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: workspaceId, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectError) { throw projectError; }
    const projectAId = projects.find(p => p.slug.endsWith('project-a'))!.id;
    const projectBId = projects.find(p => p.slug.endsWith('project-b'))!.id;

    const { data: modules, error: modulesError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: `${PREFIX}-module-a`, name: 'Module A' },
        { project_id: projectBId, path: `${PREFIX}-module-b`, name: 'Module B' },
      ])
      .select('id, project_id');
    if (modulesError) { throw modulesError; }
    const moduleAId = modules.find(m => m.project_id === projectAId)!.id;
    const moduleBId = modules.find(m => m.project_id === projectBId)!.id;

    const { data: stories, error: storiesError } = await db
      .from('user_stories')
      .insert([
        { module_id: moduleAId, project_id: projectAId, title: `${PREFIX} story A` },
        { module_id: moduleBId, project_id: projectBId, title: `${PREFIX} story B` },
      ])
      .select('id, project_id');
    if (storiesError) { throw storiesError; }
    const storyAId = stories.find(s => s.project_id === projectAId)!.id;
    const storyBId = stories.find(s => s.project_id === projectBId)!.id;

    const { data: atcs, error: atcsError } = await db
      .from('atcs')
      .insert([
        { project_id: projectAId, module_id: moduleAId, user_story_id: storyAId, slug: `${PREFIX}-atc-a`, title: 'ATC A', layer: 'UI' },
        { project_id: projectBId, module_id: moduleBId, user_story_id: storyBId, slug: `${PREFIX}-atc-b`, title: 'ATC B', layer: 'UI' },
      ])
      .select('id, project_id');
    if (atcsError) { throw atcsError; }
    const atcAId = atcs.find(a => a.project_id === projectAId)!.id;
    const atcBId = atcs.find(a => a.project_id === projectBId)!.id;

    const { data: tests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: workspaceId, title: `${PREFIX} test A`, created_by: qaUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test B`, created_by: qaUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test AB`, created_by: qaUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test Nil`, created_by: qaUserId },
      ])
      .select('id, title');
    if (testsError) { throw testsError; }
    const byTitle = (suffix: string) => tests.find(t => t.title === `${PREFIX} ${suffix}`)!.id;
    const testAId = byTitle('test A');
    const testBId = byTitle('test B');
    const testABId = byTitle('test AB');
    const testNilId = byTitle('test Nil');

    const { error: stepsError } = await db
      .from('test_steps')
      .insert([
        { test_id: testAId, atc_id: atcAId, position: 1 },
        { test_id: testBId, atc_id: atcBId, position: 1 },
        { test_id: testABId, atc_id: atcAId, position: 1 },
        { test_id: testABId, atc_id: atcBId, position: 2 },
      ]);
    if (stepsError) { throw stepsError; }

    fixture = { workspaceId, projectAId, projectBId, testAId, testBId, testABId, testNilId };
    member = client;
  });

  afterAll(async () => {
    if (fixture) {
      // Cascades cover projects, modules, stories, ATCs, Tests, steps and memberships.
      await service().from('workspaces').delete().eq('id', fixture.workspaceId);
    }
    await member?.auth.signOut();
  });

  it('Project A\'s Explorer lists the Test created in A, and nothing else', async () => {
    const { f, db } = requireFixture();
    const ids = (await fetchExplorerTests(db, f.workspaceId, f.projectAId)).map(t => t.id);
    expect(ids).toEqual([f.testAId]);
  });

  it('Project B\'s Explorer never lists the Test created in A', async () => {
    const { f, db } = requireFixture();
    const ids = (await fetchExplorerTests(db, f.workspaceId, f.projectBId)).map(t => t.id);
    expect(ids).not.toContain(f.testAId);
    expect(ids).toEqual([f.testBId]);
  });

  it('the Explorer keeps the step count of each listed Test', async () => {
    const { f, db } = requireFixture();
    const rows = await fetchExplorerTests(db, f.workspaceId, f.projectAId);
    expect(rows.map(r => r.test_steps.length)).toEqual([1]);
  });

  it('the Test-detail guard resolves A\'s Test to A only', async () => {
    const { f, db } = requireFixture();
    const chain = await fetchTestChainProjectIds(db, f.testAId);
    expect(isTestChainInProject(chain, f.projectAId)).toBe(true);
    expect(isTestChainInProject(chain, f.projectBId)).toBe(false);
  });

  it('a Test spanning two Projects, or with no chain, opens in neither', async () => {
    const { f, db } = requireFixture();
    for (const testId of [f.testABId, f.testNilId]) {
      const chain = await fetchTestChainProjectIds(db, testId);
      expect(isTestChainInProject(chain, f.projectAId)).toBe(false);
      expect(isTestChainInProject(chain, f.projectBId)).toBe(false);
    }
  });
});
