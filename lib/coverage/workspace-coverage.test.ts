import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-1169 — DB-integration proof for migration 0109
// (0109_workspace_coverage_report.sql): `bunkai_report_workspace_coverage`
// answers, in one call, exactly the sum of `bunkai_report_project_coverage`
// over every project of the workspace, and keeps its non-disclosure P0002.
//
// Read-only: no fixture is seeded. The parity cases run on the live
// workspaces holding the most acceptance criteria, so they cover executed,
// not-run, uncovered and fully covered modules as they exist in the shared
// database. Service role is used ONLY to call the RPCs with an explicit actor
// id (the coverage-isolation.test.ts precedent); no session is obtained.
//
// FAIL-CLOSED GATE (coverage-repeated-atc.test.ts precedent). Registered as
// SKIPPED, with a loud warning, in exactly one case: no database environment
// (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY absent). Migration
// 0109 is applied, so every other outcome FAILS, including finding no
// workspace to compare. Every test asserts at least once.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDbEnv = Boolean(url && serviceKey);
const TAG = '[workspace-coverage]';

const KPI_KEYS = ['ac_total', 'ac_bound', 'ac_executed', 'modules_total', 'modules_fully_covered'] as const;
type Kpis = Record<(typeof KPI_KEYS)[number], number>;
interface WorkspacePayload { kpis: Kpis, project_count: number }

const PARITY_WORKSPACES = 3;
const MAX_PROJECTS_PER_WORKSPACE = 25;

if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED: no database environment (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). This file is NOT evidence until it runs.`);
}

const service = () => createClient(url!, serviceKey!, { auth: { persistSession: false } });

// The live workspaces with the most acceptance criteria whose project count
// keeps the per-project comparison cheap, each with one active member.
async function parityTargets(): Promise<{ workspaceId: string, actorUserId: string, projectIds: string[] }[]> {
  const db = service();
  const { data: acs, error } = await db
    .from('acceptance_criteria')
    .select('user_stories!inner(modules!inner(projects!inner(workspace_id)))')
    .is('archived_at', null)
    .limit(1000);
  if (error) { throw new Error(`${TAG} AC scan failed: ${error.message}`); }
  const perWorkspace = new Map<string, number>();
  for (const row of acs as unknown as { user_stories: { modules: { projects: { workspace_id: string } } } }[]) {
    const ws = row.user_stories.modules.projects.workspace_id;
    perWorkspace.set(ws, (perWorkspace.get(ws) ?? 0) + 1);
  }
  const targets: { workspaceId: string, actorUserId: string, projectIds: string[] }[] = [];
  for (const [workspaceId] of [...perWorkspace].sort((a, b) => b[1] - a[1])) {
    if (targets.length === PARITY_WORKSPACES) { break; }
    const { data: ws } = await db.from('workspaces').select('id').eq('id', workspaceId).is('deleted_at', null);
    if (!ws?.length) { continue; }
    const { data: projects } = await db.from('projects').select('id').eq('workspace_id', workspaceId).limit(MAX_PROJECTS_PER_WORKSPACE + 1);
    if (!projects || projects.length > MAX_PROJECTS_PER_WORKSPACE) { continue; }
    const { data: member } = await db.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('status', 'active').limit(1);
    if (!member?.length) { continue; }
    targets.push({ workspaceId, actorUserId: member[0].user_id, projectIds: projects.map(p => p.id) });
  }
  return targets;
}

describe.skipIf(!hasDbEnv)('bunkai_report_workspace_coverage (0109)', () => {
  it('equals the sum of the per-project coverage kpis', async () => {
    expect.hasAssertions();
    const db = service();
    const targets = await parityTargets();
    expect(targets.length).toBeGreaterThan(0);

    for (const { workspaceId, actorUserId, projectIds } of targets) {
      const { data, error } = await db.rpc('bunkai_report_workspace_coverage', { p_actor_user_id: actorUserId, p_workspace_id: workspaceId });
      expect(error).toBeNull();
      const workspace = data as unknown as WorkspacePayload;

      const sum = Object.fromEntries(KPI_KEYS.map(k => [k, 0])) as Kpis;
      for (const projectId of projectIds) {
        const project = await db.rpc('bunkai_report_project_coverage', { p_actor_user_id: actorUserId, p_project_id: projectId });
        expect(project.error).toBeNull();
        const kpis = (project.data as unknown as { kpis: Kpis }).kpis;
        for (const k of KPI_KEYS) { sum[k] += kpis[k]; }
      }

      expect({ workspaceId, ...workspace.kpis }).toEqual({ workspaceId, ...sum });
      expect(workspace.project_count).toBe(projectIds.length);
    }
  }, 120_000);

  it('answers a nonexistent workspace with the non-disclosing P0002', async () => {
    expect.hasAssertions();
    const [target] = await parityTargets();
    expect(target).toBeDefined();
    const { error } = await service().rpc('bunkai_report_workspace_coverage', { p_actor_user_id: target.actorUserId, p_workspace_id: randomUUID() });
    expect(error?.code).toBe('P0002');
  }, 60_000);

  it('answers a non-member actor with the same P0002', async () => {
    expect.hasAssertions();
    const [target] = await parityTargets();
    expect(target).toBeDefined();
    const { error } = await service().rpc('bunkai_report_workspace_coverage', { p_actor_user_id: randomUUID(), p_workspace_id: target.workspaceId });
    expect(error?.code).toBe('P0002');
  }, 60_000);
});
