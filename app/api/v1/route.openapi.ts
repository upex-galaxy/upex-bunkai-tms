// OpenAPI registration for `GET /api/v1`. Sibling of `route.ts` so the spec
// generator can import this without pulling in Next.js / `server-only`.

import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ApiVersionResponseSchema = z
  .object({
    version: z.literal('v1'),
    openapi: z.string().openapi({ example: '/api/openapi' }),
    docs: z.string().openapi({ example: '/api/docs' }),
    status: z.literal('live'),
  })
  .openapi('ApiVersionResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1',
  tags: ['Health'],
  summary: 'API version discovery',
  description:
    'Discovery endpoint that points clients (CLI, agents, browsers) at the OpenAPI spec and the Scalar docs UI. Public.',
  responses: {
    200: {
      description: 'API banner.',
      content: { 'application/json': { schema: ApiVersionResponseSchema } },
    },
    500: {
      description: 'Unhandled error.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
