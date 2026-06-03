import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ProjectSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    workspace_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .openapi('Project');

const CreateBodySchema = z
  .object({
    name: z.string().describe('3–80 chars, at least one alphanumeric. Slug is auto-derived.'),
    description: z.string().optional().describe('Optional Markdown, max 5KB.'),
  })
  .openapi('ProjectCreateBody');

const CreateResponseSchema = z
  .object({ project: ProjectSchema })
  .openapi('ProjectCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/projects',
  tags: ['Projects'],
  summary: 'Create a project in a workspace',
  description:
    'Member-only (role >= member). Auto-derives a per-workspace-unique slug from the name. Duplicate slug returns 409; non-members return 403.',
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
      description: 'Project created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: 'Malformed workspace id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A project with this slug already exists in the workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ProjectSchema };
