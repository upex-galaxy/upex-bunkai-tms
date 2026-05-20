// OpenAPI registration for `DELETE /api/v1/tokens/{id}`. See sibling `route.ts`
// for the handler. Soft-revoke by setting `revoked_at = now()`. RLS enforces
// ownership — a forged id matches zero rows → 404.

import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

registry.registerPath({
  method: 'delete',
  path: '/api/v1/tokens/{id}',
  tags: ['Tokens'],
  summary: 'Revoke a personal access token',
  description:
    'Soft-delete: sets `revoked_at = now()` so the row stays in the audit trail. The bearer middleware rejects revoked rows.',
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Token id from `GET /api/v1/tokens`.' }),
    }),
  },
  responses: {
    204: { description: 'Token revoked.' },
    401: {
      description: 'Not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    404: {
      description: 'Token not found or already revoked.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
