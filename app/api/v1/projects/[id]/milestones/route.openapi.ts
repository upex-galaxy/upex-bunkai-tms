import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-205 — Milestones: list + create. A Milestone anchors a project's work to
// a named goal with a target date ("Release 2.4", 2026-08-15). Visible to
// every workspace member of the project; member+ can create.

const MilestoneSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string().describe('1–100 chars after normalize (internal whitespace collapsed, then trimmed). Unique per project, case-insensitive.'),
    target_date: z.string().describe('Calendar date (YYYY-MM-DD). Today or later at create; within 5 years of the write date.'),
    description: z.string().describe('0–500 chars.'),
    created_by: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('Milestone');

const ListResponseSchema = z
  .object({
    milestones: z.array(MilestoneSchema).describe('Ordered by target_date ascending, id ascending.'),
  })
  .openapi('MilestoneListResponse');

const CreateBodySchema = z
  .object({
    name: z.string().describe('1–100 chars after normalize. Unique per project, case-insensitive.'),
    target_date: z.string().describe('Calendar date (YYYY-MM-DD). Must be today or later, and within 5 years of today.'),
    description: z.string().optional().describe('0–500 chars. Defaults to empty.'),
  })
  .openapi('MilestoneCreateBody');

const CreateResponseSchema = z
  .object({ milestone: MilestoneSchema })
  .openapi('MilestoneCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/milestones',
  tags: ['Milestones'],
  summary: 'List a project\'s milestones',
  description:
    'Lists the project\'s milestones ordered by target date (ascending), id ascending as the tie-break. Visible to any workspace member; a non-member receives an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Milestones listed.',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/milestones',
  tags: ['Milestones'],
  summary: 'Create a milestone in a project',
  description:
    'Member-only (role >= member). Normalizes the name (collapses internal whitespace, then trims) and enforces 1–100 chars; description is capped at 500 chars. The target date must be today or later and within 5 years of the write date — both server UTC. The name is unique per project (case-insensitive, whitespace-normalized); a duplicate returns 409. Non-members return 403.',
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
      description: 'Milestone created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the project\'s workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A milestone with this name already exists in the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name/description length, or target date out of bounds).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { MilestoneSchema };
