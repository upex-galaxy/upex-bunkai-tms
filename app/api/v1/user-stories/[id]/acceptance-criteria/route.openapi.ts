import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const AcceptanceCriterionSchema = z
  .object({
    id: z.string().uuid(),
    user_story_id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    position: z.number().int(),
    created_at: z.string().datetime(),
    archived_at: z.string().datetime().nullable(),
  })
  .openapi('AcceptanceCriterion');

const CreateBodySchema = z
  .object({
    title: z.string().describe('3–200 chars.'),
    description: z.string().optional().describe('Optional Markdown, up to 50 KB. Sanitized on save.'),
    position: z.number().int().positive().optional().describe('1-based insert position; appended at the tail when omitted. Active siblings shift down atomically.'),
  })
  .openapi('AcceptanceCriterionCreateBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/user-stories/{id}/acceptance-criteria',
  tags: ['Acceptance Criteria'],
  summary: 'Add an acceptance criterion to a user story',
  description: 'Bearer \`atc:write\` (or cookie session). Member-only. Inserts at the given position (or the tail), atomically shifting active siblings down so positions stay gap-free.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    201: { description: 'Criterion created.', content: { 'application/json': { schema: z.object({ acceptance_criterion: AcceptanceCriterionSchema }) } } },
    400: { description: 'Malformed id or body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'User story not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (title or detail size).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/user-stories/{id}/acceptance-criteria',
  tags: ['Acceptance Criteria'],
  summary: 'List a story\'s active acceptance criteria',
  description: 'Bearer \`atc:read\` (or cookie session). Member-only. Returns active (non-archived) criteria in position order.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Criteria.', content: { 'application/json': { schema: z.object({ acceptance_criteria: z.array(AcceptanceCriterionSchema) }) } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { AcceptanceCriterionSchema };
