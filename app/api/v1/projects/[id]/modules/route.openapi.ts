import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ModuleSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    parent_module_id: z.string().uuid().nullable(),
    path: z.string(),
    name: z.string(),
    position: z.number().int(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('Module');

const CreateBodySchema = z
  .object({
    name: z.string().describe('2–80 chars, at least one alphanumeric. Path segment is auto-derived.'),
    description: z.string().optional().describe('Optional Markdown, max 500 chars.'),
    parent_module_id: z
      .string()
      .uuid()
      .optional()
      .describe('Parent module id; omit for a root module. Must belong to the same project.'),
  })
  .openapi('ModuleCreateBody');

const CreateResponseSchema = z
  .object({
    module: ModuleSchema,
    warning: z
      .string()
      .optional()
      .describe('Present only when the resulting nesting depth is >= 5.'),
  })
  .openapi('ModuleCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/modules',
  tags: ['Modules'],
  summary: 'Create a module in a project',
  description:
    'Member-only (role >= member). Auto-derives a per-parent-unique path segment from the name. Modules nest up to 6 levels; depth >= 5 returns a soft warning, depth > 6 is rejected. Duplicate sibling path returns 409; non-members return 403.',
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
      description: 'Module created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A module with this name already exists under the same parent.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name, description, depth, or parent).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ModuleSchema };
