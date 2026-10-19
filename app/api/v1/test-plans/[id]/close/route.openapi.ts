import { TestPlanSchema } from '@app/api/v1/projects/[id]/test-plans/route.openapi';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-207 — Test Plans: close and reopen. Closing records a verdict, an optional
// summary and a frozen copy of the plan's progress, then makes the plan read-only.

const ClosedPlanSchema = TestPlanSchema.extend({
  progress_snapshot: z.record(z.string(), z.unknown()).nullable().describe('Progress at close time, stored verbatim from the plan-progress computation (counts, passed percentage, per-test outcomes). Null while open.'),
}).openapi('ClosedTestPlan');

const CloseBodySchema = z
  .object({
    verdict: z.enum(['passed', 'failed']).describe('Required. The final verdict of the cycle.'),
    summary: z.string().nullable().optional().describe('Optional plain-text outcome summary, at most 4000 characters after trimming. Blank or whitespace-only is stored as empty (null).'),
  })
  .openapi('TestPlanCloseBody');

const ResponseSchema = z
  .object({ test_plan: ClosedPlanSchema })
  .openapi('TestPlanClosureResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/test-plans/{id}/close',
  tags: ['Test Plans'],
  summary: 'Close a test plan',
  description:
    'Closes an open plan with a required verdict (passed or failed) and an optional outcome summary. Allowed for the plan\'s creator (while they still hold write access) and for workspace admins and owners, re-checked live on every call; a plain member who did not create the plan and a viewer receive 403. Verdict, summary, closer, close time and a frozen copy of the plan\'s progress are written together, and the plan becomes read-only: edits and membership changes return 409. Closing a plan that is not open returns 409; two simultaneous closes resolve to exactly one success and one 409. A missing verdict is 422 (verdict_required), a verdict outside passed / failed is 422 (verdict_invalid). Non-members receive a non-disclosing 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CloseBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Test plan closed.',
      content: { 'application/json': { schema: ResponseSchema } },
    },
    400: { description: 'Malformed test plan id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is neither the plan\'s creator nor an admin / owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The plan is already closed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Verdict missing or invalid, or summary longer than 4000 characters.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/test-plans/{id}/reopen',
  tags: ['Test Plans'],
  summary: 'Reopen a closed test plan',
  description:
    'Returns a closed plan to open. Same permission rule as close (creator or admin / owner). Verdict, summary, closer, close time and the progress snapshot are cleared so the plan returns fully open; the close and reopen entries remain in the plan\'s history. Reopening a plan that is open returns 409.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Test plan reopened.',
      content: { 'application/json': { schema: ResponseSchema } },
    },
    400: { description: 'Malformed test plan id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is neither the plan\'s creator nor an admin / owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The plan is already open.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
