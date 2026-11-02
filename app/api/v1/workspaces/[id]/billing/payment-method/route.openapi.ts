import { errorResponse, IdempotencyKeyParam, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const PaymentMethodSessionSchema = z
  .object({ url: z.string().url().describe('Stripe-hosted page where the new card is entered. The card number, expiry and CVC never reach this app.') })
  .openapi('BillingPaymentMethodSession');

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/payment-method',
  tags: ['Billing'],
  summary: 'Start replacing the workspace\'s payment method',
  description: 'Owner-only. Returns the URL of a Stripe Checkout page in `setup` mode (card only). The webhook records the outcome and makes the new method the default for the customer and the subscription, so the next renewal and a retry use it. Cancelling or a decline on the hosted page changes nothing: the active method stays active. `Idempotency-Key` is required.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  responses: {
    200: { description: 'The hosted setup URL (fresh or replayed).', content: { 'application/json': { schema: PaymentMethodSessionSchema } } },
    400: errorResponse('Malformed workspace id or Idempotency-Key.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Missing `workspace:admin`, wrong workspace, or not the OWNER (`details.reason: not_workspace_owner`).'),
    409: errorResponse('No paid subscription (`no_active_subscription`), or an Idempotency-Key reused with a different payload (`conflict`).'),
    502: errorResponse('The payment processor failed (`upstream_error`); use a NEW Idempotency-Key to retry.'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`).'),
  },
});

export { PaymentMethodSessionSchema };
