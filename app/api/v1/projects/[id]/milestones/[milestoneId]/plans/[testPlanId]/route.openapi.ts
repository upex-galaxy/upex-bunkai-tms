import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

// BK-206 — Milestones: detach a Test Plan.

const pathParam = (name: string, description?: string) => ({
  name,
  in: 'path' as const,
  required: true,
  ...(description ? { description } : {}),
  schema: { type: 'string' as const, format: 'uuid' as const },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/projects/{id}/milestones/{milestoneId}/plans/{testPlanId}',
  tags: ['Milestones'],
  summary: 'Detach a test plan from a milestone',
  description: 'Member-only (role >= member), re-checked live server-side. Idempotent: detaching a plan that is not attached also answers 204. Detaching never changes the plan, its tests or its progress, and leaves the plan attached to any other milestone.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    pathParam('id', 'The project the milestone belongs to.'),
    pathParam('milestoneId'),
    pathParam('testPlanId'),
  ],
  responses: {
    204: { description: 'Detached, or was not attached.' },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer (details.reason forbidden_role).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Milestone not found in this project (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
