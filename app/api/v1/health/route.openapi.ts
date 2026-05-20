// OpenAPI registration for `GET /api/v1/health`. Lives in a sibling file so the
// generator script (`scripts/openapi-gen.ts`) can import it without dragging in
// Next.js / `server-only` modules from `route.ts`.
//
// Add new routes by:
//   1. Creating `route.openapi.ts` next to `route.ts`.
//   2. Importing it from `scripts/openapi-gen.ts`.

import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const HealthResponseSchema = z
  .object({
    ok: z.literal(true),
    service: z.string().openapi({ example: 'bunkai-tms' }),
    env: z.enum(['local', 'staging', 'production']),
    ts: z.string().datetime().openapi({ description: 'ISO 8601 timestamp of the probe.' }),
  })
  .openapi('HealthResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Returns service identity, current environment, and a server timestamp. Always public.',
  responses: {
    200: {
      description: 'Service is up.',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
    500: {
      description: 'Unhandled error.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
