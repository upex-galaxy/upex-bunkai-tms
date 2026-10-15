import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-442 — the Run comparison contract. The body is a discriminated union on
// `state`; every variant is an HTTP 200. Only `compared` carries a verdict, and the
// body holds data to build the page from, never display copy.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'The id of the VIEWED Run (This run). The Previous run is resolved by the server.',
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const StepStatusSchema = z.enum(['pending', 'passed', 'failed', 'blocked', 'skipped']);

const RunHeaderSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['running', 'passed', 'failed', 'aborted']),
    started_at: z.string().describe('ISO 8601 timestamp.'),
    finished_at: z.string().nullable().describe('null while the Run is running.'),
    environment_id: z.string().uuid(),
    environment_name: z.string().nullable(),
    executor_mode: z.enum(['human', 'agent', 'ci']),
    abort_reason: z.string().nullable().describe('Set only when the Run was aborted.'),
    total_steps: z.number().int().describe('Steps in this Run.'),
    skipped_steps: z.number().int().describe('Steps closed as skipped. For an aborted Run this is the count of steps it never reached.'),
  })
  .openapi('RunComparisonRunHeader');

const RowSchema = z
  .object({
    group: z.enum(['new_failure', 'still_failing', 'newly_fixed', 'not_comparable', 'added', 'removed', 'unchanged_pass']),
    atc_position: z.number().int().describe('Chain position of the ATC, in This run for every group except `removed` (the Previous run).'),
    atc_title: z.string(),
    content: z.string().describe('The step text, as it was in This run (the Previous run for `removed`).'),
    input_data: z.string().nullable(),
    expected: z.string().nullable(),
    step_id: z.string().uuid().nullable().describe('The Run step in This run; null for `removed`.'),
    previous_step_id: z.string().uuid().nullable().describe('The Run step in the Previous run; null for `added`.'),
    status: StepStatusSchema.nullable().describe('Outcome in This run; null for `removed`.'),
    previous_status: StepStatusSchema.nullable().describe('Outcome in the Previous run; null for `added`.'),
  })
  .openapi('RunComparisonRow');

const CountsSchema = z
  .object({
    new_failure: z.number().int(),
    still_failing: z.number().int(),
    newly_fixed: z.number().int(),
    unchanged_pass: z.number().int(),
    not_comparable: z.number().int(),
    shared: z.number().int().describe('Steps present in both Runs: the five outcomes above add up to this.'),
    added: z.number().int().describe('Steps only in This run, counted apart from the five outcomes.'),
    removed: z.number().int().describe('Steps only in the Previous run, counted apart from the five outcomes.'),
  })
  .openapi('RunComparisonCounts');

const TestSchema = z.object({ id: z.string().uuid(), title: z.string() });
const EnvironmentSchema = z.object({ id: z.string().uuid(), name: z.string().nullable() });

const ComparedSchema = z
  .object({
    state: z.literal('compared'),
    test: TestSchema,
    environment: EnvironmentSchema,
    run: RunHeaderSchema,
    previous: RunHeaderSchema,
    counts: CountsSchema,
    nothing_changed: z.boolean().describe('True only with at least one shared step, nothing Added, Removed or Not comparable, and every shared step an unchanged pass or still failing.'),
    no_common_steps: z.boolean().describe('True when the two Runs share no step; every step is then Added or Removed.'),
    rows: z.array(RowSchema).describe('Every step of both Runs, already in display order: groups new_failure, still_failing, newly_fixed, not_comparable, added, removed, unchanged_pass.'),
  })
  .openapi('RunComparisonCompared');

const NoPreviousSchema = z
  .object({
    state: z.literal('no_previous'),
    test: TestSchema,
    environment: EnvironmentSchema,
    run: RunHeaderSchema,
    previous: z.null(),
  })
  .openapi('RunComparisonNoPrevious');

const InProgressSchema = z
  .object({
    state: z.literal('in_progress'),
    test: TestSchema,
    environment: EnvironmentSchema,
    run: RunHeaderSchema,
    previous: z.null(),
  })
  .openapi('RunComparisonInProgress');

const UnreliableSchema = z
  .object({
    state: z.literal('unreliable'),
    test: TestSchema,
    environment: EnvironmentSchema,
    run: RunHeaderSchema,
    previous: RunHeaderSchema,
  })
  .openapi('RunComparisonUnreliable');

const RunComparisonSchema = z
  .discriminatedUnion('state', [ComparedSchema, NoPreviousSchema, InProgressSchema, UnreliableSchema])
  .openapi('RunComparison');

registry.registerPath({
  method: 'get',
  path: '/api/v1/runs/{id}/compare',
  tags: ['Runs'],
  summary: 'Compare a Run against the previous Run of the same Test and Environment',
  description: 'Bearer `atc:read` (or cookie session). Any active workspace member, viewer included. The Previous run is the latest passed, failed or aborted Run of the same Test and Environment that finished strictly before this Run started. Steps are paired by ATC occurrence plus exact step text; a reworded step appears as Removed and Added. Branch on `state`: `compared`, `no_previous`, `in_progress` and `unreliable` are all HTTP 200, and only `compared` carries a verdict. **A non-compared 200 means "no verdict", never "no new failures".** Read-only: nothing is written. Non-disclosing: a missing Run, a Run in another workspace and a non-member all return an identical 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The comparison, or the reason there is none.', content: { 'application/json': { schema: RunComparisonSchema } } },
    400: { description: 'Malformed id (not a UUID).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Run not found (missing, not visible, or foreign workspace; non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The comparison could not be read. Fixed text; the database error is logged server-side only.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
