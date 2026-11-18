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
    archived_at: z.string().datetime({ offset: true }).nullable().describe('Set when this chain step points at an archived ATC (BK-571). The step stays in the chain.'),
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
    version: z.number().int().describe('Optimistic-lock token, sent back as `X-If-Match` on a rename, reorder or tag change.'),
    tags: z.array(z.string()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    archived_at: z.string().datetime({ offset: true }).nullable().describe('BK-596: set while the Test is archived. An archived Test keeps resolving here, read-only; it is hidden from search, tag filtering, the Tests list and the plan picker, and no Run can start from it.'),
    archived_by: z.string().uuid().nullable(),
    run_count: z.number().int().describe('Runs ever recorded against this Test. Archiving keeps every one of them.'),
    plans: z.array(z.object({ id: z.string().uuid(), name: z.string(), status: z.string() })).describe('The Test Plans that hold this Test. Archiving never edits them.'),
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
  description: 'Bearer `atc:read` (or cookie session). Viewer role suffices; no write scope required. Returns the Test header plus the ordered chain of ATCs, each expanded inline with its ordered steps and assertions, in one round trip. Live content (references, not snapshots). Non-disclosing: missing, not-visible, and foreign-workspace Tests all return an identical 404 — never 403, never an existence echo.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, ExpandParam],
  responses: {
    200: { description: 'The expanded Test.', content: { 'application/json': { schema: z.object({ test: ExpandedTestSchema }) } } },
    400: { description: 'Malformed id (not a UUID).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test not found (missing, not visible, or foreign workspace — non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

const TestErrorResponses = {
  400: { description: 'Malformed id, body or X-If-Match.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  403: { description: 'Missing atc:write scope, or not a writer of the owning workspace (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  404: { description: 'Test not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/tests/{id}',
  tags: ['Tests'],
  summary: 'Rename a Test',
  description: 'Bearer `atc:write` (or cookie session). Body `{ title }`, trimmed, 1-200 characters (the create rule). Optional `X-If-Match: <version>` guards against a concurrent change. Emits one `test.renamed` event carrying the old and new name. An identical name after trimming is a 200 with `changed: false`, no version bump and no event; a case-only change is a real rename. Past Runs keep the name they started under.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { content: { 'application/json': { schema: z.object({ title: z.string() }) } } } },
  responses: {
    200: { description: 'Renamed, or already that name.', content: { 'application/json': { schema: z.object({ test: ExpandedTestSchema, changed: z.boolean() }) } } },
    ...TestErrorResponses,
    409: { description: 'The Test is archived (`details.reason = test_archived`), or `X-If-Match` is stale (`version_conflict`, with `current_version`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Blank title (`title_required`) or longer than 200 characters (`title_too_long`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/tests/{id}',
  tags: ['Tests'],
  summary: 'Archive a Test',
  description: 'Bearer `atc:write` (or cookie session). Soft-delete: the Test leaves every surface that offers it for use (search, tag filtering, the Tests list, the plan picker, Run start) and keeps resolving on every surface that reports what already happened (its Runs, Run history, traceability, reports). Nothing is destroyed: no Run, chain step or Test Plan membership is edited. Emits one `test.archived` event. Idempotent: archiving an archived Test is the same 204 and keeps the first actor and timestamp. Restore with POST .../restore.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    204: { description: 'Archived, or already archived.' },
    ...TestErrorResponses,
  },
});

export { ChainedAtcSchema, ExpandedTestSchema, IdParam, TestErrorResponses };
