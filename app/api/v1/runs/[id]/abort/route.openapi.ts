import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../../route.openapi';

// BK-36 — abort an in-progress Run with a reason. Reuses the composed Run shape
// from the POST /runs spec (now carrying `abort_reason` + status 'aborted').

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const AbortBodySchema = z
  .object({
    reason: z
      .string()
      .min(3)
      .max(500)
      .describe('Why the run is being aborted. Trimmed, then required to be 3..500 characters.'),
  })
  .openapi('RunAbortBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/{id}/abort',
  tags: ['Runs'],
  summary: 'Abort an in-progress Run with a reason',
  description: 'Bearer `run:execute` (or cookie session); member+ write access. Transactional abort via one SECURITY DEFINER RPC: closes the Run as `aborted` (sets `finished_at`, records the reason, bumps `version`), marks every not-yet-executed step `skipped`, and preserves already-recorded step results. Only a `running` Run can be aborted — an already-closed Run returns 409. The reason is trimmed then required to be 3..500 characters. Abort is first-wins: a concurrent double-submit serializes on a row lock and the loser gets 409.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: AbortBodySchema } } } },
  responses: {
    200: { description: 'Run aborted. Returns the updated Run with `status: aborted` and `abort_reason`.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed id (not a UUID) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope or not a workspace member with write access (non-disclosing — also returned for a Run the caller cannot see).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The run is already closed and cannot be aborted (`conflict`, reason `run_not_abortable`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — the reason is shorter than 3 or longer than 500 characters (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
