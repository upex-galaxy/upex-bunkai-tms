import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
    token: z.string().regex(/^\d{6,8}$/).openapi({ description: 'Numeric email OTP, 6 to 8 digits.', example: '12345678' }),
    type: z
      .enum(['signup', 'email'])
      .default('signup')
      .openapi({ description: 'OTP flow the token belongs to: signup (sign-up confirmation) or email (magic-link sign-in).', example: 'signup' }),
    pat_name: z.string().min(1).max(80).optional(),
    pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
    pat_expires_in_days: z.number().int().positive().max(365).optional(),
  })
  .openapi('ConfirmBody');

const ResponseSchema = z
  .object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email().nullable(),
    }),
    session: z.object({
      access_token: z.string(),
      refresh_token: z.string(),
      expires_at: z.number().optional(),
      token_type: z.string().optional(),
    }),
    pat: z.object({
      token: z.string(),
      id: z.string().uuid(),
      name: z.string().nullable(),
      scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])),
      expires_at: z.string().datetime().nullable(),
    }),
    warning: z.string(),
  })
  .openapi('ConfirmResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/confirm',
  tags: ['Auth'],
  summary: 'Verify email OTP → session + auto-minted PAT',
  description:
    'Verifies an email OTP (a 6-to-8-digit numeric code) for either a sign-up confirmation or a magic-link sign-in (`type`). On success it establishes the Supabase session AND mints a fresh Bearer PAT in a single response — the same shape as POST /api/v1/auth/signin — so the account can immediately authenticate subsequent requests.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Verified + authenticated.', content: { 'application/json': { schema: ResponseSchema } } },
    401: {
      description: 'Invalid or expired verification code.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Rate limited.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
