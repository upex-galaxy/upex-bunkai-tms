import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-37 — a Test's past Runs, newest first. The history row is a deliberate
// PROJECTION of the composed Run (POST /runs `Run` schema), not the whole thing:
// the snapshot chain (run_atcs / run_steps) is irrelevant to a list, and `status`
// narrows to the three TERMINAL outcomes — a `running` Run is never history. It
// is therefore its own component rather than a pick of `Run`.
//
// `duration` is deliberately absent: the row carries started_at + finished_at and
// the client formats the elapsed time (lib/runs/duration.ts), which keeps the
// format out of SQL and changeable without a migration.

const RunHistoryItemSchema = z
  .object({
    id: z.string().uuid(),
    status: z
      .enum(['passed', 'failed', 'aborted'])
      .describe('Terminal outcome. `running` never appears — an in-progress Run is not a past run.'),
    environment_id: z.string().uuid(),
    environment_name: z.string().nullable().describe('The project environment the Run targeted.'),
    executor_mode: z.enum(['human', 'agent', 'ci']),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime().nullable(),
  })
  .openapi('RunHistoryItem');

const RunHistoryTotalsSchema = z
  .object({
    passed: z.number().int(),
    failed: z.number().int(),
    aborted: z.number().int(),
  })
  .describe('ALL-TIME counts over every terminal Run of the Test. Deliberately invariant under both `outcome` and pagination — filtering the list never changes these numbers.')
  .openapi('RunHistoryTotals');

const RunHistoryPageSchema = z
  .object({
    items: z.array(RunHistoryItemSchema).describe('The page, ordered newest first (started_at desc, id desc).'),
    totals: RunHistoryTotalsSchema,
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque token for the next (older) page, or null when this is the last page. Echo it back verbatim as `?cursor=`; never construct or parse one.'),
  })
  .openapi('RunHistoryPage');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Test whose Run history to read.',
};

const OutcomeParam = {
  name: 'outcome',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, enum: ['passed', 'failed', 'aborted'] },
  description: 'Narrow the list to one terminal outcome. `running` is NOT an accepted value (422) — an in-progress Run is not an outcome.',
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
  description: 'Opaque page token taken verbatim from the previous response\'s `next_cursor`. A malformed token returns 400 — it never silently falls back to the first page.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/tests/{id}/runs',
  tags: ['Runs'],
  summary: 'List a Test\'s past Runs, newest first, filterable by outcome',
  description: 'Cookie session or Bearer PAT; no scope requirement (mirrors `GET /api/v1/runs/{id}` — the PAT scope catalog has no run-read scope). One SECURITY DEFINER RPC resolves the Test\'s workspace and re-checks ACTIVE membership in-band; any role reads, viewers included. Returns TERMINAL Runs only (`passed` / `failed` / `aborted`) ordered `started_at desc, id desc` — an in-progress Run is neither listed nor counted. Pagination is KEYSET, not offset: `next_cursor` encodes the `(started_at, id)` of the last row, so a Run landing mid-scroll can neither skip nor duplicate a row, and the `id` tie-break keeps runs sharing a `started_at` in a stable total order. The `outcome` filter composes with pagination server-side — page 2 of a filtered history contains only that outcome. `totals` is all-time and filter-invariant. A Test with no terminal Runs returns an empty `items` with zeroed `totals` (never a 404).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, OutcomeParam, LimitParam, CursorParam],
  responses: {
    200: { description: 'One page of Run history (possibly empty).', content: { 'application/json': { schema: RunHistoryPageSchema } } },
    400: { description: 'Malformed Test id (not a UUID) or an undecodable `cursor` (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test not found (also returned for a Test outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — `outcome` outside passed/failed/aborted (incl. `running`), or `limit` outside 1..50 (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RunHistoryItemSchema, RunHistoryPageSchema, RunHistoryTotalsSchema };
