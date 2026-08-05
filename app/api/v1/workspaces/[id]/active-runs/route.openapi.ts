import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-256 — the Home "Active test runs" widget's read contract. Published as a
// first-class endpoint (not just an internal server-component read) so the count
// and the progress figures the widget prints are checkable by API instead of
// only by eye.

const ActiveRunSchema = z
  .object({
    id: z.string().uuid().describe('The run\'s id. The run opens at `/projects/{project_slug}/runs/{id}`.'),
    project_slug: z.string().describe('URL slug of the run\'s project, unique per workspace.'),
    project_name: z.string(),
    test_title: z.string().describe('The Test title as snapshotted when the run started, not as it reads today.'),
    executor_mode: z.enum(['human', 'agent', 'ci']).describe('How the run is being executed (`runs.executor_mode`).'),
    executor: z.string().describe('Who started the run. Falls back to the neutral copy "a workspace member" when the executor cannot be resolved (departed member, or no executor on the row) — never a raw user id.'),
    state: z.enum(['running', 'blocked']).describe('DERIVED, not a column: `blocked` when at least one of the run\'s steps is blocked, `running` otherwise. Both are active — `runs.status` is `running` for every row this endpoint returns, since a blocked run has not terminated. It is a display sub-state, so it never changes `active_count`.'),
    total_steps: z.number().int().describe('Steps snapshotted into the run at start. An exact count, not a scan-derived floor.'),
    done_steps: z.number().int().describe('Steps that are no longer `pending` — passed, failed, blocked or skipped. Exact.'),
    blocked_steps: z.number().int(),
    failed_steps: z.number().int().describe('Failed steps do NOT end a run: it stays active until it is explicitly finished or aborted.'),
    started_at: z.string().datetime({ offset: true }),
    last_activity_at: z.string().datetime({ offset: true }).describe('When the run was last worked on: the newest `executed_at` among its steps, falling back to `started_at` when no step has been marked yet. This is the ordering key. It is NOT `runs.updated_at` — marking a step locks that row but never updates it, so that column is frozen at the run\'s start for a run in flight. `last_activity_at == started_at` therefore means "nothing has happened since this run began".'),
  })
  .openapi('ActiveRun');

const ActiveRunsSchema = z
  .object({
    active_count: z
      .number()
      .int()
      .describe('How many runs are in progress across the WHOLE workspace. Exact, and deliberately NOT capped by `limit` — a workspace with eight running runs reports 8 while returning at most `limit` rows. This is the same predicate (`runs.status = \'running\'`) the Home welcome banner counts, so the two numbers on that screen agree by construction.'),
    runs: z
      .array(ActiveRunSchema)
      .describe('Ordered by `last_activity_at` descending (id descending as the tie-break), so the first entry is the run to resume. At most `limit` entries. NOTE the two-stage boundary: `started_at` descending decides WHICH runs make the page (that is what the database can order cheaply), and `last_activity_at` orders the page. A run old enough to fall outside `limit` by start date is not pulled back in by recent step activity. When `active_count` exceeds this array\'s length the remainder is NOT reachable from here — there is no cursor and no workspace-wide runs index; read the missing runs from each project\'s own run report.'),
  })
  .openapi('ActiveRuns');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 20, default: 5 },
  description: 'How many runs to return, 1..20 (default 5 — the Home widget\'s page size). Out of range is rejected with 422, never silently clamped. Does not affect `active_count`.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/active-runs',
  tags: ['Workspaces'],
  summary: 'List the runs currently in progress across a whole workspace, with their step progress',
  description: 'Bearer `atc:read` (or cookie session) — rows carry project names, run identifiers and executor identities, so it is gated like the sibling workspace inventory read. `run:execute` is deliberately NOT the gate: it is a write capability. Active means `runs.status = \'running\'`; finished and aborted runs are excluded, and a blocked run is still running (there is no `blocked` run status — blocking lives on the steps, and is surfaced per row as `state`). Runs entirely under the caller\'s own RLS, so a foreign, nonexistent, or lost-membership workspace id returns the SAME empty `200` an idle workspace does — never an existence echo. A read that FAILS answers 500, never an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, LimitParam],
  responses: {
    200: { description: 'The workspace\'s active runs (possibly empty) and the exact count of them.', content: { 'application/json': { schema: ActiveRunsSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: '`limit` is not an integer in 1..20 (`validation_failed`, `details.reason = limit_out_of_range`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The rollup could not be read (`internal_error`). Deliberately not collapsed into an empty list.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ActiveRunSchema, ActiveRunsSchema };
