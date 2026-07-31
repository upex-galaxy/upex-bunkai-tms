import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-49 — the activity feed's response contract. `payload` is NEVER
// `z.record()`/`z.unknown()`: the whole `ActivityItem` is a discriminated
// union keyed on `action`, one branch per migration
// 0045_activity_stream.sql's positive per-action `payload` projection (API
// design § "ActivityItemSchema"). A generic object type would silently
// promise "whatever the server sends" and would leak the raw-payload
// security property — only an allowlisted subset per action ever reaches
// this response — out of the published contract. `run.aborted`'s branch
// carries `skipped_steps` only: `reason` is never selected by the RPC
// (Decision 3, Risk R3) and therefore never appears in this schema either.

const ActivityActorSchema = z
  .object({
    user_id: z.string().uuid().nullable().describe('null when the row has no actor (a system-originated event).'),
    email: z.string().nullable().describe('null when the actor is unresolvable (e.g. a departed member) — a safe fallback, never a crash.'),
  })
  .openapi('ActivityActor');

const ActivityItemLabelSchema = z
  .object({
    label: z.string().describe('Payload-derived where a usable field exists (e.g. a title, a path); the generic "a <entity_type>" fallback otherwise.'),
    entity_id: z.string().uuid().nullable(),
  })
  .openapi('ActivityItemLabel');

// One item variant per allowlisted action. Common fields are repeated per
// variant (not `.extend()`-merged) so each branch's `.openapi()` name maps
// 1:1 to the discriminator's literal `action` value.
function activityItemVariant<
  Action extends string,
  EntityType extends string,
  Payload extends z.ZodRawShape,
>(name: string, action: Action, entityType: EntityType, payloadShape: Payload) {
  return z
    .object({
      id: z.string().uuid().describe('activity_log row id — stable React key.'),
      entity_type: z.literal(entityType),
      action: z.literal(action),
      action_label: z.string().describe('Server-rendered, from ACTION_LABELS — never re-derived client-side.'),
      actor: ActivityActorSchema,
      item: ActivityItemLabelSchema,
      payload: z.object(payloadShape).openapi(`ActivityPayload${name}`),
      // Postgres serializes a timestamptz as `2026-07-29T11:52:00+00:00`;
      // `offset: true` is required — bare `.datetime()` accepts only the
      // `Z`-suffixed form and would reject every timestamp this endpoint
      // actually returns (mirrors RunHistoryItem.started_at).
      created_at: z.string().datetime({ offset: true }),
    })
    .openapi(`ActivityItem${name}`);
}

const ActivityItemSchema = z
  .discriminatedUnion('action', [
    activityItemVariant('ModuleRenamed', 'module.renamed', 'module', {
      name: z.string().nullable(),
      new_path: z.string().nullable(),
    }),
    activityItemVariant('ModuleDescriptionUpdated', 'module.description_updated', 'module', {}),
    activityItemVariant('ModuleMoved', 'module.moved', 'module', {
      new_path: z.string().nullable(),
    }),
    activityItemVariant('ModuleArchived', 'module.archived', 'module', {
      modules: z.number().int().nullable(),
      user_stories: z.number().int().nullable(),
      acceptance_criteria: z.number().int().nullable(),
      atcs: z.number().int().nullable(),
    }),
    activityItemVariant('AtcCreated', 'atc.created', 'atc', {
      title: z.string().nullable(),
    }),
    activityItemVariant('TestCreated', 'test.created', 'test', {
      title: z.string().nullable(),
    }),
    activityItemVariant('RunFinished', 'run.finished', 'run', {
      verdict: z.enum(['passed', 'failed']).nullable(),
      skipped_steps: z.number().int().nullable(),
    }),
    activityItemVariant('RunAborted', 'run.aborted', 'run', {
      // `reason` is DELIBERATELY absent (Decision 3, Risk R3) — the RPC never
      // selects it, so it can never be part of this contract.
      skipped_steps: z.number().int().nullable(),
    }),
  ])
  .openapi('ActivityItem');

const ActivityPageSchema = z
  .object({
    items: z.array(ActivityItemSchema).describe('The page, ordered newest first (created_at desc, id desc).'),
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque token for the next (older) page, or null when this is the last page. base64url — echo it back verbatim as `?cursor=`; never construct or parse one.'),
  })
  .openapi('ActivityPage');

const WorkspaceIdParam = {
  name: 'workspace_id',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'Cookie sessions: optional, falls back to the active-workspace cookie. Bearer/PAT callers: REQUIRED — omitting it is a 422 (known gap, tracked as BK-182).',
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 50, default: 30 },
  description: 'Page size, 1..50 (default 30). Out of range is rejected (422); the RPC additionally clamps for direct callers.',
};

const CursorParam = {
  name: 'cursor',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Opaque page token taken verbatim from the previous response\'s `next_cursor`. A malformed token returns 400 — it never silently falls back to the first page.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/activity',
  tags: ['Activity'],
  summary: 'List the workspace activity feed, newest first',
  description: 'Cookie session or Bearer PAT; no scope requirement (mirrors `GET /api/v1/tests/{id}/runs`). `bunkai_list_activity` is SECURITY INVOKER — it runs under the caller\'s own RLS, so a non-member workspace_id silently returns an empty page rather than leaking existence. Read-only, MVP-allowlisted event set only (8 of 12 write-site actions); no realtime, no defect activity. Pagination is KEYSET on `(created_at desc, id desc)`. An empty `items` is always a valid 200 — this endpoint never answers 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, LimitParam, CursorParam],
  responses: {
    200: { description: 'One page of the activity feed (possibly empty).', content: { 'application/json': { schema: ActivityPageSchema } } },
    400: { description: 'An undecodable `cursor` (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — `workspace_id` missing for a Bearer/PAT caller, or `limit` outside 1..50 (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ActivityItemSchema, ActivityPageSchema };
