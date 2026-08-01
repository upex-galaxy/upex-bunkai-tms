import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-47 — a Project's recovery-cycle report: for every User Story with run
// history, elapsed time from the first failing terminal Run to the first
// subsequent all-passing terminal Run. No pagination, no query params — the
// whole-project payload is small and bounded, same shape as
// `GET /api/v1/projects/{id}/coverage` (0049_recovery_cycle_report.sql).
//
// `state` model: `recovered` (a qualifying green run followed the first
// fail), `in_progress` (still failing, no qualifying green run yet),
// `no_cycle` (the story has never failed — excluded from the median and from
// `resolved_cycle_count`, but still listed with `cycle_seconds: null`). A
// story with zero Runs touching it at all is omitted from `items` entirely
// (there is no data point to report, not even "no cycle").
//
// `cycle_seconds` is a single field doing double duty by `state`: for
// `recovered` it is the resolved fail->green duration; for `in_progress` it
// is the elapsed-so-far duration measured against the moment this response
// was generated (not live-ticking — recompute by re-requesting); for
// `no_cycle` it is null.

const RecoveryCycleItemSchema = z
  .object({
    user_story_id: z.string().uuid(),
    title: z.string(),
    external_id: z.string().nullable().describe('The User Story\'s optional external tracker key (e.g. a Jira key). Null when not set — never a fabricated code.'),
    module_id: z.string().uuid(),
    module_path: z.string(),
    first_fail_at: z.string().datetime({ offset: true }).nullable().describe('The first failing terminal Run\'s finished_at. Null only for `no_cycle` (never failed).'),
    first_green_at: z.string().datetime({ offset: true }).nullable().describe('The first qualifying all-passing terminal Run\'s finished_at that occurred after first_fail_at. Null unless state is `recovered`.'),
    state: z
      .enum(['recovered', 'in_progress', 'no_cycle'])
      .describe('recovered: a qualifying green Run followed the first fail. in_progress: still failing, no qualifying green Run yet. no_cycle: the story has never failed.'),
    cycle_seconds: z
      .number()
      .int()
      .nullable()
      .describe('recovered: resolved fail->green duration, in seconds. in_progress: elapsed-so-far duration against this response\'s generation time, in seconds. no_cycle: null.'),
  })
  .openapi('RecoveryCycleItem');

const RecoveryCycleReportSchema = z
  .object({
    items: z.array(RecoveryCycleItemSchema).describe('Every User Story with at least one Run touching it, ordered by module path then story title then id.'),
    median_recovery_seconds: z.number().int().nullable().describe('Median cycle_seconds across every `recovered` item only. Null when resolved_cycle_count is 0 (never a false "0s" reading).'),
    resolved_cycle_count: z.number().int().describe('Count of items with state `recovered` — the population median_recovery_seconds is computed over.'),
    story_count: z.number().int().describe('Total items returned (all three states combined).'),
  })
  .openapi('RecoveryCycleReport');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project whose recovery-cycle report to read.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/metrics/recovery-cycles',
  tags: ['Metrics'],
  summary: 'Compute per-user-story recovery-cycle time (first failing run -> first all-passing run)',
  description: 'Cookie session or Bearer PAT; no scope requirement — mirrors `GET /api/v1/projects/{id}/coverage`. One SECURITY DEFINER RPC (`bunkai_report_project_recovery_cycles`) resolves the Project\'s workspace and re-checks ACTIVE membership in-band; any role reads, viewers included. No pagination or query parameters: the whole-project rollup is small and bounded. Computed entirely from Run history (`runs`/`run_atcs`) — no Bugs-domain read (Decision 1). A Project with zero Runs returns an empty `items` with `median_recovery_seconds: null` and zeroed counts (never a 404) — a 404 means the Project itself is missing, foreign, or unreadable.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The recovery-cycle report.', content: { 'application/json': { schema: RecoveryCycleReportSchema } } },
    400: { description: 'Malformed Project id (not a UUID) (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (also returned for a Project outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RecoveryCycleItemSchema, RecoveryCycleReportSchema };
