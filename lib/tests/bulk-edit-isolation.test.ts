import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// A mocked rpc proves nothing about a DEFINER function (ADR-0012), so this runs the real one.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[test-bulk-edit-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk2099-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const FAILPOINT = 'test_bulk_tags.before_event';
const TWENTY = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
const NINETEEN = TWENTY.slice(0, 19);

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[test-bulk-edit-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Outcome { test_id: string, outcome: 'changed' | 'unchanged' | 'refused', reason: string | null, tags: string[] | null, version: number | null }
interface Report { dry_run: boolean, mode: string, requested: number, changed: number, unchanged: number, refused: number, outcomes: Outcome[] }

interface Fixture {
  workspaceId: string
  viewerWorkspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
}

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;

function need(): Fixture {
  if (!fixture) {
    throw new Error('[test-bulk-edit-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

async function seedTest(opts: { tags?: string[], archived?: boolean, workspaceId?: string } = {}): Promise<string> {
  counter += 1;
  const row = must(await service().from('tests').insert({
    workspace_id: opts.workspaceId ?? need().workspaceId,
    title: `${PREFIX} t${counter}`,
    created_by: need().qaUserId,
    tags: opts.tags ?? [],
    archived_at: opts.archived ? new Date().toISOString() : null,
  }).select('id').single(), 'test');
  return row.id as string;
}

async function bulk(testIds: string[], mode: string, tags: string[], opts: { actor?: string, workspaceId?: string, dryRun?: boolean } = {}) {
  return service().rpc('bunkai_bulk_edit_test_tags', {
    p_actor_user_id: opts.actor ?? need().qaUserId,
    p_workspace_id: opts.workspaceId ?? need().workspaceId,
    p_test_ids: testIds,
    p_mode: mode,
    p_tags: tags,
    p_dry_run: opts.dryRun ?? false,
  });
}

async function ok(testIds: string[], mode: string, tags: string[], opts: Parameters<typeof bulk>[3] = {}): Promise<Report> {
  const { data, error } = await bulk(testIds, mode, tags, opts);
  expect(error).toBeNull();
  return data as unknown as Report;
}

function outcomeOf(report: Report, testId: string): Outcome {
  const found = report.outcomes.find(o => o.test_id === testId);
  if (!found) { throw new Error(`no outcome for ${testId}`); }
  return found;
}

async function row(testId: string): Promise<{ tags: string[], version: number, updated_at: string }> {
  return must(await service().from('tests').select('tags, version, updated_at').eq('id', testId).single(), 'test read');
}

async function events(testId: string): Promise<Array<{ payload: Record<string, unknown>, entity_type: string }>> {
  return must(await service().from('activity_log').select('payload, entity_type').eq('entity_id', testId).eq('action', 'test.tags_changed'), 'event read') as Array<{ payload: Record<string, unknown>, entity_type: string }>;
}

describeOrSkip('BK-2099: bulk-edit Test tags', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[test-bulk-edit-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[test-bulk-edit-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-viewer`, name: `${PREFIX} viewer`, owner_user_id: qaUserId }).select('id').single(), 'viewer workspace');
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: qaUserId, role: 'viewer', status: 'active' }).select('user_id').single(), 'viewer membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');
    fixture = { workspaceId: ws.id as string, viewerWorkspaceId: viewerWs.id as string, foreignWorkspaceId: foreignWs.id as string, qaUserId };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    const workspaceIds = [f.workspaceId, f.viewerWorkspaceId, f.foreignWorkspaceId];
    await db.from('bunkai_test_failpoints').delete().in('workspace_id', workspaceIds);
    await db.from('activity_log').delete().in('workspace_id', workspaceIds);
    await db.from('tests').delete().in('workspace_id', workspaceIds);
    await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
    await db.from('workspaces').delete().in('id', workspaceIds);
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[test-bulk-edit-isolation] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  describe('add', () => {
    it('adds a reserved tag: changed with a version bump, an existing holder is unchanged and untouched', async () => {
      const t1 = await seedTest();
      const t2 = await seedTest({ tags: ['smoke'] });
      const t3 = await seedTest({ tags: ['login'] });
      const before2 = await row(t2);
      const report = await ok([t1, t2, t3], 'add', ['smoke']);
      expect(report).toMatchObject({ dry_run: false, mode: 'add', requested: 3, changed: 2, unchanged: 1, refused: 0 });
      expect(outcomeOf(report, t1)).toEqual({ test_id: t1, outcome: 'changed', reason: null, tags: ['smoke'], version: 2 });
      expect(outcomeOf(report, t2).outcome).toBe('unchanged');
      expect((await row(t1)).version).toBe(2);
      expect(await row(t2)).toEqual(before2);
      expect((await row(t3)).tags).toEqual(['login', 'smoke']);
    });

    it('keeps custom casing, lowercases reserved tags and drops repeats in the request', async () => {
      const t1 = await seedTest();
      const t2 = await seedTest({ tags: ['smoke'] });
      await ok([t1, t2], 'add', ['Login', 'SMOKE']);
      expect((await row(t1)).tags).toEqual(['Login', 'smoke']);
      expect((await row(t2)).tags).toEqual(['smoke', 'Login']);
      const t3 = await seedTest();
      await ok([t3], 'add', ['smoke', 'Login', 'smoke']);
      expect((await row(t3)).tags).toEqual(['smoke', 'Login']);
    });

    it('treats a custom tag in another case as a different tag', async () => {
      const t1 = await seedTest({ tags: ['Login'] });
      const report = await ok([t1], 'add', ['login']);
      expect(outcomeOf(report, t1).outcome).toBe('changed');
      expect((await row(t1)).tags).toEqual(['Login', 'login']);
    });
  });

  describe('remove', () => {
    it('removes where present and is unchanged where absent', async () => {
      const t1 = await seedTest({ tags: ['regression', 'api'] });
      const t2 = await seedTest({ tags: ['api'] });
      const report = await ok([t1, t2], 'remove', ['regression']);
      expect(outcomeOf(report, t1)).toMatchObject({ outcome: 'changed', tags: ['api'], version: 2 });
      expect(outcomeOf(report, t2)).toMatchObject({ outcome: 'unchanged', version: 1 });
      expect((await row(t2)).version).toBe(1);
    });

    it('matches a reserved tag in any casing and a custom tag only exact-case', async () => {
      const t1 = await seedTest({ tags: ['regression'] });
      expect(outcomeOf(await ok([t1], 'remove', ['REGRESSION']), t1)).toMatchObject({ outcome: 'changed', tags: [] });
      const t2 = await seedTest({ tags: ['Login'] });
      expect(outcomeOf(await ok([t2], 'remove', ['login']), t2)).toMatchObject({ outcome: 'unchanged', tags: ['Login'] });
    });

    it('removing the last tag leaves an empty set and the event says so', async () => {
      const t1 = await seedTest({ tags: ['smoke'] });
      await ok([t1], 'remove', ['smoke']);
      expect((await row(t1)).tags).toEqual([]);
      const written = await events(t1);
      expect(written).toHaveLength(1);
      expect(written[0].payload.new_tags).toEqual([]);
    });
  });

  describe('the 20-tag cap', () => {
    it('refuses only the Test that would exceed it, and writes one event for the other', async () => {
      const full = await seedTest({ tags: TWENTY });
      const roomy = await seedTest({ tags: ['a', 'b', 'c'] });
      const report = await ok([full, roomy], 'add', ['new-tag']);
      expect(outcomeOf(report, full)).toMatchObject({ outcome: 'refused', reason: 'tags_limit_exceeded', tags: TWENTY, version: 1 });
      expect(outcomeOf(report, roomy).outcome).toBe('changed');
      expect((await row(full)).version).toBe(1);
      expect(await events(full)).toHaveLength(0);
      expect(await events(roomy)).toHaveLength(1);
    });

    it('accepts an add that lands on exactly 20, and refuses two new tags that cross it as a whole', async () => {
      const t1 = await seedTest({ tags: NINETEEN });
      expect(outcomeOf(await ok([t1], 'add', ['twenty']), t1).tags).toHaveLength(20);
      const t2 = await seedTest({ tags: NINETEEN });
      expect(outcomeOf(await ok([t2], 'add', ['x1', 'x2']), t2).reason).toBe('tags_limit_exceeded');
      expect((await row(t2)).tags).toEqual(NINETEEN);
    });

    it('checks the no-op before the cap, and accepts a remove at the cap', async () => {
      const t1 = await seedTest({ tags: [...NINETEEN, 'smoke'] });
      expect(outcomeOf(await ok([t1], 'add', ['smoke']), t1).outcome).toBe('unchanged');
      const t2 = await seedTest({ tags: TWENTY });
      expect(outcomeOf(await ok([t2], 'remove', ['c1']), t2).tags).toHaveLength(19);
    });
  });

  describe('dry run', () => {
    it('reports exactly what the real call does, and writes nothing', async () => {
      const would = await seedTest();
      const same = await seedTest({ tags: ['smoke'] });
      const full = await seedTest({ tags: TWENTY });
      const ids = [would, same, full];
      const before = await Promise.all(ids.map(row));
      const preview = await ok(ids, 'add', ['smoke'], { dryRun: true });
      expect(preview.dry_run).toBe(true);
      expect(await Promise.all(ids.map(row))).toEqual(before);
      for (const id of ids) { expect(await events(id)).toHaveLength(0); }
      const real = await ok(ids, 'add', ['smoke']);
      expect(preview.outcomes).toEqual(real.outcomes);
      expect({ ...preview, dry_run: false }).toEqual(real);
    });
  });

  describe('selection', () => {
    it('reports missing and foreign ids as not_found, indistinguishably, and changes the rest', async () => {
      const t1 = await seedTest();
      const x1 = await seedTest({ workspaceId: need().foreignWorkspaceId, tags: ['keep'] });
      const r1 = crypto.randomUUID();
      const report = await ok([t1, x1, r1], 'add', ['smoke']);
      expect(outcomeOf(report, t1).outcome).toBe('changed');
      const { test_id: _x, ...foreign } = outcomeOf(report, x1);
      const { test_id: _r, ...missing } = outcomeOf(report, r1);
      expect(foreign).toEqual({ outcome: 'refused', reason: 'not_found', tags: null, version: null });
      expect(missing).toEqual(foreign);
      expect((await row(x1)).tags).toEqual(['keep']);
    });

    it('deduplicates repeated ids: one outcome and at most one event per Test', async () => {
      const t1 = await seedTest();
      const t2 = await seedTest();
      const report = await ok([t1, t1, t2], 'add', ['once']);
      expect(report.requested).toBe(2);
      expect(report.outcomes).toHaveLength(2);
      expect(await events(t1)).toHaveLength(1);
    });

    it('refuses an archived Test per Test and changes the live one', async () => {
      const archived = await seedTest({ archived: true });
      const live = await seedTest();
      const report = await ok([archived, live], 'add', ['smoke']);
      expect(outcomeOf(report, archived)).toMatchObject({ outcome: 'refused', reason: 'archived' });
      expect(outcomeOf(report, live).outcome).toBe('changed');
      expect((await row(archived)).tags).toEqual([]);
    });

    it('accepts 200 distinct ids (plus repeats) and refuses 201 and an empty list with 45129', async () => {
      const t1 = await seedTest();
      const filler = Array.from({ length: 199 }, () => crypto.randomUUID());
      const report = await ok([t1, ...filler, t1, filler[0]], 'add', ['ceiling'], { dryRun: true });
      expect(report.requested).toBe(200);
      expect((await bulk([...filler, t1, crypto.randomUUID()], 'add', ['x'])).error?.code).toBe('45129');
      expect((await bulk([], 'add', ['x'])).error?.code).toBe('45129');
    });
  });

  describe('request-level change validation', () => {
    it('refuses replace, empty, blank, comma, over-length and over-count tag lists with 45130 and writes nothing', async () => {
      const t1 = await seedTest();
      for (const [mode, tags] of [
        ['replace', ['x']],
        ['add', []],
        ['add', ['ok', '  ']],
        ['add', ['a,b']],
        ['add', ['a'.repeat(51)]],
        ['remove', Array.from({ length: 21 }, (_, i) => `t${i}`)],
      ] as Array<[string, string[]]>) {
        expect({ mode, tags, code: (await bulk([t1], mode, tags)).error?.code }).toEqual({ mode, tags, code: '45130' });
      }
      expect((await row(t1)).version).toBe(1);
    });

    it('counts characters, not bytes: a tag of 26 emoji is stored', async () => {
      const t1 = await seedTest();
      const emoji = '😀'.repeat(26);
      expect(outcomeOf(await ok([t1], 'add', [emoji]), t1).tags).toEqual([emoji]);
      expect((await row(t1)).tags).toEqual([emoji]);
    });
  });

  describe('events', () => {
    it('writes one test.tags_changed per changed Test with bulk: true, none for unchanged or refused', async () => {
      const changed = [await seedTest(), await seedTest({ tags: ['a'] }), await seedTest({ tags: ['b'] })];
      const unchanged = [await seedTest({ tags: ['smoke'] }), await seedTest({ tags: ['smoke', 'x'] })];
      const refused = await seedTest({ tags: TWENTY });
      const untouched = [...unchanged, refused];
      const before = await Promise.all(untouched.map(row));
      await ok([...changed, ...unchanged, refused], 'add', ['smoke']);
      for (const id of changed) {
        const written = await events(id);
        expect(written).toHaveLength(1);
        expect(written[0].entity_type).toBe('test');
        expect(written[0].payload).toEqual({ version: 2, old_tags: expect.any(Array), new_tags: expect.arrayContaining(['smoke']), bulk: true });
      }
      for (const id of untouched) {
        expect(await events(id)).toHaveLength(0);
      }
      expect(await Promise.all(untouched.map(row))).toEqual(before);
    });
  });

  describe('concurrency', () => {
    it('a concurrent single-Test PUT and a bulk add both finish, and the result is one serial order', async () => {
      const t1 = await seedTest({ tags: ['a'] });
      const [single, batch] = await Promise.all([
        service().rpc('bunkai_set_test_tags', { p_actor_user_id: need().qaUserId, p_test_id: t1, p_if_match: null as unknown as number, p_tags: ['a', 'b'] }),
        bulk([t1], 'add', ['c']),
      ]);
      expect(single.error).toBeNull();
      expect(batch.error).toBeNull();
      const final = (await row(t1)).tags;
      expect([JSON.stringify(['a', 'b']), JSON.stringify(['a', 'b', 'c'])]).toContain(JSON.stringify(final));
      expect((await row(t1)).version).toBe(3);
    });
  });

  describe('tag filter', () => {
    it('a bulk-added tag is visible in the tag filter, an archived Test is not', async () => {
      const tag = `${PREFIX}-flt`;
      const live = await seedTest();
      const archived = await seedTest({ archived: true, tags: [tag] });
      await ok([live], 'add', [tag]);
      const { data, error } = await service().rpc('bunkai_filter_tests_by_tag', { p_actor_user_id: need().qaUserId, p_tag: tag, p_limit: 50 });
      expect(error).toBeNull();
      const found = ((data as { items: Array<{ id: string }> }).items).map(i => i.id);
      expect(found).toContain(live);
      expect(found).not.toContain(archived);
    });
  });

  describe('authorization', () => {
    it('a viewer is refused by the write gate (42501) and nothing is written', async () => {
      const t1 = await seedTest({ workspaceId: need().viewerWorkspaceId });
      const { error } = await bulk([t1], 'add', ['smoke'], { workspaceId: need().viewerWorkspaceId });
      expect(error?.code).toBe('42501');
      expect((await row(t1)).tags).toEqual([]);
      expect(await events(t1)).toHaveLength(0);
    });

    it('a stranger to the workspace is refused', async () => {
      const t1 = await seedTest({ workspaceId: need().foreignWorkspaceId });
      expect((await bulk([t1], 'add', ['smoke'], { workspaceId: need().foreignWorkspaceId })).error?.code).toBe('42501');
    });

    it('a signed-in session cannot call it directly, even naming itself (service_role only)', async () => {
      const t1 = await seedTest();
      const { error } = await qa.rpc('bunkai_bulk_edit_test_tags', {
        p_actor_user_id: need().qaUserId,
        p_workspace_id: need().workspaceId,
        p_test_ids: [t1],
        p_mode: 'add',
        p_tags: ['smoke'],
        p_dry_run: false,
      });
      expect(error).not.toBeNull();
      expect((await row(t1)).tags).toEqual([]);
    });
  });

  describe('atomicity', () => {
    it('a failure before the event rolls back that Test only, and the other Test in the call still changes', async () => {
      const t1 = await seedTest();
      const t2 = await seedTest();
      const db = service();
      must(await db.from('bunkai_test_failpoints').insert({ name: `${FAILPOINT}:${t1}`, workspace_id: need().workspaceId }).select('name').single(), 'failpoint');
      try {
        const report = await ok([t1, t2], 'add', ['smoke']);
        expect(outcomeOf(report, t1)).toMatchObject({ outcome: 'refused', reason: 'write_failed', tags: [], version: 1 });
        expect((await row(t1)).tags).toEqual([]);
        expect(await events(t1)).toHaveLength(0);
        expect(outcomeOf(report, t2)).toMatchObject({ outcome: 'changed', tags: ['smoke'], version: 2 });
        expect((await row(t2)).tags).toEqual(['smoke']);
        expect(await events(t2)).toHaveLength(1);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('workspace_id', need().workspaceId);
      }
    });
  });
});
