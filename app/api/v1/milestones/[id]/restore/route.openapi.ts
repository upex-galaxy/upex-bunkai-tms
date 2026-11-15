import { MilestoneArchiveResponseSchema } from '@app/api/v1/milestones/[id]/archive/route.openapi';
import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

// BK-1899 — the restore half of the Milestone archive contract.
registry.registerPath({
  method: 'post',
  path: '/api/v1/milestones/{id}/restore',
  tags: ['Milestones'],
  summary: 'Restore an archived milestone',
  description: 'Bearer `atc:write` (or cookie session). Member-only (role >= member). Puts the Milestone back in the default list exactly as it was: name, target date, description and attached Test Plans. A past target date is kept as it is, never re-validated, and the name cannot collide because an archived Milestone keeps it reserved. One `milestone.restored` Activity Stream event per real change; restoring an active Milestone is a 200 with `changed: false` and no event. Non-members receive a non-disclosing 404; a member with only the viewer role receives 403.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The Milestone to restore.',
  }],
  responses: {
    200: { description: 'Restored, or already active.', content: { 'application/json': { schema: MilestoneArchiveResponseSchema } } },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a viewer of the owning workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Milestone not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
