import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-34 — start a manual Run of a Test. The composed Run payload mirrors
// bunkai_run_json: header + ordered run_atcs, each with ordered run_steps (the
// snapshot taken at start). The same read shapes are reused by the GET-by-id
// spec via the exports below.

const RunStepSchema = z
  .object({
    id: z.string().uuid(),
    atc_step_id: z.string().uuid().nullable().describe('Provenance link to the source atc_steps row; SET NULL if the source is deleted. Never read for content.'),
    position: z.number().int(),
    content: z.string().describe('Snapshot of atc_steps.content at start — frozen; later Test edits never alter it.'),
    input_data: z.string().nullable(),
    expected: z.string().nullable(),
    status: z.enum(['pending', 'passed', 'failed', 'blocked', 'skipped']),
    note: z.string().nullable(),
    evidence_url: z.string().nullable(),
    executed_at: z.string().datetime().nullable(),
  })
  .openapi('RunStep');

const RunAtcSchema = z
  .object({
    id: z.string().uuid(),
    atc_id: z.string().uuid().nullable().describe('Provenance link to the source ATC; SET NULL if the source is deleted.'),
    position: z.number().int().describe('Chain position copied from test_steps.position (1..n).'),
    atc_title: z.string().describe('Snapshot of the ATC title at start.'),
    status: z.enum(['pending', 'passed', 'failed', 'blocked', 'skipped']),
    steps: z.array(RunStepSchema),
  })
  .openapi('RunAtc');

const RunSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    test_id: z.string().uuid(),
    environment_id: z.string().uuid(),
    environment_name: z.string().nullable(),
    status: z.enum(['running', 'passed', 'failed', 'aborted']),
    executor_mode: z.enum(['human', 'agent', 'ci']),
    executor_user_id: z.string().uuid().nullable(),
    test_title: z.string().describe('Snapshot of the Test title at start.'),
    version: z.number().int(),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    atc_count: z.number().int(),
    step_count: z.number().int(),
    atcs: z.array(RunAtcSchema).describe('The snapshot chain, ordered by position.'),
    replayed: z.boolean().optional().describe('true when this call returned an existing Run within the 24h same-token window (HTTP 200); false/absent when freshly created (HTTP 201).'),
  })
  .openapi('Run');

const CreateBodySchema = z
  .object({
    test_id: z.string().uuid().describe('The Test to run.'),
    environment_id: z.string().uuid().describe('A configured project_environments row belonging to the Test\'s Project.'),
    executor_mode: z
      .enum(['human', 'agent', 'ci'])
      .optional()
      .describe('Cookie sessions are always `human` (any supplied value is ignored). Bearer (PAT) callers may declare `agent` / `ci`; defaults to `human`.'),
    start_token: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Domain idempotency token (distinct from the Idempotency-Key header). A same (test_id, start_token) within 24h returns the existing Run (HTTP 200). Omit it to mint a fresh one server-side (always a new Run).'),
  })
  .openapi('RunCreateBody');

const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description:
    'Required. 8–128 chars, [a-zA-Z0-9_-]. The HTTP request-replay guard: a replay with the same key and payload returns the stored response; the same key with a different payload returns 409 `conflict`. Distinct from the domain `start_token` (the per-Test 24h window). Window: 24h.',
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs',
  tags: ['Runs'],
  summary: 'Start a manual Run of a Test in a chosen environment',
  description: 'Bearer `run:execute` (or cookie session). Transactional create via one SECURITY DEFINER RPC: snapshots the Test\'s ATC chain into run_atcs/run_steps (each `pending`), validates the environment belongs to the Test\'s Project and that the Test has ≥1 executable step, and enforces a 24h same-token idempotency window. Cookie sessions run as `human`; PAT callers may declare `agent` / `ci`. Returns 201 on create, 200 when the 24h same-token window returned an existing Run.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdempotencyKeyParam],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    200: { description: 'Replay: the same (test_id, start_token) within 24h returned the existing Run.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    201: { description: 'Run started.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed body or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope or not a workspace member with write access (non-disclosing — also returned for a Test the caller cannot see).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Idempotency-Key reused with a different payload, or a request with the same key is still in flight (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`validation_failed` for body shape, `no_executable_steps` when the Test has no executable steps, `environment_invalid` when the environment is not configured for the Test\'s Project).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RunAtcSchema, RunSchema, RunStepSchema };
