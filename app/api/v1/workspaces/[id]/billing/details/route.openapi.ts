import { errorResponse, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const BillingDetailsBodySchema = z
  .object({
    company_name: z.string().min(1).max(120),
    billing_email: z.string().email().max(254),
    address_line1: z.string().min(1).max(120),
    address_line2: z.string().max(120).nullable().optional(),
    city: z.string().min(1).max(80),
    region: z.string().max(80).nullable().optional(),
    postal_code: z.string().min(1).max(20),
    country: z.string().length(2).describe('ISO 3166-1 alpha-2, normalised to upper case.'),
  })
  .describe('The company billing profile. Every field is sent on each save (full replace). There is no tax id: VAT handling is out of scope.')
  .openapi('BillingDetailsBody');

const BillingDetailsSchema = BillingDetailsBodySchema.extend({
  address_line2: z.string().nullable(),
  region: z.string().nullable(),
  updated_at: z.string().datetime(),
}).openapi('BillingDetails');

registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{id}/billing/details',
  tags: ['Billing'],
  summary: 'Update the workspace\'s company billing details',
  description: 'Owner-only (`bunkai_is_workspace_owner`); the owner gate runs before the body is read. The details are pushed to the Stripe Customer first, which is what makes LATER invoices carry them: Stripe stops updating an invoice\'s customer name, email and address once it is finalized, so issued invoices are never changed. The stored profile is written only after Stripe accepted the update. A rejected body changes nothing.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  request: { body: { required: true, content: { 'application/json': { schema: BillingDetailsBodySchema } } } },
  responses: {
    200: { description: 'The saved details.', content: { 'application/json': { schema: BillingDetailsSchema } } },
    400: errorResponse('Malformed workspace id or a body that is not JSON (`bad_request`).'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The PAT lacks `workspace:admin` or is bound to another workspace, or the caller is not the workspace OWNER (`details.reason: not_workspace_owner`; the same answer for a workspace that does not exist).'),
    409: errorResponse('The workspace has no paid subscription (`no_active_subscription`).'),
    422: errorResponse('A field is missing, malformed or beyond its limit (`validation_failed`). Nothing was changed.'),
    502: errorResponse('The payment processor rejected the update (`upstream_error`). The stored profile is unchanged.'),
    503: errorResponse('The payment processor is not configured in this environment (`payment_processor_unavailable`).'),
  },
});

export { BillingDetailsBodySchema, BillingDetailsSchema };
