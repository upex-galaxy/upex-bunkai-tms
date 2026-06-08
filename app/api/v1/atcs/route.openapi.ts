import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const AtcStepSchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int(),
    content: z.string(),
    input_data: z.string().nullable(),
    expected: z.string().nullable(),
  })
  .openapi('AtcStep');

const AtcAssertionSchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int(),
    content: z.string(),
  })
  .openapi('AtcAssertion');

const AtcSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    module_id: z.string().uuid(),
    user_story_id: z.string().uuid(),
    slug: z.string().describe('`<module-slug>/atc-<8 hex>`. Computed once at creation, immutable across edits.'),
    title: z.string(),
    layer: z.enum(['UI', 'API', 'Unit']),
    version: z.number().int().describe('Monotonic per ATC. Starts at 1, +1 per edit.'),
    status: z.enum(['pass', 'fail', 'blocked', 'skipped', 'running', 'unrun']),
    tags: z.array(z.string()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    archived_at: z.string().datetime().nullable(),
    steps: z.array(AtcStepSchema),
    assertions: z.array(AtcAssertionSchema),
    acceptance_criterion_ids: z.array(z.string().uuid()),
  })
  .openapi('Atc');

const StepInput = z.object({
  position: z.number().int().describe('Integer, strictly increasing from 1.'),
  content: z.string().min(1).max(2048).describe('Up to 2 KB Markdown.'),
  input_data: z.string().max(2048).nullable().optional(),
  expected: z.string().max(2048).nullable().optional(),
});

const AssertionInput = z.object({
  content: z.string().min(1).max(2048),
});

const CreateBodySchema = z
  .object({
    title: z.string().min(3).max(200),
    module_id: z.string().uuid(),
    user_story_id: z.string().uuid(),
    acceptance_criterion_ids: z.array(z.string().uuid()).min(1).describe('≥1; all must belong to user_story_id.'),
    layer: z.enum(['UI', 'API', 'Unit']),
    tags: z.array(z.string()).max(10).optional(),
    steps: z.array(StepInput).min(1),
    assertions: z.array(AssertionInput).optional(),
  })
  .openapi('AtcCreateBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/atcs',
  tags: ['ATCs'],
  summary: 'Create an ATC with steps and assertions',
  description: 'Bearer `atc:write` (or cookie session). Transactional create across atcs + steps + assertions + AC links. Validates that every acceptance criterion belongs to the user story and the module is the user story\'s module or a descendant in the same project. Emits an `atc.created` event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    201: { description: 'ATC created.', content: { 'application/json': { schema: z.object({ atc: AtcSchema }) } } },
    400: { description: 'Malformed body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'User story or module not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Slug collision (`slug_collision`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`steps_position_invalid`, `ac_outside_user_story`, `module_outside_project_subtree`, title/limits).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { AtcSchema };
