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

const CI_CONTEXT_REFUSAL = 'Optional. An invalid value is refused with 422 `validation_failed`, `details.field` naming the field, and a message that starts with the field name; nothing is recorded.';

const CiContextBodyFields = {
  commit: z
    .string()
    .min(7)
    .max(64)
    .regex(/^[0-9a-fA-F]+$/)
    .optional()
    .describe(`BK-1995 CI context: the commit under test, hexadecimal, 7 to 64 characters, any case (stored lower-cased). ${CI_CONTEXT_REFUSAL}`),
  branch: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(`BK-1995 CI context: the branch under test, 1 to 255 characters, surrounding whitespace trimmed, line breaks and control characters refused. An empty branch is refused: a pipeline running on a tag sends the tag name here (for example \`v1.4.0\`). ${CI_CONTEXT_REFUSAL}`),
  pipeline_name: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe(`BK-1995 CI context: the pipeline name, 1 to 100 characters, surrounding whitespace trimmed, line breaks and control characters refused. ${CI_CONTEXT_REFUSAL}`),
  pipeline_url: z
    .string()
    .max(2048)
    .optional()
    .describe(`BK-1995 CI context: a link to the pipeline run, http or https only, at most 2048 characters, no whitespace and no credentials (\`https://user:secret@host\` is refused). ${CI_CONTEXT_REFUSAL}`),
};

const RunSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    test_id: z.string().uuid(),
    environment_id: z.string().uuid(),
    environment_name: z.string().nullable(),
    status: z.enum(['running', 'passed', 'failed', 'aborted']),
    abort_reason: z.string().nullable().describe('BK-36 — the reason captured when the run was aborted; null for non-aborted runs.'),
    executor_mode: z.enum(['human', 'agent', 'ci']),
    executor_user_id: z.string().uuid().nullable(),
    executor_name: z.string().nullable().describe('BK-222 — the name of the access token that started or submitted the run (snapshotted, so renaming the token later does not change it); null for runs started from a browser session. BK-223 — the run header reads "Agent — <token name>" for an agent or ci run.'),
    evidence_urls: z.array(z.string()).describe('BK-222 — http(s) evidence links reported with a submitted run (at most 20); empty for other runs.'),
    commit: z.string().nullable().describe('BK-1995 — the commit reported with the run (lower-case hexadecimal); null when none was reported and for runs created before the CI context existed. Written once, never changed.'),
    branch: z.string().nullable().describe('BK-1995 — the branch (or tag name) reported with the run; null when none was reported.'),
    pipeline_name: z.string().nullable().describe('BK-1995 — the pipeline name reported with the run; null when none was reported.'),
    pipeline_url: z.string().nullable().describe('BK-1995 — the http(s) link to the pipeline run reported with the run; null when none was reported.'),
    test_title: z.string().describe('Snapshot of the Test title at start.'),
    version: z.number().int(),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    atc_count: z.number().int(),
    step_count: z.number().int(),
    atcs: z.array(RunAtcSchema).describe('The snapshot chain, ordered by position.'),
    replayed: z.boolean().optional().describe('true when this call returned an existing Run within the 24h idempotency window (HTTP 200: the same start_token for POST /runs, the same idempotency_key for POST /runs/submissions); false/absent when freshly created (HTTP 201).'),
  })
  .openapi('Run');

const CreateBodySchema = z
  .object({
    test_id: z.string().uuid().describe('The Test to run.'),
    environment_id: z.string().uuid().describe('A configured project_environments row belonging to the Test\'s Project.'),
    executor_mode: z
      .enum(['human', 'agent', 'ci'])
      .optional()
      .describe('Cookie sessions are always `human` (any supplied value is ignored). Bearer (PAT) callers may declare `agent` / `ci`; defaults to `human` (a start without it is a human run: it keeps the 4 hour inactivity limit and no "Agent" attribution).'),
    start_token: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Domain idempotency token (distinct from the Idempotency-Key header). A same (test_id, start_token) within 24h returns the existing Run (HTTP 200). Omit it to mint a fresh one server-side (always a new Run). Gotcha: the same start_token inside 24h returns the existing Run even when it was closed (finished, aborted, or stale-aborted by the inactivity timeout), so restarting after a stale abort needs a NEW start_token. BK-1995: the same start_token with different CI details (commit, branch, pipeline_name, pipeline_url) is 409 `ci_context_conflict` and opens nothing.'),
    ...CiContextBodyFields,
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
  description: 'Bearer `run:execute` (or cookie session). Transactional create via one SECURITY DEFINER RPC: snapshots the Test\'s ATC chain into run_atcs/run_steps (each `pending`), validates the environment belongs to the Test\'s Project and that the Test has ≥1 executable step, and enforces a 24h same-token idempotency window. Cookie sessions run as `human`; PAT callers may declare `agent` / `ci`. Returns 201 on create, 200 when the 24h same-token window returned an existing Run.\n\nStreaming a run (BK-223): (1) POST /api/v1/runs with `executor_mode` `agent` or `ci` and read each step `id` from the response; (2) POST /api/v1/runs/{id}/steps/{stepId}/mark once per step as it executes (any order, any subset; statuses `passed`, `failed`, `blocked`); (3) POST /api/v1/runs/{id}/finish with verdict `passed` or `failed` (steps never reported are recorded as `skipped`, the duration is derived from the run timestamps), or POST /api/v1/runs/{id}/abort with a reason if the runner dies. Humans watching the run detail see each step flip within seconds. CI context (BK-1995): an access-token open may report `commit`, `branch`, `pipeline_name` and `pipeline_url`, all optional and in any combination, whatever the executor mode; they are stored once and returned on every read of the run, and later step reports, finish and abort ignore any details they carry. A run started in the app (cookie session) carries none: sending one is 422 `ci_context_not_allowed`. An `agent` or `ci` run with no step report for 60 minutes is aborted automatically with a reason starting "Inactivity timeout" and its reported steps are kept; human runs keep the 4 hour limit. A closed run accepts nothing (409): start a new run with a new `start_token`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdempotencyKeyParam],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    200: { description: 'Replay: the same (test_id, start_token) within 24h returned the existing Run.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    201: { description: 'Run started.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed body or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope or not a workspace member with write access (non-disclosing — also returned for a Test the caller cannot see).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Idempotency-Key reused with a different payload (the CI details are part of it), or a request with the same key is still in flight (`conflict`), or the same start_token within 24h carries different CI details (`details.reason: ci_context_conflict`), or the Test is archived (`details.reason: test_archived`; a replayed start token still returns its Run).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`validation_failed` for body shape; for a CI detail `details.reason` is `commit_invalid`, `branch_invalid`, `pipeline_name_invalid` or `pipeline_url_invalid` with `details.field`, and `ci_context_not_allowed` when a cookie session sends one; `no_executable_steps` when the Test has no executable steps, `environment_invalid` when the environment is not configured for the Test\'s Project).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { CiContextBodyFields, RunAtcSchema, RunSchema, RunStepSchema };
