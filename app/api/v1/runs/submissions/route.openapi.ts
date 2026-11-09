import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../route.openapi';

// BK-222 — submit a finished automated Run with per-step results in one call.
// The response is the composed Run (shared RunSchema), already finished.

const SubmissionStepSchema = z
  .object({
    position: z.number().int().min(1).describe('The chain position of the step, 1..N in the Test\'s chain (the same ATC can appear at several positions).'),
    result: z.enum(['pass', 'fail', 'block']).describe('The step outcome.'),
  })
  .openapi('RunSubmissionStep');

const SubmissionBodySchema = z
  .object({
    test_id: z.string().uuid().describe('The Test being reported. Must belong to the token\'s workspace (otherwise 404).'),
    environment: z.string().min(1).max(60).describe('The NAME of one of the Test\'s Project environments (case-insensitive). An unknown name is rejected and never created.'),
    verdict: z.enum(['passed', 'failed']).describe('`passed` requires every step to be `pass`; `failed` requires at least one `fail` or `block`. Contradictions are rejected, never corrected.'),
    duration_seconds: z.number().int().min(0).max(86400).describe('Whole seconds. The run finishes at submission time and starts that many seconds earlier.'),
    steps: z.array(SubmissionStepSchema).min(1).max(500).describe('One result for EVERY chain position 1..N, each reported once.'),
    evidence_urls: z.array(z.string().max(2048)).max(20).optional().describe('Optional http or https links, stored as links only (never fetched).'),
    idempotency_key: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Optional domain idempotency key, scoped per workspace with a 24 hour window. The same key and payload returns the original run (200, `replayed: true`); the same key with a different payload is 409; after 24 hours the key is free. A rejected submission does not consume the key. The `Idempotency-Key` header is NOT used on this endpoint (ADR-0026).'),
  })
  .openapi('RunSubmissionBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/submissions',
  tags: ['Runs'],
  summary: 'Submit a finished automated Run with step results',
  description: 'Bearer token only, scope `run:execute`, owner with member role or higher in the token\'s workspace (a cookie session gets 403 `token_required`; a token without a workspace gets 403 `token_not_workspace_scoped`). Creates the Run already finished in one transaction: executor mode `agent` attributed to the token name, the Test\'s chain snapshotted into run_atcs/run_steps with the submitted statuses, and `run.started` + `run.finished` audit rows. Step results are keyed by chain position. Returns 201 on create, 200 when the `idempotency_key` replays an existing run.',
  security: [{ bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: SubmissionBodySchema } } } },
  responses: {
    200: { description: 'Replay: the same `idempotency_key` and payload within 24 hours returned the original Run (`replayed: true`).', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    201: { description: 'Run recorded.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated, or the token is revoked or expired.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing `run:execute` scope, a viewer owner, a cookie session (`token_required`) or a token not bound to a workspace (`token_not_workspace_scoped`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'The Test does not exist or belongs to another workspace than the token\'s (`not_found`); reveals nothing about other workspaces.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The `idempotency_key` was already used with a different payload within 24 hours (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`validation_failed`: reasons `verdict_invalid`, `step_result_invalid`, `steps_incomplete` with `missing_positions`, `steps_duplicate_position`, `verdict_inconsistent`, `duration_invalid`, `evidence_*`, `idempotency_key_invalid`), `environment_invalid` (names the unknown environment) or `no_executable_steps`. Nothing is recorded.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
