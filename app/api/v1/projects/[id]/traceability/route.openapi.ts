import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-45 — a User Story's full AC -> ATC -> Test -> Run -> Defect evidence
// chain, one round trip. No pagination — the payload is bounded by one
// story's own AC/ATC/Test/Run/Defect counts (0068_story_traceability_report.sql).
//
// Repetition is intentional: an ATC bound to more than one AC on this story
// appears under EACH (PO decision — the screen's unit of reading is the AC,
// not the ATC). `test`/`latest_run` are null exactly when nothing exists yet
// at that layer (see `state` on `TraceabilityLatestRun` for the run-level
// discriminator, and the UI copy table in `lib/traceability/chain-view.ts`
// for the three distinct "nothing here yet" placeholders this null drives).

const TraceabilityTestSchema = z
  .object({ id: z.string().uuid(), title: z.string() })
  .openapi('TraceabilityTest');

const TraceabilityLatestRunSchema = z
  .object({
    run_id: z.string().uuid(),
    run_status: z.enum(['running', 'passed', 'failed', 'aborted']),
    atc_status: z.enum(['pending', 'passed', 'failed', 'blocked', 'skipped']),
    started_at: z.string().datetime({ offset: true }),
    finished_at: z.string().datetime({ offset: true }).nullable(),
    state: z
      .enum(['in_flight', 'aborted', 'passed', 'failed', 'blocked', 'skipped'])
      .describe('Run-level `running` outranks any position verdict — an ATC inside a still-running Run always reads `in_flight`, never a stale prior verdict.'),
  })
  .openapi('TraceabilityLatestRun');

const TraceabilityDefectSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
    created_at: z.string().datetime({ offset: true }),
    run_id: z.string().uuid().nullable(),
    run_step_id: z.string().uuid().nullable(),
  })
  .openapi('TraceabilityDefect');

// BK-48 — the Module this ATC belongs to. Added for the chain screen's
// module filter (exact-match on `id`; `name` is display-only). The mockup's
// fixture used a `MOD-XXX` code that has no equivalent column in the real
// schema (`public.modules` has only id/name/path) — see 0069_story_traceability_module.sql.
const TraceabilityModuleSchema = z
  .object({ id: z.string().uuid(), name: z.string() })
  .openapi('TraceabilityModule');

const TraceabilityAtcSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    layer: z.enum(['UI', 'API', 'Unit']),
    module: TraceabilityModuleSchema.describe('The Module this ATC belongs to (BK-48 filter target). Always present — every ATC has a module_id.'),
    test: TraceabilityTestSchema.nullable().describe('Null when no Test chains this ATC yet ("No test written yet").'),
    latest_run: TraceabilityLatestRunSchema.nullable().describe('Null when a Test chains this ATC but it has never been run ("No run recorded yet").'),
    defects: z.array(TraceabilityDefectSchema).describe('Every defect whose provenance resolves to this ATC, not only the latest run\'s ("None linked" when empty).'),
  })
  .openapi('TraceabilityAtc');

const TraceabilityCriterionSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    atcs: z.array(TraceabilityAtcSchema).describe('Empty when this acceptance criterion has zero ATCs bound (renders the "Uncovered" strip).'),
  })
  .openapi('TraceabilityCriterion');

const TraceabilityStorySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.enum(['draft', 'ready_to_test']),
    archived_at: z.string().datetime({ offset: true }).nullable(),
  })
  .openapi('TraceabilityStory');

const StoryTraceabilityPayloadSchema = z
  .object({
    story: TraceabilityStorySchema,
    criteria: z.array(TraceabilityCriterionSchema).describe('Every non-archived acceptance criterion of this User Story, ordered by position. Empty when the story has no acceptance criteria at all.'),
  })
  .openapi('StoryTraceabilityPayload');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project the User Story belongs to. This is a consistency assertion on the URL itself, never the scope parameter: it is checked against the Story\'s real Project (resolved via module_id, under the caller\'s own RLS) and a mismatched pair is rejected — see the 404 response below and route.ts.',
};

const StoryParam = {
  name: 'story',
  in: 'query' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The User Story whose evidence chain to read.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/traceability',
  tags: ['Traceability'],
  summary: 'Render a User Story\'s full acceptance-criteria-to-defect evidence chain in one read',
  description: 'Cookie session or Bearer PAT; no scope requirement — mirrors `GET /api/v1/projects/{id}/coverage`. One SECURITY DEFINER RPC (`bunkai_report_story_traceability`) resolves the User Story\'s Project via its Module (never the nullable `user_stories.project_id`) and re-checks ACTIVE membership in-band; any role reads, viewers included. No pagination: one story\'s own chain is small and bounded, and round trips never scale with AC/ATC/Test/Run counts. Archived acceptance criteria and ATCs (including under an archived ancestor Module) are excluded from the chain; an archived STORY itself still renders in full.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, StoryParam],
  responses: {
    200: { description: 'The User Story\'s evidence chain.', content: { 'application/json': { schema: StoryTraceabilityPayloadSchema } } },
    400: { description: 'Malformed Project id or missing/malformed `story` query parameter (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'User Story not found. Also returned, byte-identical, for a Story outside the caller\'s workspaces, or for a Story that does not belong to the `{id}` Project asserted in the URL — no existence leak, never a 403.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export {
  StoryTraceabilityPayloadSchema,
  TraceabilityAtcSchema,
  TraceabilityCriterionSchema,
  TraceabilityDefectSchema,
  TraceabilityLatestRunSchema,
  TraceabilityModuleSchema,
  TraceabilityStorySchema,
  TraceabilityTestSchema,
};
