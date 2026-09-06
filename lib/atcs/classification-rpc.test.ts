import { ATC_PRIORITIES, ATC_TECHNIQUES } from '@lib/atcs/validation';
import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-399 — DB-level behaviour of the two ATC classification columns
// (`atcs.technique`, `atcs.priority`) across every RPC that touches them.
// Integration sibling of the unit schema suite (`classification-validation.test.ts`),
// modelled on `duplicate-rpc.test.ts`: it drives the REAL SECURITY DEFINER RPCs
// through the service-role client — the exact contract the API routes use (admin
// client, explicit actor) — against the REAL database, where migrations 0087 and
// 0088 are applied.
//
// WHY A MOCKED `db.rpc` WOULD PROVE NOTHING HERE. Three of the properties under
// test exist only in the database and are invisible to any stub:
//
//   * the named CHECK constraints `atcs_technique_allowed` / `atcs_priority_allowed`
//     are what turn an out-of-set or case-mismatched value into SQLSTATE 23514
//     for a caller that never passes through the route's Zod schema (direct
//     PostgREST, or the web editor's saveAtcAction);
//   * `bunkai_duplicate_atc` copies with an EXPLICIT column list, so the copy
//     carries the classification only because 0087 added the two names to both
//     the `select into` and the `insert` — edge case E4 is a property of that
//     column list and of nothing else;
//   * `bunkai_update_atc` writes `technique = p_technique` unconditionally, so
//     an OMITTED PostgREST argument (which resolves to the parameter's
//     `default null`) clears the stored value. That is the full-replace contract
//     the PATCH route documents, and it is only observable end to end.
//
// Env-gated and self-cleaning, per repo convention: when the Supabase env is
// absent (CI without DB creds) the WHOLE suite SKIPS via `describe.skip`. When
// the env IS present but the seed cannot satisfy a precondition the test FAILS
// LOUDLY rather than passing silently. Every ATC this suite creates is tracked
// and hard-deleted in `afterAll`, so it leaves the database as it found it.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;
// The constraint-parity block reads pg_constraint, which PostgREST does not
// expose — it needs a direct connection, same as the BK-635 grant guard.
const describePg = pgUrl ? describe : describe.skip;

// A distinctive lexeme so the search narrows below match ONLY this suite's rows
// (the tsvector is built from title + tags by the 0004 trigger).
const SEARCH_TOKEN = 'bk399classificationfixture';

interface AtcJson {
  id: string
  slug: string
  title: string
  version: number
  technique: string | null
  priority: string | null
}

interface SearchRow { id: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[classification-rpc] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

// Every id pushed here is hard-deleted in afterAll (cascade clears children).
const createdAtcIds: string[] = [];

type Db = ReturnType<typeof service>;

interface Seed {
  actor: string
  projectId: string
  moduleId: string
  userStoryId: string
  acIds: string[]
}

// Find a coherent create fixture: an existing ATC gives us a (module, user
// story, acceptance criteria) triple that already satisfies the create RPC's
// cross-entity rules (every AC belongs to the user story; the module is the
// user story's module or a descendant), plus a workspace with an active writer.
// Nothing existing is mutated — the triple is only used to author NEW rows.
async function findSeed(db: Db): Promise<Seed | null> {
  const { data: atcs } = await db
    .from('atcs')
    .select('id, project_id, module_id, user_story_id')
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
    const { data: acs } = await db
      .from('atc_acceptance_criteria')
      .select('acceptance_criterion_id')
      .eq('atc_id', atc.id);
    const acIds = (acs ?? []).map(a => a.acceptance_criterion_id);
    if (acIds.length >= 1) {
      return {
        actor: actor.user_id,
        projectId: atc.project_id,
        moduleId: atc.module_id,
        userStoryId: atc.user_story_id,
        acIds,
      };
    }
  }
  return null;
}

// Author a fresh ATC through the real create RPC. `technique` / `priority` are
// passed exactly as given — `undefined` means the argument is OMITTED from the
// PostgREST payload, which is the case the `default null` parameters exist for.
async function createFixture(
  db: Db,
  seed: Seed,
  args: { suffix: string, technique?: string | null, priority?: string | null } = { suffix: 'base' },
): Promise<AtcJson> {
  const payload: Record<string, unknown> = {
    p_actor_user_id: seed.actor,
    p_module_id: seed.moduleId,
    p_user_story_id: seed.userStoryId,
    p_title: `${SEARCH_TOKEN} ${args.suffix} ${Date.now()}`,
    p_layer: 'API',
    p_tags: [],
    p_steps: [{ position: 1, content: 'Given the classification fixture' }],
    p_assertions: [{ content: 'Then the classification round-trips' }],
    p_ac_ids: seed.acIds,
  };
  if (args.technique !== undefined) { payload.p_technique = args.technique; }
  if (args.priority !== undefined) { payload.p_priority = args.priority; }

  const { data, error } = await db.rpc('bunkai_create_atc', payload as never);
  expect(error).toBeNull();
  const atc = data as unknown as AtcJson;
  createdAtcIds.push(atc.id);
  return atc;
}

// Full-replace update. Keys absent from `args` are absent from the payload, so
// the RPC parameter falls back to its `default null` — the omission-clears path.
async function updateFixture(
  db: Db,
  seed: Seed,
  atcId: string,
  args: { technique?: string | null, priority?: string | null },
) {
  const payload: Record<string, unknown> = {
    p_actor_user_id: seed.actor,
    p_atc_id: atcId,
    p_if_match: null,
    p_title: `${SEARCH_TOKEN} edited`,
    p_layer: 'API',
    p_tags: [],
    p_steps: [{ position: 1, content: 'Given the classification fixture' }],
    p_assertions: [{ content: 'Then the classification round-trips' }],
    p_ac_ids: seed.acIds,
  };
  if (args.technique !== undefined) { payload.p_technique = args.technique; }
  if (args.priority !== undefined) { payload.p_priority = args.priority; }
  return db.rpc('bunkai_update_atc', payload as never);
}

async function readRow(db: Db, atcId: string) {
  const { data } = await db
    .from('atcs')
    .select('technique, priority, version, updated_at')
    .eq('id', atcId)
    .single();
  return requirePrecondition(data, `ATC ${atcId} must exist after the write`);
}

afterAll(async () => {
  if (!hasEnv || createdAtcIds.length === 0) { return; }
  const db = service();
  await db.from('activity_log').delete().in('entity_id', createdAtcIds);
  await db.from('atcs').delete().in('id', createdAtcIds);
});

describeOrSkip('BK-399 — ATC classification round-trips through the real RPCs', () => {
  it('create accepts both fields and the composed json reads them back (AC-01 / AC-02 / T9e)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need an ATC with ≥1 AC binding in a workspace with an active writer');

    const atc = await createFixture(db, seed, {
      suffix: 'create-both',
      technique: 'Boundary Value Analysis',
      priority: 'High',
    });

    // The RPC's own return value (bunkai_atc_json) carries the two new keys...
    expect(atc.technique).toBe('Boundary Value Analysis');
    expect(atc.priority).toBe('High');

    // ...and so does the stored row. A create path that accepted the arguments
    // and dropped them before the insert would pass the first assertion only if
    // the json were composed from the input, which it is not — it re-reads.
    const row = await readRow(db, atc.id);
    expect(row.technique).toBe('Boundary Value Analysis');
    expect(row.priority).toBe('High');
  });

  it('create with neither field stores NULL for both — never a sentinel, never a default (AC-03)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const atc = await createFixture(db, seed, { suffix: 'create-neither' });

    expect(atc.technique).toBeNull();
    expect(atc.priority).toBeNull();
    const row = await readRow(db, atc.id);
    expect(row.technique).toBeNull();
    expect(row.priority).toBeNull();
  });

  it('a classification-only edit bumps version and moves updated_at (AC-02 / business rule 6)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const atc = await createFixture(db, seed, { suffix: 'version-bump' });
    const before = await readRow(db, atc.id);
    expect(before.version).toBe(1);

    // Same title, layer, tags, steps, assertions and ACs as the create — the
    // ONLY delta is the classification. bunkai_update_atc bumps unconditionally,
    // so this needs no dedicated logic and must not acquire any.
    const { error } = await updateFixture(db, seed, atc.id, {
      technique: 'Decision Table',
      priority: 'Medium',
    });
    expect(error).toBeNull();

    const after = await readRow(db, atc.id);
    expect(after.technique).toBe('Decision Table');
    expect(after.priority).toBe('Medium');
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_at).not.toBe(before.updated_at);
    expect(Date.parse(after.updated_at)).toBeGreaterThanOrEqual(Date.parse(before.updated_at));
  });

  it('an explicit null clears a set value back to unspecified (E3)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const atc = await createFixture(db, seed, {
      suffix: 'clear-explicit',
      technique: 'Pairwise',
      priority: 'Critical',
    });
    expect((await readRow(db, atc.id)).technique).toBe('Pairwise');

    const { error } = await updateFixture(db, seed, atc.id, { technique: null, priority: null });
    expect(error).toBeNull();

    const row = await readRow(db, atc.id);
    expect(row.technique).toBeNull();
    expect(row.priority).toBeNull();
  });

  it('an OMITTED key clears too — full replace, exactly like tags (T8 / E3)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const atc = await createFixture(db, seed, {
      suffix: 'clear-omitted',
      technique: 'State Transition',
      priority: 'Low',
    });

    // No p_technique / p_priority in the payload at all. The 11-arg signature's
    // `default null` resolves them, and the header `update ... set` writes NULL.
    // This is the documented hazard of the PUT-style contract: a client that
    // GETs, edits the title and PATCHes without echoing the classification
    // wipes it. Asserting it here keeps that behaviour deliberate.
    const { error } = await updateFixture(db, seed, atc.id, {});
    expect(error).toBeNull();

    const row = await readRow(db, atc.id);
    expect(row.technique).toBeNull();
    expect(row.priority).toBeNull();
  });

  it('duplicate carries both fields to the copy (E4 — the explicit column list in 0087)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const source = await createFixture(db, seed, {
      suffix: 'duplicate-source',
      technique: 'Equivalence Partitioning',
      priority: 'Critical',
    });

    const { data, error } = await db.rpc('bunkai_duplicate_atc', {
      p_actor_user_id: seed.actor,
      p_source_atc_id: source.id,
    });
    expect(error).toBeNull();
    const copy = data as unknown as AtcJson;
    createdAtcIds.push(copy.id);

    // bunkai_duplicate_atc copies with an explicit column list on BOTH the
    // `select into` and the `insert`. Before 0087 added the two names to that
    // list the copy landed with NULL/NULL and nothing failed — a silent drop.
    expect(copy.id).not.toBe(source.id);
    expect(copy.version).toBe(1);
    expect(copy.technique).toBe('Equivalence Partitioning');
    expect(copy.priority).toBe('Critical');

    const row = await readRow(db, copy.id);
    expect(row.technique).toBe('Equivalence Partitioning');
    expect(row.priority).toBe('Critical');
  });

  it('an out-of-set technique raises 23514 on atcs_technique_allowed', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const { data, error } = await db.rpc('bunkai_create_atc', {
      p_actor_user_id: seed.actor,
      p_module_id: seed.moduleId,
      p_user_story_id: seed.userStoryId,
      p_title: `${SEARCH_TOKEN} rejected technique`,
      p_layer: 'API',
      p_tags: [],
      p_steps: [{ position: 1, content: 'step' }],
      p_assertions: [],
      p_ac_ids: seed.acIds,
      p_technique: 'Mutation Testing',
    } as never);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // 23514 is what lib/atcs/errors.ts maps to 422 validation_failed with
    // details.reason = 'technique_invalid' — the direct-PostgREST half of the
    // error contract, unreachable through the route's Zod schema.
    expect(error?.code).toBe('23514');
    expect(error?.message ?? '').toContain('atcs_technique_allowed');
  });

  it('a case-mismatched priority raises 23514 on atcs_priority_allowed — strict, never coerced (E1/E2)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const { data, error } = await db.rpc('bunkai_create_atc', {
      p_actor_user_id: seed.actor,
      p_module_id: seed.moduleId,
      p_user_story_id: seed.userStoryId,
      p_title: `${SEARCH_TOKEN} rejected priority`,
      p_layer: 'API',
      p_tags: [],
      p_steps: [{ position: 1, content: 'step' }],
      p_assertions: [],
      p_ac_ids: seed.acIds,
      p_priority: 'critical',
    } as never);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514');
    expect(error?.message ?? '').toContain('atcs_priority_allowed');
  });

  it('an existing set value survives a rejected write — no partial application', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const atc = await createFixture(db, seed, {
      suffix: 'reject-no-change',
      technique: 'Pairwise',
      priority: 'High',
    });

    const { error } = await updateFixture(db, seed, atc.id, { technique: 'Exploratory' });
    expect(error?.code).toBe('23514');

    // The RPC is one transaction: the CHECK aborts it, so neither the title nor
    // the classification moved. AC-01 scenario 1.2's "DB keeps technique
    // unchanged" is a transactional property, not a route-layer one.
    const row = await readRow(db, atc.id);
    expect(row.technique).toBe('Pairwise');
    expect(row.priority).toBe('High');
    expect(row.version).toBe(1);
  });
});

describeOrSkip('BK-399 — bunkai_search_atcs narrows by technique and priority', () => {
  it('the classification narrows are ANDed with the query and the project scope (AC-04 / AC-05 / E6)', async () => {
    const db = service();
    const seed = requirePrecondition(await findSeed(db), 'need a create seed');

    const pairwise = await createFixture(db, seed, {
      suffix: 'search-pairwise',
      technique: 'Pairwise',
      priority: 'Critical',
    });
    const decision = await createFixture(db, seed, {
      suffix: 'search-decision',
      technique: 'Decision Table',
      priority: 'Low',
    });

    async function search(narrows: Record<string, unknown>): Promise<string[]> {
      const { data, error } = await db.rpc('bunkai_search_atcs', {
        p_actor_user_id: seed.actor,
        p_query: SEARCH_TOKEN,
        p_project_id: seed.projectId,
        p_limit: 50,
        ...narrows,
      } as never);
      expect(error).toBeNull();
      return (data as unknown as SearchRow[]).map(r => r.id);
    }

    // No narrow: both fixtures are in the candidate set, so a narrowed result
    // below can only be the filter working, never an empty index.
    const all = await search({});
    expect(all).toContain(pairwise.id);
    expect(all).toContain(decision.id);

    expect(await search({ p_technique: 'Pairwise' })).toContain(pairwise.id);
    expect(await search({ p_technique: 'Pairwise' })).not.toContain(decision.id);

    expect(await search({ p_priority: 'Low' })).toContain(decision.id);
    expect(await search({ p_priority: 'Low' })).not.toContain(pairwise.id);

    // Triple AND with the layer narrow both fixtures share (E6).
    const triple = await search({ p_layer: 'API', p_technique: 'Decision Table', p_priority: 'Low' });
    expect(triple).toEqual([decision.id]);

    // A narrow that matches nothing returns an empty set, not an error (AC-06).
    expect(await search({ p_technique: 'State Transition' })).toEqual([]);
  });
});

describePg('BK-399 — the TypeScript value sets and the SQL CHECK constraints agree', () => {
  // THE DRIFT THIS CATCHES. `ATC_TECHNIQUES` in lib/atcs/validation.ts and the
  // `atcs_technique_allowed` CHECK in migration 0087 are two independent copies
  // of one decision, and every other test in this repo reads only ONE of them.
  // Add a sixth technique to the constant and forget the migration and the whole
  // suite stays green — until a user picks it in production, the write is
  // rejected by the constraint, and the 422 the route returns lists the value
  // the caller just sent as an ALLOWED one (the message is built from the
  // constant). This block is the only thing that fails on that day instead.
  //
  // Order-independent by design: the declaration order is a UI contract (it
  // drives the option lists) and is asserted in classification-validation.test.ts.
  // What has to match here is the SET and the exact casing of each member.
  async function allowedValues(sql: SQL, constraint: string): Promise<string[]> {
    const rows = await sql`
      select pg_get_constraintdef(c.oid) as def
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = 'atcs' and c.conname = ${constraint}
    `;
    const def = requirePrecondition(
      (rows as { def: string }[])[0]?.def,
      `constraint ${constraint} must exist on public.atcs (migration 0087)`,
    );
    // Postgres normalizes `x in (...)` to `x = ANY (ARRAY['a'::text, ...])`.
    // Pull every single-quoted literal out of the rendered definition.
    return [...def.matchAll(/'((?:[^']|'')*)'/g)].map(match => match[1].replace(/''/g, '\''));
  }

  it('atcs_technique_allowed lists exactly ATC_TECHNIQUES, byte for byte', async () => {
    const sql = new SQL(pgUrl!);
    try {
      const values = await allowedValues(sql, 'atcs_technique_allowed');
      expect([...values].sort()).toEqual([...ATC_TECHNIQUES].sort());
    }
    finally {
      await sql.end();
    }
  });

  it('atcs_priority_allowed lists exactly ATC_PRIORITIES, byte for byte', async () => {
    const sql = new SQL(pgUrl!);
    try {
      const values = await allowedValues(sql, 'atcs_priority_allowed');
      expect([...values].sort()).toEqual([...ATC_PRIORITIES].sort());
    }
    finally {
      await sql.end();
    }
  });

  it('both constraints admit NULL — "not specified" is a value the CHECK allows, not one it tolerates by accident', async () => {
    const sql = new SQL(pgUrl!);
    try {
      const rows = await sql`
        select c.conname, pg_get_constraintdef(c.oid) as def
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public' and t.relname = 'atcs'
           and c.conname in ('atcs_technique_allowed', 'atcs_priority_allowed')
      `;
      expect((rows as unknown[]).length).toBe(2);
      for (const row of rows as { def: string }[]) {
        expect(row.def).toMatch(/IS NULL/i);
      }
    }
    finally {
      await sql.end();
    }
  });
});
