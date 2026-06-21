import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-148 — Project Environments: rename + remove. Removal is BLOCKED (409) when
// any run references the environment; the response states how many. Unused
// environments are hard-deleted.
//
// The `ProjectEnvironment` component is registered by the sibling list/add spec
// (projects/[id]/environments/route.openapi.ts); we reference the same row shape
// inline here (no second `.openapi('ProjectEnvironment')` — that would collide).
const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  created_at: z.string().datetime(),
});

const RenameBodySchema = z
  .object({
    name: z.string().describe('1–50 chars after trim. Unique per project, case-insensitive.'),
  })
  .openapi('ProjectEnvironmentRenameBody');

const RenameResponseSchema = z
  .object({ environment: EnvironmentSchema })
  .openapi('ProjectEnvironmentRenameResponse');

const DeleteResponseSchema = z
  .object({
    deleted: z.object({
      deleted: z.boolean(),
      id: z.string().uuid(),
    }),
  })
  .openapi('ProjectEnvironmentDeleteResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/environments/{id}',
  tags: ['Environments'],
  summary: 'Rename an environment',
  description:
    'Member-only (role >= member). Same name rules as create (trim, 1–50 chars, case-insensitive uniqueness). The row id is unchanged, so runs that reference it keep referencing it. A collision returns 409; non-members return 403; a missing environment returns 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: RenameBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Environment renamed.',
      content: { 'application/json': { schema: RenameResponseSchema } },
    },
    400: { description: 'Malformed environment id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Environment not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'An environment with this name already exists.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name empty or > 50 chars).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/environments/{id}',
  tags: ['Environments'],
  summary: 'Remove an environment',
  description:
    'Member-only (role >= member). Hard-deletes an unused environment. BLOCKED with 409 when one or more runs reference the environment — the response message states how many. Non-members return 403; a missing environment returns 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Environment removed.',
      content: { 'application/json': { schema: DeleteResponseSchema } },
    },
    400: { description: 'Malformed environment id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Environment not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The environment is in use by one or more runs and cannot be removed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
