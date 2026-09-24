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
    403: { description: 'Any of: the PAT lacks the `workspace:admin` capability (`details.reason: missing_capability`); the PAT is not bound to this workspace (ADR-0006); or the caller is not the workspace OWNER (`details.reason: not_workspace_owner`, stricter than admin). A workspace that does not exist answers this same `not_workspace_owner` response (identical status and body), so the endpoint never discloses whether a workspace id exists. A PAT from headless sign-in never carries `workspace:admin` (ADR-0005): an owner automating checkout mints a workspace-scoped token via `POST /api/v1/tokens` with `workspace_id` set to this workspace and `scopes` including `workspace:admin`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace billing overview unavailable after the owner check passed (not reachable for a workspace the caller does not own, or one that does not exist: those answer 403 `not_workspace_owner`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A checkout session is already open (`checkout_in_progress`) or an Idempotency-Key was reused with a different payload (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Workspace is already on Cloud/Enterprise (`plan_not_upgradable`), or `seat_quantity` is out of bounds (`seat_quantity_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    502: { description: 'The payment processor rejected or failed the Checkout Session request (`upstream_error`). Generic client message; the upstream detail is logged server-side only.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'The payment processor is unavailable in this environment (`payment_processor_unavailable`). Generic client message; which configuration is missing is logged server-side only. Returned before any checkout session row is created.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { CheckoutBodySchema, CheckoutResponseSchema };
