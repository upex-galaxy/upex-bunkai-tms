import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../../route.openapi';

// BK-39 — finish an in-progress Run with a final verdict. Reuses the composed Run
// shape from the POST /runs spec (the final verdict IS the run `status`:
// passed | failed). No new field — `finished_at` already carries the finish time.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const FinishBodySchema = z
  .object({
    verdict: z
      .enum(['passed', 'failed'])
      .describe('The final verdict to close the run with. `aborted` is not a finish verdict — abort is its own action (BK-36).'),
  })
  .openapi('RunFinishBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/{id}/finish',
  tags: ['Runs'],
  summary: 'Finish an in-progress Run with a final verdict',
  description: 'Bearer `run:execute` (or cookie session); member+ write access. Transactional finish via one SECURITY DEFINER RPC: closes the Run with the chosen final verdict `passed` or `failed` (sets `finished_at`, bumps `version`), marks every not-yet-executed step `skipped`, and preserves already-recorded step results. Only a `running` Run can be finished — an already-closed Run (passed/failed/aborted) returns 409. A human, an AI Test Agent, and a CI pipeline are handled identically. Finish is first-wins: a concurrent double-submit (or a race with abort) serializes on a row lock and the loser gets 409.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: FinishBodySchema } } } },
  responses: {
    200: { description: 'Run finished. Returns the updated Run with `status` set to the final verdict (`passed`/`failed`) and `finished_at` stamped.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed id (not a UUID) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope or not a workspace member with write access (non-disclosing — also returned for a Run the caller cannot see).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The run is already closed and cannot be finished (`conflict`, reason `run_not_finishable`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — no final verdict of passed or failed was supplied (`validation_failed`, reason `finish_verdict_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
