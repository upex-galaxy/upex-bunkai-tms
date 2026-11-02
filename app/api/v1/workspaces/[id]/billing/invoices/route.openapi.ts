import { errorResponse, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const InvoiceSchema = z
  .object({
    id: z.string().describe('Stable invoice identifier (the payment processor\'s invoice id).'),
    number: z.string().nullable(),
    status: z.enum(['paid', 'issued', 'failed']),
    period_start: z.string().datetime().nullable().describe('Start of the billed period (from the subscription line).'),
    period_end: z.string().datetime().nullable(),
    amount_cents: z.number().int().describe('Invoice total in the minor unit of `currency`.'),
    currency: z.string(),
    seat_quantity: z.number().int().nullable(),
    pdf_available: z.boolean(),
    created_at: z.string().datetime(),
  })
  .openapi('BillingInvoice');

const InvoiceListSchema = z
  .object({
    data: z.array(InvoiceSchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable().describe('Pass as `starting_after` to read the next page.'),
  })
  .openapi('BillingInvoiceList');

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/billing/invoices',
  tags: ['Billing'],
  summary: 'List the workspace\'s issued invoices',
  description: 'Owner and admin. Newest first. Drafts and voided invoices are not listed. The workspace -> customer mapping is read through the caller\'s RLS client; a member, a Community workspace and another workspace all answer the same 404. Invoices are read live from the payment processor (no local copy).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    WorkspaceIdParam,
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 24, default: 12 } },
    { name: 'starting_after', in: 'query', required: false, schema: { type: 'string' }, description: 'An invoice id from a previous `next_cursor`.' },
  ],
  responses: {
    200: { description: 'One page of invoices (an empty `data` array for a workspace with no invoice yet).', content: { 'application/json': { schema: InvoiceListSchema } } },
    400: errorResponse('Malformed workspace id, `limit` or `starting_after`.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Missing `atc:read`.'),
    404: errorResponse('Uniform `not_found` for any caller who may not read this workspace\'s billing.'),
    502: errorResponse('The payment processor failed (`upstream_error`).'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`).'),
  },
});

export { InvoiceListSchema, InvoiceSchema };
