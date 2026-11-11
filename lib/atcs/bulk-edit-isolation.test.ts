import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-507: bulk-edit tags, Module, layer and priority on selected ATCs, against
// the real database (migration 0124). A mocked rpc proves nothing about a
// DEFINER function (ADR-0012), so this suite runs the real `bunkai_bulk_edit_atcs`.
//
// What it proves:
//   * the four fields, with per-ATC outcomes and partial success;
//   * no-op is a success checked BEFORE the stale check (double confirm, E4, E8, E9);
//   * refusals: stale (E3), archived (E11), tags cap (E2), Module outside the
//     ATC's own story subtree (E1), foreign project id (no existence signal);
//   * propagation: one `atc.updated` per changed ATC with the DISTINCT chaining
//     Test ids, a Test chaining the ATC twice counts once (E13);
//   * authorization: viewer (E12), stranger, direct call from a session;
//   * request-level failures change nothing (E14 ceiling, empty, bad field);
//   * atomicity: a failure before the event leaves no write behind.
//
// Fixtures live in throwaway workspaces named with PREFIX and are deleted in
// afterAll, which fails the suite if any remains. With no database environment
// the suite is skipped with a loud warning; in every other case it FAILS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[bulk-edit-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk507-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const FAILPOINT = 'atc_bulk_edit.before_event';

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[bulk-edit-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Outcome { atc_id: string, slug: string | null, title: string | null, outcome: 'changed' | 'unchanged' | 'refused', reason: string | null, version: number | null }
interface BulkResult { dry_run: boolean, field: string, requested: number, changed: number, unchanged: number, refused: number, outcomes: Outcome[] }

interface Fixture {
  workspaceId: string
  viewerWorkspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  viewerProjectId: string
  foreignProjectId: string
}

interface Branch { moduleId: string, storyId: string, acId: string, atcId: string }

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;

function need(): Fixture {
  if (!fixture) {
    throw new Error('[bulk-edit-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

async function seedModule(projectId: string, path: string): Promise<string> {
  const row = must(await service().from('modules').insert({ project_id: projectId, path, name: path.split('/').pop() }).select('id').single(), 'module');
  return row.id as string;
}

// A User Story under `moduleId` and one ATC under `atcModuleId` (default: the story's Module).
async function seedBranch(projectId: string, moduleId: string, opts: { atcModuleId?: string, tags?: string[], archived?: boolean } = {}): Promise<Branch> {
  counter += 1;
  const db = service();
  const label = `n${counter}`;
  const story = must(await db.from('user_stories').insert({ module_id: moduleId, title: `${PREFIX} ${label}` }).select('id').single(), 'story');
  const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} ${label} ac`, position: 1 }).select('id').single(), 'criterion');
  const atc = must(await db.from('atcs').insert({
    project_id: projectId,
    module_id: opts.atcModuleId ?? moduleId,
    user_story_id: story.id,
    slug: `${PREFIX}-m/atc-${label.padStart(8, '0')}`,
    title: `${PREFIX} ${label} atc`,
    layer: 'UI',
    tags: opts.tags ?? [],
    archived_at: opts.archived ? new Date().toISOString() : null,
  }).select('id').single(), 'atc');
  must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: `step ${label}`, expected: 'ok' }).select('id').single(), 'atc step');
  must(await db.from('atc_acceptance_criteria').insert({ atc_id: atc.id, acceptance_criterion_id: ac.id }).select('atc_id').single(), 'binding');
  return { moduleId, storyId: story.id as string, acId: ac.id as string, atcId: atc.id as string };
}

async function bulk(items: Array<{ id: string, version?: number | null }>, field: string, change: Record<string, unknown>, opts: { actor?: string, projectId?: string, dryRun?: boolean } = {}) {
  return service().rpc('bunkai_bulk_edit_atcs', {
    p_actor_user_id: opts.actor ?? need().qaUserId,
    p_project_id: opts.projectId ?? need().projectId,
    p_items: items.map(i => ({ id: i.id, version: i.version ?? null })),
    p_field: field,
    p_change: change,
    p_dry_run: opts.dryRun ?? false,
  });
}

async function ok(items: Array<{ id: string, version?: number | null }>, field: string, change: Record<string, unknown>, opts: Parameters<typeof bulk>[3] = {}): Promise<BulkResult> {
  const { data, error } = await bulk(items, field, change, opts);
  expect(error).toBeNull();
  return data as unknown as BulkResult;
}

function outcomeOf(result: BulkResult, atcId: string): Outcome {
  const found = result.outcomes.find(o => o.atc_id === atcId);
  if (!found) { throw new Error(`no outcome for ${atcId}`); }
  return found;
}

async function atcRow(atcId: string) {
  return must(await service().from('atcs').select('tags, layer, priority, module_id, slug, version, archived_at').eq('id', atcId).single(), 'atc read');
}

async function eventCount(atcId: string): Promise<number> {
  const { count, error } = await service()
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', atcId)
    .eq('action', 'atc.updated');
  if (error) { throw new Error(error.message); }
  return count ?? 0;
}

describeOrSkip('BK-507: bulk-edit ATCs', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[bulk-edit-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[bulk-edit-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-viewer`, name: `${PREFIX} viewer`, owner_user_id: qaUserId }).select('id').single(), 'viewer workspace');
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: qaUserId, role: 'viewer', status: 'active' }).select('user_id').single(), 'viewer membership');
    // No membership row: the QA identity is a stranger here.
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');

    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const viewerProject = must(await db.from('projects').insert({ workspace_id: viewerWs.id, slug: `${PREFIX}-v`, name: `${PREFIX} viewer project` }).select('id').single(), 'viewer project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');

    fixture = {
      workspaceId: ws.id as string,
      viewerWorkspaceId: viewerWs.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectId: project.id as string,
      viewerProjectId: viewerProject.id as string,
      foreignProjectId: foreignProject.id as string,
    };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    const workspaceIds = [f.workspaceId, f.viewerWorkspaceId, f.foreignWorkspaceId];
    const projectIds = [f.projectId, f.viewerProjectId, f.foreignProjectId];
    await db.from('bunkai_test_failpoints').delete().in('workspace_id', workspaceIds);
    await db.from('tests').delete().in('workspace_id', workspaceIds);
    await db.from('atcs').delete().in('project_id', projectIds);
    await db.from('projects').delete().in('id', projectIds);
    await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
    await db.from('workspaces').delete().in('id', workspaceIds);
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[bulk-edit-isolation] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  describe('tags', () => {
    it('adds normalised tags, keeps existing spelling, bumps the version and writes one event each', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-tags`);
      const a = await seedBranch(need().projectId, mod, { tags: ['smoke'] });
      const b = await seedBranch(need().projectId, mod);

      const result = await ok([{ id: a.atcId, version: 1 }, { id: b.atcId, version: 1 }], 'tags', { op: 'add', tags: ['  Regression ', 'SMOKE', 'regression', ' Two  Words '] });
      expect(result.changed).toBe(2);
      expect(result.refused).toBe(0);
      expect((await atcRow(a.atcId)).tags).toEqual(['smoke', 'regression', 'two words']);
      expect((await atcRow(b.atcId)).tags).toEqual(['regression', 'smoke', 'two words']);
      expect((await atcRow(a.atcId)).version).toBe(2);
      expect(await eventCount(a.atcId)).toBe(1);
      expect(await eventCount(b.atcId)).toBe(1);
    });

    it('is idempotent: a double confirm with the old versions is unchanged, never stale, and writes nothing (E4, E8)', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-double`);
      const a = await seedBranch(need().projectId, mod);
      const change = { op: 'add', tags: ['once'] };
      await ok([{ id: a.atcId, version: 1 }], 'tags', change);
      const second = await ok([{ id: a.atcId, version: 1 }], 'tags', change);
      expect(second.unchanged).toBe(1);
      expect(second.refused).toBe(0);
      expect((await atcRow(a.atcId)).version).toBe(2);
      expect(await eventCount(a.atcId)).toBe(1);
    });

    it('refuses only the ATC that would exceed 10 tags (E2): partial success', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-cap`);
      const full = await seedBranch(need().projectId, mod, { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] });
      const roomy = await seedBranch(need().projectId, mod);
      const result = await ok([{ id: full.atcId }, { id: roomy.atcId }], 'tags', { op: 'add', tags: ['extra'] });
      expect(outcomeOf(result, full.atcId).reason).toBe('tags_limit_exceeded');
      expect(outcomeOf(result, roomy.atcId).outcome).toBe('changed');
      expect((await atcRow(full.atcId)).tags).toHaveLength(10);
    });

    it('removes case-insensitively and treats an absent tag as a no-op', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-remove`);
      const a = await seedBranch(need().projectId, mod, { tags: ['Keep', 'Drop', 'also'] });
      const result = await ok([{ id: a.atcId }], 'tags', { op: 'remove', tags: ['DROP', 'absent'] });
      expect(result.changed).toBe(1);
      expect((await atcRow(a.atcId)).tags).toEqual(['Keep', 'also']);
      const again = await ok([{ id: a.atcId }], 'tags', { op: 'remove', tags: ['drop'] });
      expect(again.unchanged).toBe(1);
    });
  });

  describe('module', () => {
    it('moves ATCs inside their own story subtree, regenerates the slug prefix, keeps the suffix, and refuses the rest (E1, E9)', async () => {
      const root = await seedModule(need().projectId, `${PREFIX}-root`);
      const leaf = await seedModule(need().projectId, `${PREFIX}-root/leaf`);
      const elsewhere = await seedModule(need().projectId, `${PREFIX}-elsewhere`);
      const inside = await seedBranch(need().projectId, root);
      const outside = await seedBranch(need().projectId, elsewhere);
      const before = await atcRow(inside.atcId);

      const result = await ok([{ id: inside.atcId }, { id: outside.atcId }], 'module', { module_id: leaf });
      expect(outcomeOf(result, inside.atcId).outcome).toBe('changed');
      expect(outcomeOf(result, outside.atcId).reason).toBe('module_outside_story_subtree');

      const moved = await atcRow(inside.atcId);
      expect(moved.module_id).toBe(leaf);
      expect(moved.slug).toBe(`leaf/${before.slug.split('/').pop()}`);
      expect((await atcRow(outside.atcId)).module_id).toBe(elsewhere);

      const same = await ok([{ id: inside.atcId }], 'module', { module_id: leaf });
      expect(same.unchanged).toBe(1);
    });

    it('rejects an archived or foreign destination as a request-level failure that touches nothing', async () => {
      const root = await seedModule(need().projectId, `${PREFIX}-dest`);
      const a = await seedBranch(need().projectId, root);
      const archivedDest = must(await service().from('modules').insert({ project_id: need().projectId, path: `${PREFIX}-dest/gone`, name: 'gone', archived_at: new Date().toISOString() }).select('id').single(), 'archived module');
      const foreignDest = await seedModule(need().foreignProjectId, `${PREFIX}-foreign-mod`);
      for (const dest of [archivedDest.id as string, foreignDest]) {
        const { error } = await bulk([{ id: a.atcId }], 'module', { module_id: dest });
        expect(error?.code).toBe('P0002');
      }
      expect((await atcRow(a.atcId)).module_id).toBe(root);
    });
  });

  describe('layer and priority', () => {
    it('sets a layer and sets then clears a priority', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-classify`);
      const a = await seedBranch(need().projectId, mod);
      expect((await ok([{ id: a.atcId }], 'layer', { layer: 'API' })).changed).toBe(1);
      expect((await atcRow(a.atcId)).layer).toBe('API');
      expect((await ok([{ id: a.atcId }], 'priority', { priority: 'High' })).changed).toBe(1);
      expect((await atcRow(a.atcId)).priority).toBe('High');
      expect((await ok([{ id: a.atcId }], 'priority', { priority: null })).changed).toBe(1);
      expect((await atcRow(a.atcId)).priority).toBeNull();
    });
  });

  describe('refusals and the report', () => {
    it('refuses stale (never overwrites), archived, a foreign-project id and an unknown id, each with its own reason', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-refuse`);
      const stale = await seedBranch(need().projectId, mod);
      const archived = await seedBranch(need().projectId, mod, { archived: true });
      const foreignMod = await seedModule(need().foreignProjectId, `${PREFIX}-foreign-refuse`);
      const foreign = await seedBranch(need().foreignProjectId, foreignMod);
      await service().from('atcs').update({ version: 5 }).eq('id', stale.atcId);

      const result = await ok(
        [{ id: stale.atcId, version: 1 }, { id: archived.atcId }, { id: foreign.atcId }, { id: '00000000-0000-4000-8000-000000000000' }],
        'layer',
        { layer: 'Unit' },
      );
      expect(outcomeOf(result, stale.atcId).reason).toBe('stale_version');
      expect(outcomeOf(result, archived.atcId).reason).toBe('archived');
      expect(outcomeOf(result, foreign.atcId).reason).toBe('not_found');
      expect(outcomeOf(result, '00000000-0000-4000-8000-000000000000').reason).toBe('not_found');
      expect((await atcRow(stale.atcId)).layer).toBe('UI');
      expect((await atcRow(foreign.atcId)).layer).toBe('UI');
    });

    it('a dry run reports the same outcomes and writes nothing', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-dry`);
      const a = await seedBranch(need().projectId, mod);
      const result = await ok([{ id: a.atcId }], 'layer', { layer: 'API' }, { dryRun: true });
      expect(result.dry_run).toBe(true);
      expect(result.changed).toBe(1);
      expect((await atcRow(a.atcId)).layer).toBe('UI');
      expect(await eventCount(a.atcId)).toBe(0);
    });

    it('processes a repeated id once', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-repeat`);
      const a = await seedBranch(need().projectId, mod);
      const result = await ok([{ id: a.atcId }, { id: a.atcId }], 'layer', { layer: 'API' });
      expect(result.requested).toBe(1);
      expect((await atcRow(a.atcId)).version).toBe(2);
    });
  });

  describe('propagation and Activity', () => {
    it('emits one atc.updated per changed ATC with the distinct chaining Test ids, a Test chaining it twice counts once (E13)', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-chain`);
      const a = await seedBranch(need().projectId, mod);
      const { data, error } = await service().rpc('bunkai_create_test', {
        p_actor_user_id: need().qaUserId,
        p_workspace_id: need().workspaceId,
        p_title: `${PREFIX} chain test`,
        p_atc_ids: [a.atcId, a.atcId],
      });
      expect(error).toBeNull();
      const testId = (data as { id: string }).id;

      await ok([{ id: a.atcId }], 'layer', { layer: 'API' });
      const events = must(await service().from('activity_log').select('payload').eq('entity_id', a.atcId).eq('action', 'atc.updated'), 'event read');
      expect(events).toHaveLength(1);
      const payload = events[0].payload as { affected_test_ids: string[], changed_fields: string[], bulk: boolean, version: number };
      expect(payload.affected_test_ids).toEqual([testId]);
      expect(payload.changed_fields).toEqual(['layer']);
      expect(payload.bulk).toBe(true);
      expect(payload.version).toBe(2);
    });
  });

  describe('authorization', () => {
    it('a viewer is refused by the write gate (E12) and nothing is written', async () => {
      const mod = await seedModule(need().viewerProjectId, `${PREFIX}-viewer-mod`);
      const a = await seedBranch(need().viewerProjectId, mod);
      const { error } = await bulk([{ id: a.atcId }], 'layer', { layer: 'API' }, { projectId: need().viewerProjectId });
      expect(error?.code).toBe('42501');
      expect((await atcRow(a.atcId)).layer).toBe('UI');
    });

    it('a stranger to the workspace is refused', async () => {
      const mod = await seedModule(need().foreignProjectId, `${PREFIX}-stranger-mod`);
      const a = await seedBranch(need().foreignProjectId, mod);
      const { error } = await bulk([{ id: a.atcId }], 'layer', { layer: 'API' }, { projectId: need().foreignProjectId });
      expect(error?.code).toBe('42501');
    });

    it('a signed-in session cannot call it directly (service_role only)', async () => {
      const { error } = await qa.rpc('bunkai_bulk_edit_atcs', {
        p_actor_user_id: need().qaUserId,
        p_project_id: need().projectId,
        p_items: [{ id: '00000000-0000-4000-8000-000000000000', version: null }],
        p_field: 'layer',
        p_change: { layer: 'API' },
        p_dry_run: true,
      });
      expect(error).not.toBeNull();
    });
  });

  describe('request-level failures change nothing', () => {
    it('refuses an empty selection, a selection over the ceiling of 200 (E14), an unknown field and a bad value', async () => {
      const ghost = '00000000-0000-4000-8000-000000000000';
      expect((await bulk([], 'layer', { layer: 'API' })).error?.code).toBe('45026');
      const over = Array.from({ length: 201 }, () => ({ id: crypto.randomUUID() }));
      expect((await bulk(over, 'layer', { layer: 'API' })).error?.code).toBe('45026');
      expect((await bulk([{ id: ghost }], 'status', { status: 'passed' })).error?.code).toBe('45027');
      expect((await bulk([{ id: ghost }], 'layer', { layer: 'Mobile' })).error?.code).toBe('45027');
      expect((await bulk([{ id: ghost }], 'tags', { op: 'replace', tags: ['x'] })).error?.code).toBe('45027');
    });
  });

  describe('atomicity', () => {
    it('a failure before the event rolls back that ATC write: write_failed, no change, no event', async () => {
      const mod = await seedModule(need().projectId, `${PREFIX}-failpoint`);
      const a = await seedBranch(need().projectId, mod);
      const db = service();
      must(await db.from('bunkai_test_failpoints').insert({ name: FAILPOINT, workspace_id: need().workspaceId }).select('name').single(), 'failpoint');
      try {
        const result = await ok([{ id: a.atcId }], 'layer', { layer: 'API' });
        expect(outcomeOf(result, a.atcId).reason).toBe('write_failed');
        expect((await atcRow(a.atcId)).layer).toBe('UI');
        expect(await eventCount(a.atcId)).toBe(0);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('workspace_id', need().workspaceId);
      }
    });
  });
});
