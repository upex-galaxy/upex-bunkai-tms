import { TestPlanSchema } from '@app/api/v1/projects/[id]/test-plans/route.openapi';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-202 — Test Plans: edit. No DELETE — ratified epic-wide (2026-08-14):
// there is no Delete for a Test Plan, ever; Close is the sole exit from Open
// and arrives with its own story. The domain ships default-deny on removal,
// the same precedent 0031_runs.sql set for project_environments and
// 0064_milestones.sql repeated.

const UpdateBodySchema = z
  .object({
    name: z.string().describe('1–100 chars after normalize. Unique per project, case-insensitive — re-validated on rename by the same database index that guards create.'),
    description: z.string().optional().describe('0–500 chars. Defaults to empty.'),
    goal: z.string().optional().describe('0–100 chars after normalize. Defaults to empty.'),
  })
  .openapi('TestPlanUpdateBody');

const UpdateResponseSchema = z
  .object({ test_plan: TestPlanSchema })
  .openapi('TestPlanUpdateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/test-plans/{id}',
  tags: ['Test Plans'],
  summary: 'Edit a test plan',
  description:
    'Member-only (role >= member), re-checked live server-side on every call. Same normalize/length rules as create, applied unconditionally to every field — renaming into an existing name in the same project returns 409 under the identical case-insensitive, whitespace-normalized rule that governs create; renaming a plan to the name it already holds is not a conflict. Editing is NOT restricted to the plan\'s creator: any member of the workspace may edit any plan in it. Non-members receive a non-disclosing 404; a member with only the viewer role receives 403. A plan that is no longer open cannot be edited.',
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
      description: 'Test plan updated.',
      content: { 'application/json': { schema: UpdateResponseSchema } },
    },
    400: { description: 'Malformed test plan id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or the caller is a viewer.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test plan not found (or not visible to the caller).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A test plan with this name already exists in the project, or the plan is no longer open.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name, description or goal length).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
