import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { UserStorySchema } from '../../modules/[id]/user-stories/route.openapi';

const UpdateBodySchema = z
  .object({
    title: z.string().optional().describe('3–200 chars.'),
    description: z.string().nullable().optional().describe('Markdown, up to 50 KB; null clears it.'),
    external_id: z.string().nullable().optional().describe('Jira key. Immutable once set — a change returns 409.'),
    status: z.enum(['draft', 'ready_to_test']).optional().describe('Ready-to-test gate: moving to ready_to_test with zero active acceptance criteria returns 409 (BK-15).'),
  })
  .openapi('UserStoryUpdateBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const storyResponse = { 'application/json': { schema: z.object({ user_story: UserStorySchema }) } };

registry.registerPath({
  method: 'get',
  path: '/api/v1/user-stories/{id}',
  tags: ['User Stories'],
  summary: 'Read a user story',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Story.', content: storyResponse },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/user-stories/{id}',
  tags: ['User Stories'],
  summary: 'Edit a user story',
  description: 'Bearer \`atc:write\` (or cookie session). Member-only. Title / description / Jira key. The Jira key is immutable once set (409 on change).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: UpdateBodySchema } } } },
  responses: {
    200: { description: 'Updated.', content: storyResponse },
    400: { description: 'Malformed id or body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Duplicate/immutable Jira key, or ready-to-test gate (no active acceptance criteria).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/user-stories/{id}',
  tags: ['User Stories'],
  summary: 'Soft-delete (archive) a user story',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Archived.', content: storyResponse },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Already archived.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
