import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-1899 — archive and restore share one answer shape: a repeat is a success, and
// `changed` says whether anything happened (the BK-571 ATC vocabulary).
export const MilestoneArchiveStateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    archived_at: z.string().datetime({ offset: true }).nullable().describe('When the Milestone was archived. Null once it is active again.'),
    archived_by: z.string().uuid().nullable().describe('Who archived it. Null once it is active again.'),
    changed: z.boolean().describe('False when the call changed nothing: the Milestone was already in the state the call asks for.'),
  })
  .openapi('MilestoneArchiveState');

export const MilestoneArchiveResponseSchema = z
  .object({ milestone: MilestoneArchiveStateSchema })
  .openapi('MilestoneArchiveResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/milestones/{id}/archive',
  tags: ['Milestones'],
  summary: 'Archive a milestone',
  description: 'Bearer `atc:write` (or cookie session). Member-only (role >= member). Hides the Milestone from the default list (`GET /api/v1/projects/{id}/milestones` returns it only with `include_archived=true`) and makes it read-only: edit, attach and detach answer 409 `milestone_archived` until it is restored. Its name stays reserved. Nothing the Milestone groups changes: its Test Plans, their Tests and Runs are untouched, and a Run in progress keeps running. One `milestone.archived` Activity Stream event per real change; archiving an archived Milestone is a 200 with `changed: false` and no event. Non-members receive a non-disclosing 404; a member with only the viewer role receives 403.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The Milestone to archive.',
  }],
  responses: {
    200: { description: 'Archived, or already archived.', content: { 'application/json': { schema: MilestoneArchiveResponseSchema } } },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a viewer of the owning workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Milestone not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
