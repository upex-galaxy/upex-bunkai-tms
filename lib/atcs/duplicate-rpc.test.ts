import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-23 — DB-level behaviour of the ATC duplicate RPC (`bunkai_duplicate_atc`).
// Integration sibling of the unit schema test (`duplicate-validation.test.ts`):
// it drives the REAL SECURITY DEFINER RPC through the service-role client (the
// exact contract the API route uses — admin client, explicit actor) and asserts
//
//   * a duplicate copies every step + assertion + AC binding, in order, with a
//     fresh slug, version = 1, and the default `<source> (copy)` title (AC1/AC2);
//   * editing a copied step never changes the source step (AC4 — independence);
//   * a ≥195-char source title overflows the 200 cap and rejects with 45023;
//   * a non-member actor is rejected (forbidden, 42501);
//   * a non-existent source id is not_found (P0002).
//
// DB-dependent + env-gated, cloned from `lib/atcs/search-isolation.test.ts`:
// when the Supabase env is absent (CI without DB creds) the WHOLE suite SKIPS
// via `describe.skip`. When the env IS present but the seed can't satisfy a
// precondition, the test FAILS LOUDLY (`requirePrecondition` throws) rather than
// passing silently — a missing precondition on a DB-backed run is a real
// coverage gap, not a green. Every ATC this suite creates is tracked and torn
// down in `afterAll`, so it leaves the dev DB as it found it.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

interface AtcDup {
  id: string
  slug: string
  title: string
  version: number
  steps: { position: number, content: string }[]
  assertions: { position: number, content: string }[]
  acceptance_criterion_ids: string[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[duplicate-rpc] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

// Every id pushed here is hard-deleted in afterAll (cascade clears children).
const createdAtcIds: string[] = [];

type Db = ReturnType<typeof service>;

// Find a writable (source ATC, active actor) pair: an ATC whose workspace has an
// active member with role >= member, and that carries at least one step.
async function findWritableSource(db: Db) {
  const { data: atcs } = await db
    .from('atcs')
    .select('id, project_id, title')
    .is('archived_at', null);
  const { data: projects } = await db.from('projects').select('id, workspace_id');
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

  const wsByProject = new Map((projects ?? []).map(p => [p.id, p.workspace_id]));
  const writers = (members ?? []).filter(
    m => m.status === 'active' && ['member', 'admin', 'owner'].includes(m.role),
  );

  for (const atc of atcs ?? []) {
    const ws = wsByProject.get(atc.project_id);
    const actor = writers.find(m => m.workspace_id === ws);
    if (!ws || !actor) { continue; }
    const { count } = await db
      .from('atc_steps')
      .select('atc_id', { count: 'exact', head: true })
      .eq('atc_id', atc.id);
    if ((count ?? 0) >= 1) {
      return { actor: actor.user_id, atcId: atc.id, title: atc.title, workspaceId: ws };
    }
  }
  return null;
}

afterAll(async () => {
  if (!hasEnv || createdAtcIds.length === 0) { return; }
  const db = service();
  await db.from('activity_log').delete().in('entity_id', createdAtcIds);
  await db.from('atcs').delete().in('id', createdAtcIds);
});

describeOrSkip('BK-23 — bunkai_duplicate_atc deep copy', () => {
  it('copies steps + assertions + AC bindings, fresh slug, version 1, default (copy) title (AC1/AC2)', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    // Source projection to compare against.
    const { data: srcSteps } = await db.from('atc_steps').select('position, content').eq('atc_id', seed.atcId).order('position');
    const { data: srcAsserts } = await db.from('atc_assertions').select('position, content').eq('atc_id', seed.atcId).order('position');
    const { data: srcAcs } = await db.from('atc_acceptance_criteria').select('acceptance_criterion_id').eq('atc_id', seed.atcId);
    const { data: srcRow } = await db.from('atcs').select('slug, title').eq('id', seed.atcId).single();

    const { data, error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: seed.atcId,
    });
    expect(error).toBeNull();
    const copy = data as unknown as AtcDup;
    createdAtcIds.push(copy.id);

    expect(copy.id).not.toBe(seed.atcId);
    expect(copy.version).toBe(1);
    expect(copy.slug).not.toBe(srcRow!.slug);
    expect(copy.title).toBe(`${srcRow!.title} (copy)`);

    // Steps + assertions copied verbatim, in order.
    expect(copy.steps.map(s => [s.position, s.content])).toEqual((srcSteps ?? []).map(s => [s.position, s.content]));
    expect(copy.assertions.map(a => [a.position, a.content])).toEqual((srcAsserts ?? []).map(a => [a.position, a.content]));

    // AC binding set is identical.
    const srcAcSet = new Set((srcAcs ?? []).map(a => a.acceptance_criterion_id));
    expect(new Set(copy.acceptance_criterion_ids)).toEqual(srcAcSet);
  });

  it('editing a copied step does not change the source (AC4 — independence)', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    const { data: srcStepBefore } = await db.from('atc_steps').select('content').eq('atc_id', seed.atcId).eq('position', 1).single();
    const original = requirePrecondition(srcStepBefore?.content, 'source ATC must have a step at position 1');

    const { data, error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: seed.atcId,
    });
    expect(error).toBeNull();
    const copy = data as unknown as AtcDup;
    createdAtcIds.push(copy.id);

    await db.from('atc_steps').update({ content: 'MUTATED ON COPY (test)' }).eq('atc_id', copy.id).eq('position', 1);

    const { data: srcStepAfter } = await db.from('atc_steps').select('content').eq('atc_id', seed.atcId).eq('position', 1).single();
    expect(srcStepAfter?.content).toBe(original);
  });

  it('rejects when the computed (copy) title would exceed 200 chars (title_too_long / 45023)', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    // Materialize a 198-char-title copy (custom title is valid 3–200)...
    const { data: longData, error: longErr } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: seed.atcId,
      p_title: 'x'.repeat(198),
    });
    expect(longErr).toBeNull();
    const longCopy = longData as unknown as AtcDup;
    createdAtcIds.push(longCopy.id);

    // ...duplicating THAT defaults to 198 + ' (copy)' = 205 chars → must reject.
    const { error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: longCopy.id,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45023');
  });

  it('rejects a non-member actor (forbidden / 42501)', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable source ATC with ≥1 step');

    // A random uuid that is not a workspace member of the source's workspace.
    const { error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: '00000000-0000-4000-8000-000000000000',
      p_source_atc_id: seed.atcId,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('rejects a non-existent source id (not_found / P0002)', async () => {
    const db = service();
    const seed = requirePrecondition(await findWritableSource(db), 'need a writable actor');

    const { error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
  });
});
