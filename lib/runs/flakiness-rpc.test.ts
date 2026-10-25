import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-554 — integration guard for the `flakiness` key of `bunkai_list_test_runs`
// (migration 0099). Seeds throwaway Tests with hand-laid verdict sequences
// (oldest -> newest) and asserts the raw counts the UI derives its band from:
// window of 10, flips over consecutive pairs, Aborted skipped (not a break) and
// disclosed, in-progress ignored, filter-invariant, non-member denied.
// Env-gated like history-isolation.test.ts: skips without DB creds.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && serviceKey ? describe : describe.skip;
const PREFIX = `bk554-flaky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// P/F/A/R = passed/failed/aborted/running, oldest first.
const CASES: Record<string, string> = {
  alternating: 'PFPFPFPFPF',
  stable: 'PPPPPPPPPP',
  recovery: 'FFFFFFPPPP',
  pppFppP: 'FPPPPAPP',
  eleven: 'FPPPPPPPPPP',
  allAborted: 'AAA',
  withRunning: 'PFPFPR',
};
const EXPECTED: Record<string, { sample: number, flips: number, aborted_skipped: number }> = {
  alternating: { sample: 10, flips: 9, aborted_skipped: 0 },
  stable: { sample: 10, flips: 0, aborted_skipped: 0 },
  recovery: { sample: 10, flips: 1, aborted_skipped: 0 },
  // newest-first: P P A P P P P F -> sample 7 verdicts, abort inside span, 1 flip
  pppFppP: { sample: 7, flips: 1, aborted_skipped: 1 },
  // 11 verdict runs: oldest F is outside the window, so no flip
  eleven: { sample: 10, flips: 0, aborted_skipped: 0 },
  allAborted: { sample: 0, flips: 0, aborted_skipped: 3 },
  withRunning: { sample: 5, flips: 4, aborted_skipped: 0 },
};
const STATUS = { P: 'passed', F: 'failed', A: 'aborted', R: 'running' } as const;

interface Flakiness { sample: number, flips: number, aborted_skipped: number }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

const testIds = new Map<string, string>();
let anchor: { workspaceId: string, userId: string } | null = null;
let foreignUserId: string | null = null;
let deployed = true;

describeOrSkip('BK-554 — bunkai_list_test_runs flakiness counts', () => {
  beforeAll(async () => {
    const db = service();
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id').eq('status', 'active');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: envs } = await db.from('project_environments').select('id, project_id');
    const all = members ?? [];
    let found: { workspaceId: string, userId: string, projectId: string, environmentId: string } | undefined;
    for (const m of all) {
      const p = (projects ?? []).find(pp => pp.workspace_id === m.workspace_id && (envs ?? []).some(e => e.project_id === pp.id));
      if (p) {
        found = { workspaceId: m.workspace_id, userId: m.user_id, projectId: p.id, environmentId: (envs ?? []).find(e => e.project_id === p.id)!.id };
        break;
      }
    }
    if (!found) { deployed = false; return; }
    anchor = { workspaceId: found.workspaceId, userId: found.userId };
    foreignUserId = all.find(m => m.workspace_id !== found.workspaceId)?.user_id ?? null;

    const names = Object.keys(CASES);
    const { data: tests, error } = await db.from('tests')
      .insert(names.map(n => ({ workspace_id: found.workspaceId, title: `${PREFIX} ${n}`, created_by: found.userId })))
      .select('id, title');
    if (error) { throw error; }
    for (const t of tests ?? []) { testIds.set(t.title.slice(PREFIX.length + 1), t.id); }

    const base = Date.parse('2026-08-01T12:00:00.000Z');
    const rows = names.flatMap(n => [...CASES[n]].map((c, i) => {
      const startedAt = new Date(base + i * 60_000).toISOString();
      const status = STATUS[c as keyof typeof STATUS];
      return {
        id: crypto.randomUUID(),
        workspace_id: found.workspaceId,
        project_id: found.projectId,
        test_id: testIds.get(n)!,
        environment_id: found.environmentId,
        status,
        abort_reason: status === 'aborted' ? 'Seeded by BK-554 suite.' : null,
        executor_mode: 'human',
        executor_user_id: found.userId,
        start_token: `${PREFIX}-${n}-${i}`,
        test_title: `${PREFIX} ${n}`,
        started_at: startedAt,
        finished_at: status === 'running' ? null : new Date(Date.parse(startedAt) + 5000).toISOString(),
      };
    }));
    const { error: runsError } = await db.from('runs').insert(rows);
    if (runsError) { throw runsError; }

    const probe = await db.rpc('bunkai_list_test_runs', { p_actor_user_id: found.userId, p_test_id: testIds.get('stable')! });
    deployed = !probe.error && probe.data !== null && 'flakiness' in (probe.data as object);
  });

  afterAll(async () => {
    const db = service();
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('tests').delete().in('id', [...testIds.values()]);
  });

  async function read(name: string, outcome: string | null = null, actor?: string) {
    return service().rpc('bunkai_list_test_runs', {
      p_actor_user_id: actor ?? anchor!.userId,
      p_test_id: testIds.get(name)!,
      p_outcome: outcome ?? undefined,
    });
  }

  for (const name of Object.keys(CASES)) {
    it(`${name}: raw counts match the hand count`, async () => {
      if (!anchor || !deployed) { return; }
      const { data, error } = await read(name);
      expect(error).toBeNull();
      expect((data as unknown as { flakiness: Flakiness }).flakiness).toEqual(EXPECTED[name]);
    });
  }

  it('is filter-invariant', async () => {
    if (!anchor || !deployed) { return; }
    const all = (await read('alternating')).data as unknown as { flakiness: Flakiness };
    const failed = (await read('alternating', 'failed')).data as unknown as { flakiness: Flakiness, items: unknown[] };
    expect(failed.items).toHaveLength(5);
    expect(failed.flakiness).toEqual(all.flakiness);
  });

  it('denies a non-member exactly like a missing Test (P0002)', async () => {
    if (!anchor || !deployed || !foreignUserId) { return; }
    const { error } = await read('alternating', null, foreignUserId);
    expect(error?.code).toBe('P0002');
  });
});
