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

// BK-601 — who and when, for an archived row. `archived_with` names the Module whose
// archive swept the row up (or the User Story, for a criterion that went with one).
const ArchiveInfoSchema = z
  .object({
    archived_at: z.string().datetime({ offset: true }),
    archived_by: z.object({ user_id: z.string().uuid(), email: z.string().nullable() }).nullable().describe('From the `module.archived` Activity entry of the archive\'s top Module. Null when no actor was recorded: a User Story or Acceptance Criterion archived on its own shows the date only.'),
    archived_with: z.string().nullable().describe('The Module or User Story this row went down with. Null when it was archived on its own or is the top of the archive.'),
  })
  .nullable()
  .openapi('ArchiveInfo');

const TreeModuleSchema = ModuleSchema.extend({
  archived_at: z.string().datetime({ offset: true }).nullable(),
  archive: ArchiveInfoSchema,
}).openapi('TreeModule');

const TreeUserStorySchema = z
  .object({
    id: z.string().uuid(),
    module_id: z.string().uuid(),
    project_id: z.string().uuid().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    external_id: z.string().nullable(),
    external_url: z.string().nullable(),
    status: z.enum(['draft', 'ready_to_test']),
    created_at: z.string().datetime({ offset: true }),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    archive: ArchiveInfoSchema,
  })
  .openapi('TreeUserStory');

const TreeCriterionSchema = z
  .object({
    id: z.string().uuid(),
    user_story_id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    position: z.number().int(),
    created_at: z.string().datetime({ offset: true }),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    archive: ArchiveInfoSchema,
  })
  .openapi('TreeAcceptanceCriterion');

const TreeArchivedAtcSchema = z
  .object({
    id: z.string().uuid(),
    module_id: z.string().uuid(),
    user_story_id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    layer: z.string(),
    archived_at: z.string().datetime({ offset: true }),
    archive: ArchiveInfoSchema,
  })
  .openapi('TreeArchivedAtc');

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/modules',
  tags: ['Modules'],
  summary: 'List a project\'s module tree',
  description:
    'Bearer `atc:read` (or cookie session). Any workspace member, viewers included. Returns the Project\'s Modules, their User Stories and those Stories\' Acceptance Criteria as flat lists. Live rows only by default; `?include_archived=true` adds archived rows, each carrying `archive`, and `archived_atcs` with the Project\'s archived ATCs, so that what a Module\'s archive took stays reachable. Live ATCs are not listed here.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, {
    name: 'include_archived',
    in: 'query' as const,
    required: false,
    schema: { type: 'string' as const, enum: ['true'] },
    description: 'Also return archived rows. Off by default; any other value leaves them out.',
  }],
  responses: {
    200: {
      description: 'The tree.',
      content: { 'application/json': { schema: z.object({
        modules: z.array(TreeModuleSchema),
        user_stories: z.array(TreeUserStorySchema),
        acceptance_criteria: z.array(TreeCriterionSchema),
        archived_atcs: z.array(TreeArchivedAtcSchema).describe('Empty without the opt-in.'),
      }) } },
    },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or out of reach.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

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
