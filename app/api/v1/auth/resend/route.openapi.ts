import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
  })
  .openapi('ResendBody');

const ResponseSchema = z
  .object({
    status: z.literal('sent'),
    email: z.string().email(),
  })
  .openapi('ResendResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/resend',
  tags: ['Auth'],
  summary: 'Resend the sign-up email verification code',
  description:
    'Resends the 6-digit sign-up confirmation code for an account that is still pending verification. Takes only the email — no password — so it is safe to call from the verification screen without re-triggering account creation.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    202: {
      description: 'Resend accepted; a new verification code has been emailed.',
      content: { 'application/json': { schema: ResponseSchema } },
    },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Rate limited.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
