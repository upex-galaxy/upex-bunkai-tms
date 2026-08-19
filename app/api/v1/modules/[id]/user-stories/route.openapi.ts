import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const UserStorySchema = z
  .object({
    id: z.string().uuid(),
    module_id: z.string().uuid(),
    project_id: z.string().uuid().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    external_id: z.string().nullable(),
    external_url: z.string().nullable(),
    status: z.enum(['draft', 'ready_to_test']).describe('Ready-to-test gate (BK-15).'),
    created_at: z.string().datetime(),
    archived_at: z.string().datetime().nullable(),
  })
  .openapi('UserStory');

const CreateBodySchema = z
  .object({
    title: z.string().describe('3–200 chars.'),
    description: z.string().optional().describe('Optional Markdown, up to 50 KB. Sanitized on save.'),
    external_id: z.string().optional().describe('Optional Jira key (LETTERS-NUMBER, e.g. BK-42). Unique per project, case-insensitive.'),
  })
  .openapi('UserStoryCreateBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/modules/{id}/user-stories',
  tags: ['User Stories'],
  summary: 'Create a user story under a module',
  description: 'Bearer \`atc:write\` (or cookie session). Member-only. Anchors the story to the module, validates the title (3–200) and optional Jira key, sanitizes the Markdown description. Duplicate Jira key in the project returns 409.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    201: { description: 'Story created.', content: { 'application/json': { schema: z.object({ user_story: UserStorySchema }) } } },
    400: { description: 'Malformed id or body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Module not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Jira key already linked in this project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (title, Jira key, or description size).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/modules/{id}/user-stories',
  tags: ['User Stories'],
  summary: 'List a module\'s active user stories',
  description: 'Bearer \`atc:read\` (or cookie session). Member-only. Returns active (non-archived) stories, newest first.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Stories.', content: { 'application/json': { schema: z.object({ user_stories: z.array(UserStorySchema) }) } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { UserStorySchema };
