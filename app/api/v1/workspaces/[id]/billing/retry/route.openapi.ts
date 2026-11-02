import { errorResponse, IdempotencyKeyParam, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const RetryResultSchema = z
  .object({ status: z.literal('recovered').describe('Returned only after the payment processor confirmed the payment.') })
  .openapi('BillingRetryResult');

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/retry',
  tags: ['Billing'],
  summary: 'Retry a failed renewal',
  description: 'Owner-only. Available only while a renewal is failed AND a replacement payment method was confirmed after the failure. Pays the failed invoice with the customer\'s default method. Success is reported only from the provider\'s `paid` answer; a decline, a required action or a timeout leaves the failed state, the grace end date and the retry path exactly as they were, and the workspace is never marked paid. If a timed-out charge actually went through, the `invoice.paid` webhook reconciles it. A double submit is stopped by an atomic claim (`retry_in_progress`) and by `Idempotency-Key`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  responses: {
    200: { description: 'The renewal was paid.', content: { 'application/json': { schema: RetryResultSchema } } },
    400: errorResponse('Malformed workspace id or Idempotency-Key.'),
    401: errorResponse('Not signed in.'),
    402: errorResponse('The payment was declined or needs a further action from the card issuer (`payment_declined`, `details.reason`: `card_declined` | `requires_action`). Nothing changed; the retry stays available.'),
    403: errorResponse('Missing `workspace:admin`, wrong workspace, or not the OWNER (`details.reason: not_workspace_owner`).'),
    409: errorResponse('No paid subscription (`no_active_subscription`), or the retry is not available (`retry_not_available`, `details.reason`: `no_failed_renewal` | `payment_method_not_replaced` | `retry_in_progress` | `invoice_not_payable`).'),
    502: errorResponse('The payment could not be confirmed (`upstream_error`). The state is unchanged; try again or wait for the webhook.'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`).'),
  },
});

export { RetryResultSchema };
