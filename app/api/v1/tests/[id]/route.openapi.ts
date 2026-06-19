import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-32 — read-only expanded Test view. The chained-ATC step/assertion shapes
// differ from the authoring schemas in `atcs/route.openapi.ts` (which are not
// exported anyway), so we declare local read-shape schemas here that mirror the
// composed RPC payload exactly.

const ChainedStepSchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int(),
    content: z.string(),
    input_data: z.string().nullable(),
    expected: z.string().nullable(),
  })
  .openapi('ChainedStep');

const ChainedAssertionSchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int(),
    content: z.string(),
  })
  .openapi('ChainedAssertion');

const ChainedAtcSchema = z
  .object({
    position: z.number().int().describe('Position of this ATC in the Test chain (1..n, from `test_steps.position`).'),
    step_id: z.string().uuid().describe('`test_steps.id` — the stable chain-row handle.'),
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    layer: z.enum(['UI', 'API', 'Unit']),
    status: z.string(),
    steps: z.array(ChainedStepSchema),
    assertions: z.array(ChainedAssertionSchema),
  })
  .openapi('ChainedAtc');

const ExpandedTestSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    title: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    atc_count: z.number().int().describe('Number of ATCs in the chain (= count of `test_steps`).'),
    atcs: z.array(ChainedAtcSchema).describe('The chain of ATCs, ordered by `test_steps.position`.'),
  })
  .openapi('ExpandedTest');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const ExpandParam = {
  name: 'expand',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Accepted for forward-compatibility; the response is always fully expanded in the MVP.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/tests/{id}',
  tags: ['Tests'],
  summary: 'Read a Test with its chain of ATCs fully expanded',
  description: 'Cookie session or Bearer PAT (read identity only — viewer role suffices; no write scope required). Returns the Test header plus the ordered chain of ATCs, each expanded inline with its ordered steps and assertions, in one round trip. Live content (references, not snapshots). Non-disclosing: missing, not-visible, and foreign-workspace Tests all return an identical 404 — never 403, never an existence echo.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, ExpandParam],
  responses: {
    200: { description: 'The expanded Test.', content: { 'application/json': { schema: z.object({ test: ExpandedTestSchema }) } } },
    400: { description: 'Malformed id (not a UUID).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test not found (missing, not visible, or foreign workspace — non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ChainedAtcSchema, ExpandedTestSchema };
