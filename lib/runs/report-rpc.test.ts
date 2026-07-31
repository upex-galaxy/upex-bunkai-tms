import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-38 — DB-integration guard for the project Run-report RPC
// (`bunkai_report_project_runs`, migration 0041_run_project_report.sql). This
// is the DB-layer sibling of the pure unit suites the API/UI slices will add
// later (`report-validation.test.ts`, `report-view.test.ts`): it drives the
// REAL server-side rulebook against a live database and asserts the two
// SQL-resident behaviors the BK-38 implementation plan's Unit Test Authoring
// Gate assigns to this file, plus the pagination-correctness proxy for
// ATC-08 (load-testing itself is explicitly out of scope, environment-bound):
//
//   * Technical Decision D2 — totals (`passed`/`failed`) are recomputed from
//     the SAME filtered set as the rows, NOT all-time/filter-invariant like
//     BK-37's `bunkai_list_test_runs`. The SAME call with vs. without a
//     module filter must return DIFFERENT totals, matching the filtered
//     subset exactly — this is the case that would catch D2 being
//     implemented as a second, filter-blind query.
//   * Technical Decision D3 — the `date_from`/`date_to` predicate is a UTC
//     calendar-day match on `started_at::date`, inclusive on BOTH ends. Rows
//     seeded strictly before, exactly on the start boundary, inside, exactly
//     on the end boundary, and strictly after must resolve to exactly the
//     middle three being returned.
//   * Keyset pagination correctness — two consecutive pages of a set larger
//     than one page cover it exactly once (no duplicate, no skipped row),
//     staying newest-first across the page seam.
//
// SEC-1 (project/workspace isolation + actor-bind spoof guard) is a
// DEDICATED file (`lib/runs/report-isolation.test.ts`, mirrors
// `lib/runs/history-isolation.test.ts`) owned by a LATER slice — out of
// scope here by design, not an oversight.
//
// DB-dependent + env-gated, cloned from `lib/runs/history-isolation.test.ts`:
// when the Supabase env is absent the suite SKIPS LOUDLY (describe.skip).
// When present but the RPC has not been deployed yet, or the seed state
// cannot satisfy a precondition, it logs and passes — it never blocks a
// build on migration or seed state.
//
// Every fixture (project, environment, modules, test, runs) is created fresh
// and tagged with a unique per-suite prefix, then torn down in afterAll —
// mirrors BK-37's own "seed exact counts, don't trust ambient data" approach,
// scaled from Test-scoped to Project-scoped since BK-38 filters by
// `project_id`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RPC = 'bunkai_report_project_runs';
const PREFIX = `bk38-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface MemberRow { user_id: string, workspace_id: string, status: string }
interface ReportItem {
  id: string
  test_id: string
  test_title: string
  module_id: string | null
  module_name: string | null
  environment_id: string
  environment_name: string | null
  executor_mode: string
  status: string
  started_at: string
  finished_at: string | null
}
interface ReportPage {
  items: ReportItem[]
  totals: { passed: number, failed: number }
  next_cursor: { started_at: string, id: string } | null
}
interface Fixture {
  actorUserId: string
  workspaceId: string
  projectId: string
  environmentId: string
  moduleAId: string
  moduleBId: string
  moduleCId: string
  testId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function isoMinutesBefore(base: number, minutes: number): string {
  return new Date(base - minutes * 60_000).toISOString();
}

function isoOnDate(isoDate: string): string {
  // Midday UTC so the calendar-day cast (`started_at::date`) is unambiguous
  // regardless of the runner's own timezone.
  return `${isoDate}T12:00:00.000Z`;
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-38 — bunkai_report_project_runs', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the RPC deployed? Probe with a nonexistent Project: a deployed
    //    RPC answers P0002; an undeployed one answers "function does not
    //    exist".
    const probe = await db.rpc(RPC, {
      p_actor_user_id: ZERO_UUID,
      p_project_id: ZERO_UUID,
    });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `bunkai_report_project_runs is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0041_run_project_report.sql.`;
      return;
    }

    // 1. Any active workspace member anchors the throwaway fixtures below —
    //    the report RPC only needs ANY active role (viewers included).
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, status')
      .eq('status', 'active')
      .limit(1);
    if (membersError) { throw membersError; }
    const anchor = (members ?? [])[0] as MemberRow | undefined;
    if (!anchor) {
      skipReason = 'need at least one active workspace member (seed state).';
      return;
    }

    // 2. A throwaway Project + Environment + two Modules + one Test, all
    //    scoped to this suite's prefix so counts are exact regardless of
    //    ambient data elsewhere in the shared DB.
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: anchor.workspace_id, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    const projectId = project.id as string;

    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: projectId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentError) { throw environmentError; }

    const { data: modules, error: modulesError } = await db
      .from('modules')
      .insert([
        { project_id: projectId, path: 'module-a', name: 'Module A' },
        { project_id: projectId, path: 'module-b', name: 'Module B' },
        { project_id: projectId, path: 'module-c', name: 'Module C' },
      ])
      .select('id, path');
    if (modulesError) { throw modulesError; }
    const moduleAId = (modules ?? []).find(m => m.path === 'module-a')!.id as string;
    const moduleBId = (modules ?? []).find(m => m.path === 'module-b')!.id as string;
    const moduleCId = (modules ?? []).find(m => m.path === 'module-c')!.id as string;

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspace_id, title: `${PREFIX} test`, created_by: anchor.user_id })
      .select('id')
      .single();
    if (testError) { throw testError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectId,
      environmentId: environment.id as string,
      moduleAId,
      moduleBId,
      moduleCId,
      testId: test.id as string,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Runs first: runs.test_id is ON DELETE RESTRICT.
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    // Project delete cascades project_environments + modules; do this before
    // the Test delete so nothing still references it.
    await db.from('projects').delete().eq('id', fixture.projectId);
    await db.from('tests').delete().eq('id', fixture.testId);
  });

  describe('BK-38-ATC-06 — Project with zero Runs (first-use empty state), DB-integration layer', () => {
    // The UI-layer branch (`resolveReportViewState`'s no-runs case) is already
    // covered in `lib/runs/report-view.test.ts` ("zero rows, no filters -> the
    // no-runs empty state (ATC-06)"). This is its DB-integration sibling: a
    // Project that genuinely has NO Runs at all must resolve, by construction,
    // to the SAME zero-row shape that Project's `resolveReportViewState`
    // caller expects — `items: []`, zeroed `totals`, and no `next_cursor`. A
    // dedicated, run-free Project (not the shared `fixture.projectId`, which
    // gains rows in the sibling describe blocks below) keeps this case exact
    // regardless of execution order.
    let zeroRunsProjectId: string | null = null;

    beforeAll(async () => {
      if (!fixture) { return; }
      const db = service();
      const { data: project, error } = await db
        .from('projects')
        .insert({ workspace_id: fixture.workspaceId, slug: `${PREFIX}-zero-runs-project`, name: `${PREFIX} zero runs project` })
        .select('id')
        .single();
      if (error) { throw error; }
      zeroRunsProjectId = project.id as string;
    });

    afterAll(async () => {
      if (!zeroRunsProjectId) { return; }
      const db = service();
      await db.from('projects').delete().eq('id', zeroRunsProjectId);
    });

    it('returns an empty page with zeroed totals and no next_cursor', async () => {
      if (!fixture || !zeroRunsProjectId) { return warn(); }
      const page = await reportRuns(zeroRunsProjectId, fixture.actorUserId);
      expect(page.items).toEqual([]);
      expect(page.totals).toEqual({ passed: 0, failed: 0 });
      expect(page.next_cursor).toBeNull();
    });
  });

  describe('Technical Decision D2 — totals recompute from the filtered set', () => {
    // run1 passed/module-a/human, run2 failed/module-a/human,
    // run3 passed/module-b/agent, run4 aborted/module-b/agent,
    // run5 running/module-a/ci, run6 passed/module-b/human.
    const baseRow = () => ({
      workspace_id: fixture!.workspaceId,
      project_id: fixture!.projectId,
      test_id: fixture!.testId,
      environment_id: fixture!.environmentId,
      test_title: `${PREFIX} test`,
    });

    beforeAll(async () => {
      if (!fixture) { return; }
      const db = service();
      const base = Date.parse('2026-03-01T12:00:00.000Z');
      const rows = [
        { key: 'run1', module_id: fixture.moduleAId, status: 'passed', executor_mode: 'human' },
        { key: 'run2', module_id: fixture.moduleAId, status: 'failed', executor_mode: 'human' },
        { key: 'run3', module_id: fixture.moduleBId, status: 'passed', executor_mode: 'agent' },
        { key: 'run4', module_id: fixture.moduleBId, status: 'aborted', executor_mode: 'agent' },
        { key: 'run5', module_id: fixture.moduleAId, status: 'running', executor_mode: 'ci' },
        { key: 'run6', module_id: fixture.moduleBId, status: 'passed', executor_mode: 'human' },
      ].map((r, i) => ({
        ...baseRow(),
        module_id: r.module_id,
        status: r.status,
        executor_mode: r.executor_mode,
        // runs_abort_reason_chk (0036_run_abort.sql) requires a 3..500 char
        // reason on every aborted row, and NULL everywhere else.
        abort_reason: r.status === 'aborted' ? 'Seeded by the BK-38 report-rpc totals suite.' : null,
        start_token: `${PREFIX}-totals-${r.key}`,
        started_at: isoMinutesBefore(base, i),
        finished_at: r.status === 'running' ? null : new Date(base - i * 60_000 + 30_000).toISOString(),
      }));
      const { error } = await db.from('runs').insert(rows);
      if (error) { throw error; }
    });

    it('unfiltered view includes every row (running + aborted included, not just terminal)', async () => {
      if (!fixture) { return warn(); }
      const page = await reportRuns(fixture.projectId, fixture.actorUserId);
      const ids = page.items.map(i => i.id);
      expect(ids.length).toBeGreaterThanOrEqual(6);
      const statuses = page.items.map(i => i.status);
      expect(statuses).toContain('running');
      expect(statuses).toContain('aborted');
    });

    it('unfiltered totals count passed/failed across the whole project set', async () => {
      if (!fixture) { return warn(); }
      const page = await reportRuns(fixture.projectId, fixture.actorUserId);
      // 3 passed (run1, run3, run6) + 1 failed (run2) among this suite's rows;
      // totals is additive over whatever else already exists for this
      // throwaway project (nothing else does, since the project is fresh).
      expect(page.totals).toEqual({ passed: 3, failed: 1 });
    });

    it('module filter narrows BOTH rows and totals to a DIFFERENT value than unfiltered', async () => {
      if (!fixture) { return warn(); }
      const unfiltered = await reportRuns(fixture.projectId, fixture.actorUserId);
      const moduleA = await reportRuns(fixture.projectId, fixture.actorUserId, { moduleId: fixture.moduleAId });
      const moduleB = await reportRuns(fixture.projectId, fixture.actorUserId, { moduleId: fixture.moduleBId });

      // The filtered totals must differ from the unfiltered totals — this is
      // exactly the case that would catch D2 being computed all-time instead
      // of from the filtered set.
      expect(moduleA.totals).not.toEqual(unfiltered.totals);
      expect(moduleB.totals).not.toEqual(unfiltered.totals);

      // module-a: run1 (passed), run2 (failed), run5 (running, not counted).
      expect(moduleA.totals).toEqual({ passed: 1, failed: 1 });
      expect(moduleA.items.every(i => i.module_id === fixture!.moduleAId)).toBe(true);
      expect(moduleA.items).toHaveLength(3);

      // module-b: run3 (passed), run4 (aborted, not counted), run6 (passed).
      expect(moduleB.totals).toEqual({ passed: 2, failed: 0 });
      expect(moduleB.items.every(i => i.module_id === fixture!.moduleBId)).toBe(true);
      expect(moduleB.items).toHaveLength(3);
    });

    it('executor filter narrows totals independently of the module filter', async () => {
      if (!fixture) { return warn(); }
      const agentOnly = await reportRuns(fixture.projectId, fixture.actorUserId, { executorMode: ['agent'] });
      // run3 (passed) + run4 (aborted, not counted).
      expect(agentOnly.totals).toEqual({ passed: 1, failed: 0 });
      expect(agentOnly.items).toHaveLength(2);
      expect(agentOnly.items.every(i => i.executor_mode === 'agent')).toBe(true);
    });

    it('status filter narrows to exactly the requested statuses', async () => {
      if (!fixture) { return warn(); }
      const abortedOnly = await reportRuns(fixture.projectId, fixture.actorUserId, { status: ['aborted'] });
      expect(abortedOnly.items).toHaveLength(1);
      expect(abortedOnly.items[0].status).toBe('aborted');
      // Aborted never counts toward passed/failed totals.
      expect(abortedOnly.totals).toEqual({ passed: 0, failed: 0 });
    });

    it('combined module + status filters compose with AND', async () => {
      if (!fixture) { return warn(); }
      const combined = await reportRuns(fixture.projectId, fixture.actorUserId, {
        moduleId: fixture.moduleBId,
        status: ['passed'],
      });
      // module-b AND passed: run3, run6.
      expect(combined.items).toHaveLength(2);
      expect(combined.items.every(i => i.module_id === fixture!.moduleBId && i.status === 'passed')).toBe(true);
      expect(combined.totals).toEqual({ passed: 2, failed: 0 });
    });
  });

  describe('Technical Decision D3 — date range is UTC calendar day, inclusive both ends', () => {
    const DAY_BEFORE = '2026-04-09';
    const START = '2026-04-10';
    const INSIDE = '2026-04-11';
    const END = '2026-04-12';
    const DAY_AFTER = '2026-04-13';

    let idByDate: Record<string, string> = {};

    beforeAll(async () => {
      if (!fixture) { return; }
      const db = service();
      const dates = [DAY_BEFORE, START, INSIDE, END, DAY_AFTER];
      const rows = dates.map(d => ({
        id: crypto.randomUUID(),
        workspace_id: fixture!.workspaceId,
        project_id: fixture!.projectId,
        test_id: fixture!.testId,
        environment_id: fixture!.environmentId,
        module_id: fixture!.moduleAId,
        test_title: `${PREFIX} test`,
        status: 'passed',
        executor_mode: 'human',
        start_token: `${PREFIX}-daterange-${d}`,
        started_at: isoOnDate(d),
        finished_at: new Date(Date.parse(isoOnDate(d)) + 30_000).toISOString(),
      }));
      idByDate = Object.fromEntries(dates.map((d, i) => [d, rows[i].id]));
      const { error } = await db.from('runs').insert(rows);
      if (error) { throw error; }
    });

    it('excludes the day before the start and the day after the end', async () => {
      if (!fixture) { return warn(); }
      const page = await reportRuns(fixture.projectId, fixture.actorUserId, {
        dateFrom: START,
        dateTo: END,
        moduleId: fixture.moduleAId,
      });
      const ids = page.items.map(i => i.id);
      expect(ids).not.toContain(idByDate[DAY_BEFORE]);
      expect(ids).not.toContain(idByDate[DAY_AFTER]);
    });

    it('includes exactly the on-start and on-end boundary rows, plus the row inside', async () => {
      if (!fixture) { return warn(); }
      const page = await reportRuns(fixture.projectId, fixture.actorUserId, {
        dateFrom: START,
        dateTo: END,
        moduleId: fixture.moduleAId,
      });
      const ids = page.items.map(i => i.id);
      expect(ids).toContain(idByDate[START]);
      expect(ids).toContain(idByDate[INSIDE]);
      expect(ids).toContain(idByDate[END]);
      expect(ids.filter(id => Object.values(idByDate).includes(id))).toHaveLength(3);
    });
  });

  describe('Keyset pagination correctness (ATC-08 proxy — load testing is environment-bound, out of scope)', () => {
    const TOTAL = 55;
    const PAGE_SIZE = 50;

    beforeAll(async () => {
      if (!fixture) { return; }
      const db = service();
      const base = Date.parse('2026-05-01T12:00:00.000Z');
      const rows = Array.from({ length: TOTAL }, (_, i) => ({
        id: crypto.randomUUID(),
        workspace_id: fixture!.workspaceId,
        project_id: fixture!.projectId,
        test_id: fixture!.testId,
        environment_id: fixture!.environmentId,
        module_id: fixture!.moduleCId,
        test_title: `${PREFIX} test`,
        status: 'passed',
        executor_mode: 'human',
        start_token: `${PREFIX}-page-${i}`,
        started_at: isoMinutesBefore(base, i),
        finished_at: new Date(base - i * 60_000 + 30_000).toISOString(),
      }));
      const { error } = await db.from('runs').insert(rows);
      if (error) { throw error; }
    });

    it('two consecutive pages cover the set exactly once, newest-first across the seam', async () => {
      if (!fixture) { return warn(); }
      // Scope to this group's own module (module-c, untouched by the other
      // describe blocks) so the page is exactly this suite's 55 rows.
      const first = await reportRuns(fixture.projectId, fixture.actorUserId, {
        moduleId: fixture.moduleCId,
        status: ['passed'],
        limit: PAGE_SIZE,
      });
      expect(first.items).toHaveLength(PAGE_SIZE);
      expect(first.next_cursor).not.toBeNull();

      const second = await reportRuns(fixture.projectId, fixture.actorUserId, {
        moduleId: fixture.moduleCId,
        status: ['passed'],
        limit: PAGE_SIZE,
        cursor: first.next_cursor,
      });
      expect(second.items).toHaveLength(TOTAL - PAGE_SIZE);
      expect(second.next_cursor).toBeNull();

      const ids = [...first.items, ...second.items].map(i => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(TOTAL);

      const timestamps = [...first.items, ...second.items].map(i => Date.parse(i.started_at));
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });
  });
});

// One RPC call, typed at the seam.
async function reportRuns(
  projectId: string,
  actorUserId: string,
  opts: {
    dateFrom?: string
    dateTo?: string
    moduleId?: string
    status?: string[]
    executorMode?: string[]
    limit?: number
    cursor?: { started_at: string, id: string } | null
  } = {},
): Promise<ReportPage> {
  const db = service();
  const { data, error } = await db.rpc(RPC, {
    p_actor_user_id: actorUserId,
    p_project_id: projectId,
    p_date_from: opts.dateFrom ?? undefined,
    p_date_to: opts.dateTo ?? undefined,
    p_module_id: opts.moduleId ?? undefined,
    p_status: opts.status ?? undefined,
    p_executor_mode: opts.executorMode ?? undefined,
    p_limit: opts.limit ?? undefined,
    p_cursor_started_at: opts.cursor?.started_at ?? undefined,
    p_cursor_id: opts.cursor?.id ?? undefined,
  });
  if (error) { throw error; }
  return data as unknown as ReportPage;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[report-rpc] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
