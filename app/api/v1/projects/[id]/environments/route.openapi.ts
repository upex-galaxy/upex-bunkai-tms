import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-148 — Project Environments: list + add. An environment is a named
// deployment target a Run executes against, scoped to a project. Seeded
// Staging/Production exist per project (BK-34); members can read, member+ can
// write.

const EnvironmentSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string().describe('1–50 chars after trim, unique per project (case-insensitive).'),
    created_at: z.string().datetime(),
  })
  .openapi('ProjectEnvironment');

const ListResponseSchema = z
  .object({
    environments: z.array(EnvironmentSchema).describe('Ordered by name ascending.'),
  })
  .openapi('ProjectEnvironmentListResponse');

const CreateBodySchema = z
  .object({
    name: z.string().describe('1–50 chars after trim. Unique per project, case-insensitive.'),
  })
  .openapi('ProjectEnvironmentCreateBody');

const CreateResponseSchema = z
  .object({ environment: EnvironmentSchema })
  .openapi('ProjectEnvironmentCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/environments',
  tags: ['Environments'],
  summary: 'List a project\'s environments',
  description:
    'Lists the project\'s environments ordered by name (ascending). Visible to any workspace member; a non-member receives an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Environments listed.',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/environments',
  tags: ['Environments'],
  summary: 'Add an environment to a project',
  description:
    'Member-only (role >= member). Trims the name and enforces 1–50 chars. The name is unique per project (case-insensitive); a duplicate returns 409. Non-members return 403.',
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
      description: 'Environment created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'An environment with this name already exists.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name empty or > 50 chars).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { EnvironmentSchema };
