import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-206 — Milestones: attach Test Plans. Readiness has no read endpoint: the
// milestone pages read it server-side (ratified D1).

const AttachPlansBodySchema = z
  .object({
    test_plan_ids: z.array(z.string().uuid()).min(1).describe('At least one Test Plan id from the milestone\'s own project. A repeated id is attached once.'),
  })
  .openapi('MilestoneAttachPlansBody');

const AttachPlansResponseSchema = z
  .object({
    milestone_id: z.string().uuid(),
    attached_count: z.number().int().describe('Distinct plans attached by this call.'),
    plan_count: z.number().int().describe('Plans attached to the milestone after this call (at most 50).'),
  })
  .openapi('MilestoneAttachPlansResponse');

const ProjectIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'The project the milestone belongs to.',
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const MilestoneIdParam = {
  name: 'milestoneId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/milestones/{milestoneId}/plans',
  tags: ['Milestones'],
  summary: 'Attach test plans to a milestone',
  description: 'Member-only (role >= member), re-checked live server-side. Every submitted plan must belong to the milestone\'s own project; a plan of another project, of another workspace or an unknown id are all rejected uniformly (422 plan_outside_project) with no id disclosed back. A plan may serve several milestones. A selection containing a plan already attached to this milestone is rejected WHOLE (409 milestone_plan_exists). A milestone holds at most 50 plans (422 milestone_plan_limit). Requires an `Idempotency-Key` header: a replay of the same key and body answers the stored 201, and the database unique constraint is an independent backstop. Readiness is derived on view: the milestone page reflects the change on its next load.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [ProjectIdParam, MilestoneIdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AttachPlansBodySchema } },
    },
  },
  responses: {
    201: { description: 'Plans attached.', content: { 'application/json': { schema: AttachPlansResponseSchema } } },
    400: { description: 'Malformed id, invalid JSON body or a missing Idempotency-Key.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer (details.reason forbidden_role).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Milestone not found in this project (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A selected plan is already attached (details.reason milestone_plan_exists), or the Idempotency-Key was reused with a different body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty test_plan_ids, a plan outside the milestone\'s project (plan_outside_project), or more than 50 plans (milestone_plan_limit).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
