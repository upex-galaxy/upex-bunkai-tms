import { errorResponse, IdempotencyKeyParam, WorkspaceIdParam } from '@lib/billing/openapi-helpers';
import { registry, z } from '@lib/openapi/registry';

const ProjectRefSchema = z.object({ id: z.string().uuid(), name: z.string() });

const DowngradePreviewSchema = z
  .object({
    workspace_name: z.string(),
    current_plan: z.literal('cloud'),
    target_plan: z.literal('community'),
    projects: z.object({
      in_use: z.number().int(),
      limit: z.number().int(),
      read_only: z.array(ProjectRefSchema).describe('The projects that become read-only, oldest first (`created_at`, then `id`). Empty when the workspace is within the Community limit. Nothing is deleted.'),
    }),
    seats: z.object({
      in_use: z.number().int().describe('Active members only.'),
      limit: z.number().int(),
      over_limit: z.array(z.object({ user_id: z.string().uuid(), email: z.string().nullable() })).describe('The most recently joined non-owner members beyond the Community seat cap. Non-empty blocks the downgrade until the owner removes members.'),
    }),
    retention: z.object({
      current_days: z.number().int().nullable().describe('Age in days of the oldest run, or `null` with no runs.'),
      target_days: z.number().int().nullable().describe('The Community retention window. Older runs stay stored and viewable.'),
    }),
    blocked_reason: z.enum(['seats_over_limit', 'cancellation_pending', 'checkout_open', 'payment_overdue']).nullable().describe('Why the downgrade cannot be confirmed right now, or `null`.'),
    preview_token: z.string().describe('Fingerprint of every consequence shown (read-only projects, seats, retention). The confirm must send it back.'),
  })
  .openapi('BillingDowngradePreview');

const DowngradeBodySchema = z
  .object({
    target_plan: z.literal('community'),
    preview_token: z.string().describe('The `preview_token` of the preview the owner confirmed. When the live consequences differ, the answer is `downgrade_preview_stale`.'),
  })
  .openapi('BillingDowngradeRequest');

const DowngradeResultSchema = z
  .object({
    status: z.literal('downgraded'),
    plan: z.literal('community'),
    read_only_projects: z.array(ProjectRefSchema),
  })
  .openapi('BillingDowngradeResult');

const shared = {
  400: errorResponse('Malformed workspace id, body or Idempotency-Key.'),
  401: errorResponse('Not signed in.'),
  403: errorResponse('Missing `workspace:admin`, wrong workspace, or not the OWNER (`details.reason: not_workspace_owner`).'),
  409: errorResponse('No paid Cloud subscription (`no_active_subscription`).'),
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/billing/downgrade',
  tags: ['Billing'],
  summary: 'Preview a downgrade to Community',
  description: 'Owner-only. Lists exactly what a downgrade from Cloud to Community changes: the projects that become read-only (oldest first), members above the Community seat cap (which block the downgrade), and the retention window. Nothing is ever deleted. The preview is mandatory: the confirm must carry the `preview_token` returned here.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'The consequence preview.', content: { 'application/json': { schema: DowngradePreviewSchema } } },
    ...shared,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/downgrade',
  tags: ['Billing'],
  summary: 'Downgrade to Community now',
  description: 'Owner-only. Ends the Cloud subscription at once with no proration or refund, then moves the workspace to Community. Projects above the Community limit become read-only (oldest first) and stay fully viewable; nothing is deleted, and a re-upgrade restores editing. A payment-processor failure leaves the workspace unchanged.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  request: { body: { content: { 'application/json': { schema: DowngradeBodySchema } } } },
  responses: {
    200: { description: 'The workspace is on Community.', content: { 'application/json': { schema: DowngradeResultSchema } } },
    ...shared,
    409: errorResponse('No paid Cloud subscription (`no_active_subscription`); the downgrade is blocked (`plan_change_not_available`, `details.reason`: `seats_over_limit` | `cancellation_pending` | `checkout_open` | `payment_overdue`); or the consequences changed since the preview (`downgrade_preview_stale`, `details.preview` holds the fresh preview).'),
    422: errorResponse('The body failed validation (`validation_failed`).'),
    502: errorResponse('The payment processor could not end the subscription (`upstream_error`). Nothing changed.'),
    503: errorResponse('The payment processor is not configured (`payment_processor_unavailable`). Nothing changed.'),
  },
});

export { DowngradePreviewSchema, DowngradeResultSchema };
