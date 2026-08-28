import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-203 — Test Plan membership: remove one test.

const RemoveResponseSchema = z
  .object({
    test_plan_id: z.string().uuid(),
    removed_test_id: z.string().uuid(),
    member_count: z.number().int().describe('Total member count after this removal.'),
  })
  .openapi('TestPlanRemoveTestResponse');

const Params = [
  {
    name: 'id',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const, format: 'uuid' as const },
  },
  {
    name: 'testId',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const, format: 'uuid' as const },
  },
];

registry.registerPath({
  method: 'delete',
  path: '/api/v1/test-plans/{id}/tests/{testId}',
  tags: ['Test Plans'],
  summary: 'Remove a test from a test plan',
  description: 'Member-only (role >= member), re-checked live server-side, and only while the plan is Open. Removing a membership never deletes or alters the Test itself, and never affects the Test\'s membership in any other plan.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: Params,
  responses: {
    200: { description: 'Test removed from the plan.', content: { 'application/json': { schema: RemoveResponseSchema } } },
    400: { description: 'Malformed test plan id or test id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found, or this test is not a member of it.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The plan is closed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
