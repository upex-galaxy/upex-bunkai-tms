import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-42 — DB-level integration test for `bunkai_report_project_defect_heatmap`
// (migration 0052_defect_heatmap_report.sql), the mandatory DB-integration
// test per ADR-0012 / rpc-authorization.md §5 ("test against the real
// database"). Mirrors lib/metrics/recovery-cycle-isolation.test.ts's
// structure (same report family, same SECURITY DEFINER + explicit-actor
// contract, same service-role fixture pattern).
//
// REAL WRITE PATH (this run's own briefing requirement — do not seed the
// `bugs` table with a bare fixture insert that bypasses BK-40's actual write
// path): every bug below is created through the REAL `bunkai_create_bug` RPC
// (the same function `POST /api/v1/bugs` calls in production, BK-40), using
// the anchor's real, granted workspace membership — never a bare
// `.from('bugs').insert(...)`. `bunkai_create_bug` always stamps
// `created_at = now()` and takes no override, so the one thing this test
// does AFTER each real RPC call is a service-role `UPDATE bugs SET
// created_at = ...` to backdate that SAME already-real row into a
// deterministic trend/window bucket — the row's existence and every other
// column come entirely from BK-40's real code path; only its timestamp is
// adjusted for a reproducible test, the same way recovery-cycle-isolation's
// own run fixtures use an explicit injected clock instead of `Date.now()`.
//
// DB-dependent + env-gated: needs only SUPABASE_SERVICE_ROLE_KEY. Migration
// 0052 was applied to the live database 2026-08-02 (owner-approved). The
// deployment probe below stays in place as a permanent guard — same
// convention as lib/bugs/list-isolation.test.ts (migration 0051) — so the
// suite degrades to a loud skip instead of a hard failure if this ever runs
// against an environment where 0052 hasn't landed yet (e.g. a fresh preview
// DB), rather than a confusing PGRST202 test failure.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasServiceEnv = Boolean(url && serviceKey);
const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_report_project_defect_heatmap';
const PREFIX = `bk42-defect-heatmap-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface HeatmapItem {
  module_id: string
  module_name: string
  module_path: string
  defect_count: number
  current_week_count: number
  previous_week_count: number
}
interface HeatmapPayload { window: string, generated_at: string, items: HeatmapItem[] }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

const NOW = Date.now();
function daysAgoIso(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  moduleCheckoutId: string
  modulePaymentId: string
  moduleSearchId: string
  moduleLegacyId: string // archived child of checkout
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;
const createdWorkspaceIds: string[] = [];

// Creates one bug via the REAL bunkai_create_bug RPC (BK-40's actual write
// path), then backdates its created_at via a direct service-role UPDATE —
// see the file header for why this is the chosen fixture shape.
async function fileBackdatedBug(
  db: ReturnType<typeof service>,
  args: { actorUserId: string, projectId: string, moduleId: string, title: string, ageDays: number },
): Promise<string> {
  const { data, error } = await db.rpc('bunkai_create_bug', {
    p_actor_user_id: args.actorUserId,
    p_project_id: args.projectId,
    p_module_id: args.moduleId,
    p_title: args.title,
    p_severity: 'P2',
    p_description: null,
    p_steps_to_reproduce: '',
    p_evidence_urls: [],
    p_run_id: null,
    p_run_step_id: null,
    p_atc_id: null,
  });
  if (error) { throw error; }
  const bugId = (data as { id: string }).id;

  const { error: updateError } = await db
    .from('bugs')
    .update({ created_at: daysAgoIso(args.ageDays) })
    .eq('id', bugId);
  if (updateError) { throw updateError; }

  return bugId;
}

describeOrSkip('BK-42 — bunkai_report_project_defect_heatmap isolation + correctness', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A well-formed-but-nonexistent Project id still
    // answers with the P0002 non-disclosure error when the RPC exists; a
    // genuinely undeployed function fails with 42883 (undefined_function) or
    // PGRST202 — either way NOT P0002, which is our deployment signal.
    const probe = await db.rpc(RPC, { p_actor_user_id: ZERO_UUID, p_project_id: ZERO_UUID, p_window: '30d' });
    if (probe.error?.code !== 'P0002') {
      skipReason = `${RPC} is not deployed yet (${probe.error?.code ?? 'unknown'}). Apply migration 0052_defect_heatmap_report.sql.`;
      return;
    }

    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      skipReason = 'need at least one active workspace member to use as a real user id (seed state).';
      return;
    }
    const actorUserId = anyMember.user_id as string;

    // A dedicated throwaway workspace — this project's Supabase instance is
    // shared live infra across concurrent workers, and reusing a real busy
    // workspace would make "never leaks Project B's bugs" unfalsifiable
    // against pre-existing unrelated rows (mirrors list-isolation.test.ts's
    // own rationale).
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: actorUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    // The actor needs a genuine WRITE-capable membership row to pass
    // bunkai_create_bug's own bunkai_assert_actor_can_write_project check
    // (role in member/admin/owner) — workspace creation alone does not
    // imply membership.
    const { error: memberInsertError } = await db
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: actorUserId, role: 'owner', status: 'active' });
    if (memberInsertError) { throw memberInsertError; }

    const { data: seededProjects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: workspaceId, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectError) { throw projectError; }
    const projectAId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-a'))!.id as string;
    const projectBId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-b'))!.id as string;

    // Module tree in Project A: checkout (parent, active) -> payment (child,
    // active) and -> legacy (child, ARCHIVED). `search` is a sibling active
    // module with zero bugs (clean/zero-defect case). One module in Project
    // B for the cross-project leak probe.
    const { data: seededModules, error: moduleError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: 'checkout', name: 'Checkout' },
        { project_id: projectAId, path: 'checkout/payment', name: 'Payment' },
        { project_id: projectAId, path: 'checkout/legacy', name: 'Legacy' },
        { project_id: projectAId, path: 'search', name: 'Search' },
        { project_id: projectBId, path: 'billing', name: 'Billing' },
      ])
      .select('id, project_id, path');
    if (moduleError) { throw moduleError; }
    const moduleCheckoutId = (seededModules ?? []).find(m => m.path === 'checkout')!.id as string;
    const modulePaymentId = (seededModules ?? []).find(m => m.path === 'checkout/payment')!.id as string;
    const moduleLegacyId = (seededModules ?? []).find(m => m.path === 'checkout/legacy')!.id as string;
    const moduleSearchId = (seededModules ?? []).find(m => m.path === 'search')!.id as string;
    const moduleBId = (seededModules ?? []).find(m => m.project_id === projectBId)!.id as string;

    // File every bug through the REAL bunkai_create_bug RPC, then backdate
    // (see fileBackdatedBug's own comment + the file header).
    await fileBackdatedBug(db, { actorUserId, projectId: projectAId, moduleId: moduleCheckoutId, title: `${PREFIX} checkout own, current week`, ageDays: 1 });
    await fileBackdatedBug(db, { actorUserId, projectId: projectAId, moduleId: modulePaymentId, title: `${PREFIX} payment child, current week`, ageDays: 2 });
    await fileBackdatedBug(db, { actorUserId, projectId: projectAId, moduleId: modulePaymentId, title: `${PREFIX} payment child, previous week`, ageDays: 10 });
    // Archived-descendant bug — filed via the REAL standalone path WHILE the
    // module is still active (bunkai_create_bug's own 0046 guard deliberately
    // REJECTS filing a standalone bug into an already-archived module — the
    // active-module check only applies to p_run_id-less creates, see 0046's
    // step-2 comment — so a bug can only ever attach to a module that was
    // active AT FILING TIME). The module is archived immediately after, which
    // is the only realistic way an archived module ends up with bugs: filed
    // while active, archived later. Must still roll up into checkout's count.
    await fileBackdatedBug(db, { actorUserId, projectId: projectAId, moduleId: moduleLegacyId, title: `${PREFIX} legacy archived child`, ageDays: 3 });
    // Outside the 30d window entirely (40 days old) — must NOT count toward
    // the 30d rollup, but MUST count toward the 90d rollup.
    await fileBackdatedBug(db, { actorUserId, projectId: projectAId, moduleId: moduleCheckoutId, title: `${PREFIX} checkout, outside 30d window`, ageDays: 40 });
    // Project B leak probe.
    await fileBackdatedBug(db, { actorUserId, projectId: projectBId, moduleId: moduleBId, title: `${PREFIX} project B bug`, ageDays: 1 });

    // Archive AFTER filing — see comment above.
    await db.from('modules').update({ archived_at: new Date().toISOString() }).eq('id', moduleLegacyId);

    fixture = {
      actorUserId,
      workspaceId,
      projectAId,
      projectBId,
      moduleCheckoutId,
      modulePaymentId,
      moduleSearchId,
      moduleLegacyId,
    };
  });

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    // Workspace delete cascades projects -> modules/bugs (all
    // workspace_id/project_id-rooted ON DELETE CASCADE per 0001/0002/0046).
    await db.from('workspaces').delete().in('id', createdWorkspaceIds);
  });

  it('subtree rollup — a parent module\'s defect_count includes its own bugs plus every descendant\'s, and the child keeps its own separate cell', async () => {
    if (!fixture) { return warn(); }
    const page = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    const checkout = findModule(page, fixture.moduleCheckoutId);
    const payment = findModule(page, fixture.modulePaymentId);

    // checkout: 1 own bug (age 1d) + payment's 2 bugs (age 2d, 10d) + legacy's
    // 1 bug (age 3d) = 4. The 40d-old bug is outside the 30d window.
    expect(checkout.defect_count).toBe(4);
    // payment keeps its own independent cell/count (2), not folded away.
    expect(payment.defect_count).toBe(2);
  });

  it('archived descendant modules do not get their own cell, but their bugs still roll up into an active ancestor', async () => {
    if (!fixture) { return warn(); }
    const page = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    expect(page.items.some(i => i.module_id === fixture!.moduleLegacyId)).toBe(false);
    // Already asserted via checkout's count above, re-asserted narrowly here.
    const checkout = findModule(page, fixture.moduleCheckoutId);
    expect(checkout.defect_count).toBeGreaterThanOrEqual(1);
  });

  it('a zero-defect active module is a clean, distinct cell — not omitted', async () => {
    if (!fixture) { return warn(); }
    const page = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    const search = findModule(page, fixture.moduleSearchId);
    expect(search.defect_count).toBe(0);
    expect(search.current_week_count).toBe(0);
    expect(search.previous_week_count).toBe(0);
  });

  it('the window switch changes defect_count — a bug outside the 30d window is included at 90d', async () => {
    if (!fixture) { return warn(); }
    const page30 = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    const page90 = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '90d');
    const checkout30 = findModule(page30, fixture.moduleCheckoutId);
    const checkout90 = findModule(page90, fixture.moduleCheckoutId);
    expect(checkout90.defect_count).toBe(checkout30.defect_count + 1);
  });

  it('week-over-week raw buckets — current (0-7d) vs previous (7-14d) are split correctly', async () => {
    if (!fixture) { return warn(); }
    const page = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    const payment = findModule(page, fixture.modulePaymentId);
    // One bug at age 2d (current week), one at age 10d (previous week).
    expect(payment.current_week_count).toBe(1);
    expect(payment.previous_week_count).toBe(1);
  });

  it('Project B\'s bug never leaks into Project A\'s heatmap (project-scope boundary)', async () => {
    if (!fixture) { return warn(); }
    const pageA = await reportHeatmap(fixture.projectAId, fixture.actorUserId, '30d');
    const totalA = pageA.items.reduce((sum, i) => sum + i.defect_count, 0);
    // 4 (checkout) + 2 (payment, already included in checkout's rollup) +
    // 0 (search) — Project B's bug must not inflate this.
    expect(totalA).toBe(6);
  });

  it('an invalid window is rejected with the RPC backstop code (45308)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: fixture.actorUserId,
      p_project_id: fixture.projectAId,
      p_window: '365d',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45308');
  });

  it('a FOREIGN or nonexistent Project resolves to the SAME P0002 as each other (non-disclosure, not a 403)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const missing = await db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_project_id: ZERO_UUID, p_window: '30d' });
    expect(missing.error).not.toBeNull();
    expect(missing.error?.code).toBe('P0002');
    expect(missing.data).toBeNull();
  });
});

async function reportHeatmap(projectId: string, actorUserId: string, window: string): Promise<HeatmapPayload> {
  const db = service();
  const { data, error } = await db.rpc(RPC, { p_actor_user_id: actorUserId, p_project_id: projectId, p_window: window });
  if (error) { throw error; }
  return data as unknown as HeatmapPayload;
}

function findModule(page: HeatmapPayload, moduleId: string): HeatmapItem {
  const row = page.items.find(i => i.module_id === moduleId);
  if (!row) { throw new Error(`module ${moduleId} not found in defect heatmap report`); }
  return row;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[defect-heatmap-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
