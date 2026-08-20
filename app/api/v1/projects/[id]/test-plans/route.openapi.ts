import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-202 — Test Plans: list + create. A Test Plan is the container that
// declares, up front, which Tests a cycle is expected to cover ("Release 2.4
// regression"). Visible to every workspace member of the project; member+ can
// create. Membership curation, progress and closing arrive with the sibling
// stories of epic BK-201.

const TestPlanSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string().describe('1–100 chars after normalize (internal whitespace collapsed, then trimmed). Unique per project, case-insensitive.'),
    description: z.string().describe('0–500 chars.'),
    goal: z.string().describe('0–100 chars after normalize. Optional short target/release label, e.g. "Release 2.4".'),
    status: z.enum(['open', 'closed']).describe('A new plan is always "open". Closing is a separate capability and is not exposed by this API.'),
    created_by: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('TestPlan');

const ListResponseSchema = z
  .object({
    test_plans: z.array(TestPlanSchema).describe('Ordered by created_at descending, id descending.'),
  })
  .openapi('TestPlanListResponse');

const CreateBodySchema = z
  .object({
    name: z.string().describe('1–100 chars after normalize. Unique per project, case-insensitive.'),
    description: z.string().optional().describe('0–500 chars. Defaults to empty.'),
    goal: z.string().optional().describe('0–100 chars after normalize. Defaults to empty.'),
  })
  .openapi('TestPlanCreateBody');

const CreateResponseSchema = z
  .object({ test_plan: TestPlanSchema })
  .openapi('TestPlanCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/test-plans',
  tags: ['Test Plans'],
  summary: 'List a project\'s test plans',
  description:
    'Lists the project\'s test plans newest first (created_at descending, id descending as the tie-break). Visible to any workspace member including viewers; a non-member receives an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Test plans listed.',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/test-plans',
  tags: ['Test Plans'],
  summary: 'Create a test plan in a project',
  description:
    'Member-only (role >= member), re-checked live server-side on every call — a viewer calling this endpoint directly receives 403 regardless of what the client believes its role to be. Normalizes the name (collapses internal whitespace, then trims) and enforces 1–100 chars; description is capped at 500 chars and goal at 100. The name is unique per project (case-insensitive, whitespace-normalized) via a database unique index, so two concurrent creates of the same name resolve to exactly one success and one 409. The new plan is always created with status "open" and no member tests.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Test plan created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer / not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A test plan with this name already exists in the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name, description or goal length).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { TestPlanSchema };
