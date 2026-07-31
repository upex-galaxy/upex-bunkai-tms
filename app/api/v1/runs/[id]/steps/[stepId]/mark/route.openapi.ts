import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../../../../route.openapi';

// BK-35 — mark one run step passed/failed/blocked, with an optional note +
// evidence link. Reuses the composed Run shape from the POST /runs spec (the
// mark response is the full Run, same as abort/finish — the caller reads the
// updated step's status/note/evidence_url/executed_at plus the recomputed
// parent run_atcs verdict off it).

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const StepIdParam = {
  name: 'stepId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const MarkBodySchema = z
  .object({
    status: z
      .enum(['passed', 'failed', 'blocked'])
      .describe('The step result. `pending` is never accepted — a re-mark-to-pending attempt is rejected as validation_failed.'),
    note: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe('Optional free-text note. An empty or whitespace-only string normalizes to null rather than being rejected.'),
    evidence_url: z
      .string()
      .url()
      .max(2000)
      .nullable()
      .optional()
      .describe('Optional evidence link. An empty or whitespace-only string normalizes to null rather than being rejected; a non-empty value must be a valid URL.'),
  })
  .openapi('RunStepMarkBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/{id}/steps/{stepId}/mark',
  tags: ['Runs'],
  summary: 'Mark a run step passed, failed, or blocked',
  description: 'Bearer `run:execute` (or cookie session); member+ write access. Transactional mark via one SECURITY DEFINER RPC: UPDATEs the step in place (no history table — the most recent result stands, so re-marking a step is always last-write-wins) and recomputes the parent ATC verdict from its full current sibling step set (fail overrides everything, else blocked overrides passed, else passed; the verdict stays "pending" while ANY sibling step is still pending). Only a `running` Run accepts new step results — an already-closed Run (passed/failed/aborted) returns 409. Returns the composed Run, so the caller reads the updated step and the recomputed ATC verdict off the same response abort/finish already use.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, StepIdParam],
  request: { body: { required: true, content: { 'application/json': { schema: MarkBodySchema } } } },
  responses: {
    200: { description: 'Step marked. Returns the updated Run with the step\'s new status/note/evidence_url/executed_at and the recomputed parent ATC verdict.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed ids (not UUIDs) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope or not a workspace member with write access (non-disclosing — also returned for a Run/step the caller cannot see).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Run step not found — missing, or belonging to a different run than {id} (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The run is already closed and cannot accept new step results (`conflict`, reason `run_step_marking_closed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — status is not one of passed, failed, or blocked, note/evidence_url exceed 2000 characters, or evidence_url is not a valid URL (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
