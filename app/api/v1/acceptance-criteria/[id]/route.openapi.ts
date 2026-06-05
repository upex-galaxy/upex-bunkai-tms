import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { AcceptanceCriterionSchema } from '../../user-stories/[id]/acceptance-criteria/route.openapi';

const UpdateBodySchema = z
  .object({
    title: z.string().optional().describe('3–200 chars.'),
    description: z.string().nullable().optional().describe('Markdown, up to 50 KB; null clears it.'),
    position: z.number().int().positive().optional().describe('1-based target position. The active set is re-numbered contiguously around it (no gaps).'),
  })
  .openapi('AcceptanceCriterionUpdateBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const criterionResponse = { 'application/json': { schema: z.object({ acceptance_criterion: AcceptanceCriterionSchema }) } };

registry.registerPath({
  method: 'get',
  path: '/api/v1/acceptance-criteria/{id}',
  tags: ['Acceptance Criteria'],
  summary: 'Read an acceptance criterion',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Criterion.', content: criterionResponse },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/acceptance-criteria/{id}',
  tags: ['Acceptance Criteria'],
  summary: 'Edit or reorder an acceptance criterion',
  description: 'Member-only. Edits title/detail (direct update) and/or moves position (atomic, gap-free re-number).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: UpdateBodySchema } } } },
  responses: {
    200: { description: 'Updated.', content: criterionResponse },
    400: { description: 'Malformed id or body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/acceptance-criteria/{id}',
  tags: ['Acceptance Criteria'],
  summary: 'Soft-delete (archive) an acceptance criterion',
  description: 'Member-only. Archives the criterion, closes the position gap, and drops the parent story out of ready_to_test when it was the last active criterion (user_story_reverted).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Archived.',
      content: {
        'application/json': {
          schema: z.object({
            acceptance_criterion: AcceptanceCriterionSchema,
            user_story_reverted: z.boolean(),
          }),
        },
      },
    },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Already archived.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
