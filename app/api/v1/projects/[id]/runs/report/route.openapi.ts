import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-38 — a Project's Run report: every Run of the Project, filtered by date
// range / module / status / executor (AND-composed), with pass/fail totals
// recomputed from the SAME filtered set. The report row is a deliberate
// PROJECTION of the composed Run (POST /runs `Run` schema), and — unlike
// `RunHistoryItem` (GET /tests/{id}/runs) — `status` is NOT narrowed to the
// three terminal outcomes: a currently-`running` Run is a legitimate row in a
// live project-wide report, it simply cannot be the TARGET of the `status`
// filter (Technical Decision D4).
//
// `duration` is deliberately absent, same reasoning as RunHistoryItem: the row
// carries started_at + finished_at and the client formats the elapsed time.

const RunReportItemSchema = z
  .object({
    id: z.string().uuid(),
    test_id: z.string().uuid(),
    test_title: z.string(),
    module_id: z.string().uuid().nullable().describe('The module snapshotted at Run start (chain-position-1 ATC\'s module). Null when that ATC was later deleted (Risk R-3).'),
    module_name: z.string().nullable().describe('Null whenever module_id is null.'),
    environment_id: z.string().uuid(),
    environment_name: z.string().nullable().describe('The project environment the Run targeted.'),
    executor_mode: z.enum(['human', 'agent', 'ci']),
    status: z
      .enum(['running', 'passed', 'failed', 'aborted'])
      .describe('The Run\'s current status, INCLUDING `running` — this is a live report, not a terminal-only history. `running` cannot be used as a `status` filter value (see the query parameter), it can only appear as a row.'),
    // `offset: true` is required, not decorative: Postgres serialises a
    // timestamptz as `2026-07-29T11:52:00+00:00`, and bare `.datetime()`
    // accepts only the `Z`-suffixed form — so the published contract would
    // reject every timestamp this endpoint actually returns.
    started_at: z.string().datetime({ offset: true }),
    finished_at: z.string().datetime({ offset: true }).nullable(),
  })
  .openapi('RunReportItem');

const RunReportTotalsSchema = z
  .object({
    passed: z.number().int(),
    failed: z.number().int(),
  })
  .describe('Counts over the WHOLE filtered set (every row matching the active filters, not just the returned page) — Business Rule #3 / Technical Decision D2. Deliberately the OPPOSITE of RunHistoryTotals: these numbers change as filters narrow. `running` and `aborted` Runs are not counted here (aborted is a terminal outcome but not a pass/fail verdict).')
  .openapi('RunReportTotals');

const RunReportPageSchema = z
  .object({
    items: z.array(RunReportItemSchema).describe('The page, ordered newest first (started_at desc, id desc).'),
    totals: RunReportTotalsSchema,
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque token for the next (older) page, or null when this is the last page. base64url, so it is URL-safe as-is: echo it back verbatim as `?cursor=`; never construct or parse one.'),
  })
  .openapi('RunReportPage');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project whose Run report to read.',
};

const DateFromParam = {
  name: 'date_from',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'date' as const },
  description: 'Inclusive lower bound on started_at, matched as a UTC calendar day (YYYY-MM-DD). No projects.timezone column exists to interpret against (Technical Decision D3).',
};

const DateToParam = {
  name: 'date_to',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'date' as const },
  description: 'Inclusive upper bound on started_at, matched as a UTC calendar day (YYYY-MM-DD). Rejected (422) when earlier than date_from.',
};

const ModuleIdParam = {
  name: 'module_id',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'Narrow the report to Runs whose snapshotted module matches this Project module.',
};

const StatusParam = {
  name: 'status',
  in: 'query' as const,
  required: false,
  schema: { type: 'array' as const, items: { type: 'string' as const, enum: ['passed', 'failed', 'aborted'] } },
  style: 'form' as const,
  explode: true,
  description: 'Narrow to one or more statuses, repeatable (?status=passed&status=failed). `running` is NOT an accepted filter value (422) — an in-progress Run can still appear as a row, it just is not a selectable filter target (Technical Decision D4).',
};

const ExecutorParam = {
  name: 'executor',
  in: 'query' as const,
  required: false,
  schema: { type: 'array' as const, items: { type: 'string' as const, enum: ['human', 'agent', 'ci'] } },
  style: 'form' as const,
  explode: true,
  description: 'Narrow to one or more executor modes, repeatable (?executor=human&executor=agent).',
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 50, default: 50 },
  description: 'Page size, 1..50 (default 50). Out of range is rejected (422); the RPC additionally clamps for direct callers.',
};

const CursorParam = {
  name: 'cursor',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Opaque page token taken verbatim from the previous response\'s `next_cursor`. The token is base64url and therefore URL-safe as issued — it needs no escaping and must not be re-encoded. A malformed token returns 400 — it never silently falls back to the first page.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/runs/report',
  tags: ['Runs'],
  summary: 'Filter a Project\'s Runs by date range, module, status and executor, with matching pass/fail totals',
  description: 'Cookie session or Bearer PAT; no scope requirement yet (Key Contract Decision: a future `run:read`-equivalent PAT scope is out of scope for this story). One SECURITY DEFINER RPC (`bunkai_report_project_runs`) resolves the Project\'s workspace and re-checks ACTIVE membership in-band; any role reads, viewers included. Every filter is AND-composed and every filter composes with pagination server-side. Unlike `GET /api/v1/tests/{id}/runs`, rows are NOT restricted to terminal statuses — a currently-`running` Run is a legitimate row — and `totals` is recomputed from the SAME filtered set as the rows (not all-time), so the numbers change as filters narrow (Business Rule #3 / Technical Decision D2). Pagination is KEYSET on `(started_at desc, id desc)`, reusing the same opaque cursor contract as the run-history endpoint. A Project with no matching Runs returns an empty `items` with zeroed `totals` (never a 404) — a 404 means the Project itself is missing, foreign, or unreadable.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, DateFromParam, DateToParam, ModuleIdParam, StatusParam, ExecutorParam, LimitParam, CursorParam],
  responses: {
    200: { description: 'One page of the Run report (possibly empty).', content: { 'application/json': { schema: RunReportPageSchema } } },
    400: { description: 'Malformed Project id (not a UUID) or an undecodable `cursor` (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (also returned for a Project outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — `date_to` before `date_from`, a `status`/`executor` value outside its enum (incl. `status=running`), or `limit` outside 1..50 (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RunReportItemSchema, RunReportPageSchema, RunReportTotalsSchema };
