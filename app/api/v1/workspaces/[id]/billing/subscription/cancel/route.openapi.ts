import { errorResponse, IdempotencyKeyParam, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const CancelResultSchema = z
  .object({
    status: z.literal('cancel_scheduled'),
    ends_at: z.string().datetime().nullable().describe('The end of the period already paid (UTC). Cloud limits hold until then; the workspace then moves to Community.'),
  })
  .openapi('BillingCancelResult');

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/subscription/cancel',
  tags: ['Billing'],
  summary: 'Cancel the subscription at the end of the paid period',
  description: 'Owner-only. Schedules the cancellation at the end of the period already paid; access and limits are unchanged until then, and the owner can resubscribe before that date with no new charge. A second cancel answers the same end date without calling the payment processor again. A payment-processor failure leaves the subscription unchanged. The cancellation that actually schedules it (this call or the Stripe webhook, whichever applies it first) sends the active workspace owners one email naming the end date, after the response; a second cancel sends none, and a failed or unconfigured send never fails the cancellation.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  responses: {
    200: { description: 'The cancellation is scheduled.', content: { 'application/json': { schema: CancelResultSchema } } },
    400: errorResponse('Malformed workspace id or Idempotency-Key.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Missing `workspace:admin`, wrong workspace, or not the OWNER (`details.reason: not_workspace_owner`).'),
    409: errorResponse('No paid Cloud subscription (`no_active_subscription`), or an unpaid renewal must be resolved first (`plan_change_not_available`, `details.reason: payment_overdue`).'),
    502: errorResponse('The payment processor could not schedule the cancellation or did not confirm it (`upstream_error`). Nothing changed locally.'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`). Nothing changed.'),
  },
});

export { CancelResultSchema };
