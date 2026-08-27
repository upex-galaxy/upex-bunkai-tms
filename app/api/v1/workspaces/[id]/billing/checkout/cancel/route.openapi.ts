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
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing `workspace:admin` capability / PAT not bound to this workspace (ADR-0006).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
