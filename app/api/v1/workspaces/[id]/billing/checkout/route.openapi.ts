import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const CheckoutBodySchema = z
  .object({
    seat_quantity: z
      .number()
      .int()
      .describe('Minimum is the workspace\'s current active_seats count (no seat-reduction path exists in this Story); maximum is the Cloud tier\'s seatLimit (25, see lib/billing/plan-tiers.ts).'),
  })
  .openapi('BillingCheckoutBody');

const CheckoutResponseSchema = z
  .object({
    url: z.string().url().describe('The Stripe-hosted Checkout URL to redirect the browser to. No card data ever reaches this app (Stripe Checkout, hosted — zero PCI scope).'),
  })
  .openapi('BillingCheckoutResponse');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description: 'Required. 8–128 chars, [a-zA-Z0-9_-]. A replay with the same key and payload returns the stored response; the same key with a different payload returns 409 `conflict`. This is the HTTP-level replay guard — distinct from the DB-level one-open-session-per-workspace guard that covers two different tabs/keys racing for the same workspace.',
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/checkout',
  tags: ['Billing'],
  summary: 'Start a self-serve Community -> Cloud upgrade',
  description: 'Owner-only (bunkai_is_workspace_owner) — an admin/member/viewer is rejected before any Stripe call. `Idempotency-Key` is REQUIRED (ADR-0002). Plan activation happens asynchronously via the Stripe webhook once payment is confirmed — this endpoint never writes `workspaces.plan` itself. At most one open Checkout Session may exist per workspace at a time (a partial unique index backs this); a second concurrent request either reuses the existing session\'s URL or answers 409.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, IdempotencyKeyParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CheckoutBodySchema } },
    },
  },
  responses: {
    200: { description: 'Checkout Session URL (freshly created, or replayed/reused).', content: { 'application/json': { schema: CheckoutResponseSchema } } },
    400: { description: 'Missing/malformed Idempotency-Key, or malformed workspace id (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: missing `workspace:admin` capability / PAT not bound to this workspace (ADR-0006); or the caller is not the workspace OWNER (`not_workspace_owner` — stricter than admin, checked inside the handler).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A checkout session is already open (`checkout_in_progress`) or an Idempotency-Key was reused with a different payload (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Workspace is already on Cloud/Enterprise (`plan_not_upgradable`), or `seat_quantity` is out of bounds (`seat_quantity_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'Stripe is not configured for this environment (`payment_processor_unavailable`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { CheckoutBodySchema, CheckoutResponseSchema };
