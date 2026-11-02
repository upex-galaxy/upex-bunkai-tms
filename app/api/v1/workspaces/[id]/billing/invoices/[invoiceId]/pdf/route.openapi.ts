import { errorResponse, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry } from '@lib/openapi/registry';

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/billing/invoices/{invoiceId}/pdf',
  tags: ['Billing'],
  summary: 'Download one invoice as a PDF',
  description: 'Owner and admin. The invoice must belong to the workspace\'s customer: an invoice of another workspace and one that does not exist answer the same 404, so the endpoint never reveals which invoices exist. The file is proxied by this route (never a redirect to the provider URL) and is served only when the provider returned a real PDF. When it did not, the answer is a recoverable 409 `invoice_pdf_unavailable` and no file is downloaded; the invoice itself is unchanged.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, { name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
  responses: {
    200: { description: 'The invoice PDF.', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
    400: errorResponse('Malformed workspace id.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Missing `atc:read`.'),
    404: errorResponse('Uniform `not_found`: no billing access, unknown invoice, or an invoice of another workspace.'),
    409: errorResponse('The PDF is not available right now (`invoice_pdf_unavailable`, `details.retryable: true`).'),
    502: errorResponse('The payment processor failed (`upstream_error`).'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`).'),
  },
});
