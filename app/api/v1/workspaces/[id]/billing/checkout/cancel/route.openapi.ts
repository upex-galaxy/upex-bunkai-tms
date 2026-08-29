import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/billing/checkout/cancel',
  tags: ['Billing'],
  summary: 'Cancel the workspace\'s open checkout session',
  description: 'Owner-only. Expires the Stripe Checkout Session server-side (best-effort) and releases the one-open-session lock immediately, instead of stranding the owner for the session\'s TTL. A no-op (still 204) when there is no open session.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    204: { description: 'Canceled (or nothing to cancel).' },
    400: { description: 'Malformed workspace id (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: missing `workspace:admin` capability / PAT not bound to this workspace (ADR-0006); or the caller is not the workspace OWNER (`not_workspace_owner` — stricter than admin, checked inside the handler).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The open session has already been PAID and is being activated (`checkout_in_progress`, `details.reason: checkout_already_completed`). The row is deliberately left open so the Stripe webhook still applies the upgrade — retry the cancel only if the upgrade does not land.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'Stripe is not configured for this environment (`payment_processor_unavailable`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
