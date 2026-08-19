import { MilestoneSchema } from '@app/api/v1/projects/[id]/milestones/route.openapi';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-205 — Milestones: edit. No DELETE — deletion is out of scope for this
// story (out-of-scope.md); the milestone domain ships default-deny on
// removal, same precedent 0031_runs.sql set for project_environments.

const UpdateBodySchema = z
  .object({
    name: z.string().describe('1–100 chars after normalize. Unique per project, case-insensitive.'),
    target_date: z.string().describe('Calendar date (YYYY-MM-DD). Bounds (today-or-later, within 5 years) apply ONLY when this differs from the milestone\'s current stored value.'),
    description: z.string().optional().describe('0–500 chars. Defaults to empty.'),
  })
  .openapi('MilestoneUpdateBody');

const UpdateResponseSchema = z
  .object({ milestone: MilestoneSchema })
  .openapi('MilestoneUpdateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/milestones/{id}',
  tags: ['Milestones'],
  summary: 'Edit a milestone',
  description:
    'Member-only (role >= member). Same normalize/length rules as create. The target-date bounds (today-or-later, within 5 years) are enforced ONLY when the submitted date differs from the milestone\'s current stored value — an unchanged past-dated milestone stays editable (e.g. a description-only edit). Non-members receive a non-disclosing 404; a member with only the viewer role receives 403.',
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
      description: 'Milestone updated.',
      content: { 'application/json': { schema: UpdateResponseSchema } },
    },
    400: { description: 'Malformed milestone id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Milestone not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A milestone with this name already exists in the project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name/description length, or target date out of bounds when changed).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
