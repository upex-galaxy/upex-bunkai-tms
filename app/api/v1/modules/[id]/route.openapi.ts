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
    archived_at: z.string().datetime().nullable(),
  })
  .openapi('ModuleDetail');

const UpdateBodySchema = z
  .object({
    name: z
      .string()
      .optional()
      .describe('New name, 2–80 chars, at least one alphanumeric. Renaming rebuilds the module path and every descendant path. Mutually exclusive with `parent_module_id` — a rename cannot be combined with a move.'),
    description: z
      .string()
      .nullable()
      .optional()
      .describe('New description (max 500 chars). Pass null to clear it; omit to leave it unchanged. Mutually exclusive with `parent_module_id` — a description edit cannot be combined with a move.'),
    parent_module_id: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe('Move the module: a UUID re-parents it under that module (carrying its subtree); null moves it to the project root; omit to leave the parent unchanged. Rejects cycles, depth > 6, and cross-project targets. Mutually exclusive with `name`/`description` — combining a move with a rename/description edit returns 422 (`combined_update_and_move`).'),
  })
  .openapi('ModuleUpdateBody');

const UpdateResponseSchema = z
  .object({ module: ModuleSchema })
  .openapi('ModuleUpdateResponse');

const ArchiveSummarySchema = z
  .object({
    modules: z.number().int(),
    user_stories: z.number().int(),
    acceptance_criteria: z.number().int(),
    atcs: z.number().int(),
  })
  .describe('Per-table counts of rows archived by the cascade.');

const ArchiveResponseSchema = z
  .object({ archived: ArchiveSummarySchema })
  .openapi('ModuleArchiveResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/modules/{id}',
  tags: ['Modules'],
  summary: 'Rename, edit, or move a module',
  description:
    'Member-only (role >= member). Renaming rebuilds the module path and every descendant path; `parent_module_id` moves the module (and its subtree) to a new parent or the project root. `parent_module_id` is mutually exclusive with `name`/`description` — a combined update+move request returns 422 (`combined_update_and_move`); send them as separate PATCH calls. A sibling/destination slug collision returns 409; a cycle, depth-overflow, or invalid target returns 422. An archived module reads as 404. Viewers/non-members return 403.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Module updated.',
      content: { 'application/json': { schema: UpdateResponseSchema } },
    },
    400: { description: 'Malformed module id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Module not found or archived.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The new name or move destination collides with a sibling module.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name, description, combined update+move, or move: cycle / depth / invalid parent).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/modules/{id}',
  tags: ['Modules'],
  summary: 'Soft-delete (archive) a module and its subtree',
  description:
    'Member-only (role >= member). Archives the module, its descendant modules, and the linked user stories, acceptance criteria, and ATCs in one transaction. Returns per-table counts. Archiving an already-archived module returns 409; viewers/non-members return 403.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Module and its subtree archived.',
      content: { 'application/json': { schema: ArchiveResponseSchema } },
    },
    400: { description: 'Malformed module id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Module not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Module is already archived.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ModuleSchema as ModuleDetailSchema };
