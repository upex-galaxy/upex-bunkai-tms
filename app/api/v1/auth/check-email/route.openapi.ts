import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
  })
  .openapi('CheckEmailBody');

const ResponseSchema = z
  .object({
    exists: z.boolean(),
    confirmed: z.boolean(),
  })
  .openapi('CheckEmailResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/check-email',
  tags: ['Auth'],
  summary: 'Email-first routing probe',
  description:
    'Returns whether an email is registered and whether it has been confirmed, so the login UI can route to the password, verify, or create step. Deliberately reveals existence (see ADR-0007 enumeration tradeoff); the real auth endpoints stay enumeration-safe.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Email status.', content: { 'application/json': { schema: ResponseSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Rate limited.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
