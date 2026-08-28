import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-203 — Test Plan membership: list + add.

const TestPlanMemberTestSchema = z
  .object({
    id: z.string().uuid().describe('The Test id (not the membership row id).'),
    title: z.string(),
    tags: z.array(z.string()),
    added_by: z.string().uuid().nullable(),
    added_by_email: z.string().nullable(),
    added_at: z.string().datetime(),
  })
  .openapi('TestPlanMemberTest');

const ListResponseSchema = z
  .object({
    tests: z.array(TestPlanMemberTestSchema).describe('Ordered by added_at ascending (addition order).'),
    count: z.number().int(),
  })
  .openapi('TestPlanMemberTestListResponse');

const AddTestsBodySchema = z
  .object({
    test_ids: z.array(z.string().uuid()).min(1).describe('At least one Test id from the plan\'s own project.'),
  })
  .openapi('TestPlanAddTestsBody');

const AddTestsResponseSchema = z
  .object({
    test_plan_id: z.string().uuid(),
    added_count: z.number().int(),
    member_count: z.number().int().describe('Total member count after this add.'),
  })
  .openapi('TestPlanAddTestsResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/test-plans/{id}/tests',
  tags: ['Test Plans'],
  summary: 'List a test plan\'s member tests',
  description: 'Visible to any workspace member of the plan, viewers included — seeing membership is role-agnostic (only add/remove is gated). Membership is a reference: the same Test may appear in several plans, and removing it here never alters the Test.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Member tests listed.', content: { 'application/json': { schema: ListResponseSchema } } },
    400: { description: 'Malformed test plan id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/test-plans/{id}/tests',
  tags: ['Test Plans'],
  summary: 'Add tests to a test plan',
  description: 'Member-only (role >= member), re-checked live server-side, and only while the plan is Open. Every submitted Test id must belong to the plan\'s own project (derived from its chained ATCs); a mismatch, a nonexistent id, or a foreign-workspace id are all rejected uniformly (422 test_outside_plan_project), with no id disclosed back. A Test already in the plan rejects the WHOLE request (409 conflict) rather than partially applying. Requires an `Idempotency-Key` header; a rapid double-submit of the same selection is deduplicated by the header AND independently by the database unique constraint.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AddTestsBodySchema } },
    },
  },
  responses: {
    201: { description: 'Tests added.', content: { 'application/json': { schema: AddTestsResponseSchema } } },
    400: { description: 'Malformed test plan id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A submitted test is already in the plan, or the plan is closed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty test_ids, or a submitted test does not belong to the plan\'s project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { TestPlanMemberTestSchema };
