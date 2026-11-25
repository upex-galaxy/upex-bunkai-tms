import { errorResponse, IdempotencyKeyParam, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const ResubscribeResultSchema = z
  .object({
    status: z.literal('resumed'),
    renews_at: z.string().datetime().nullable().describe('When the subscription renews (UTC).'),
  })
  .openapi('BillingResubscribeResult');

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/subscription/resubscribe',
  tags: ['Billing'],
  summary: 'Revert a pending cancellation',
  description: 'Owner-only. Available only while a cancellation is pending and the paid period has not ended. Reverts the cancellation with no new charge for the period already paid. After the period ends, a new upgrade applies instead.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  responses: {
    200: { description: 'The cancellation is reverted.', content: { 'application/json': { schema: ResubscribeResultSchema } } },
    400: errorResponse('Malformed workspace id or Idempotency-Key.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Missing `workspace:admin`, wrong workspace, or not the OWNER (`details.reason: not_workspace_owner`).'),
    409: errorResponse('No paid Cloud subscription (`no_active_subscription`), or nothing to revert (`resubscribe_not_available`, `details.reason`: `no_pending_cancellation` | `period_ended`).'),
    502: errorResponse('The payment processor could not revert the cancellation (`upstream_error`). Nothing changed.'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`). Nothing changed.'),
  },
});

export { ResubscribeResultSchema };
