import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
    password: z.string().min(8).max(128),
  })
  .openapi('SignupBody');

const ResponseSchema = z
  .object({
    status: z.literal('pending_confirmation'),
    email: z.string().email(),
  })
  .openapi('SignupResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/signup',
  tags: ['Auth'],
  summary: 'Sign up + send 6-digit email verification',
  description:
    'Registers an email + password account via the public sign-up path, which sends a 6-digit confirmation code by email. No session and no PAT are issued here — the account stays unconfirmed until the code is verified via POST /api/v1/auth/confirm.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    202: {
      description: 'Sign-up accepted; verification code emailed.',
      content: { 'application/json': { schema: ResponseSchema } },
    },
    409: { description: 'Email already exists.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Rate limited.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
