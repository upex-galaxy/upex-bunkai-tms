import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../route.openapi';

// BK-34 — read-only expanded Run view. Reuses the composed Run shape from the
// POST spec (header + ordered run_atcs + ordered run_steps).

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/runs/{id}',
  tags: ['Runs'],
  summary: 'Read a Run with its snapshot chain fully expanded',
  description: 'Cookie session or Bearer PAT (read identity only — viewer role suffices; no write scope required). Returns the Run header plus the ordered run_atcs, each with its ordered run_steps — the immutable snapshot taken at start. Non-disclosing: missing, not-visible, and foreign-workspace Runs all return an identical 404 — never 403, never an existence echo.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The expanded Run.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    400: { description: 'Malformed id (not a UUID).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Run not found (missing, not visible, or foreign workspace — non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
