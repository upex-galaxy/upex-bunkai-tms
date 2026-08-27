import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
    token: z.string().regex(/^\d{6,8}$/).openapi({ description: 'Numeric email OTP, 6 to 8 digits.', example: '12345678' }),
    pat_name: z.string().min(1).max(80).optional(),
    pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional().openapi({
      description:
        '`workspace:admin` is NOT accepted here and returns 403 `forbidden`, even though the enum lists it — the enum is the shared capability vocabulary, not the set this route grants. Headless auth carries no `workspace_id`, and an admin-scoped token must target one specific workspace, so the guard rejects the scope outright. Mint admin-scoped tokens through `POST /api/v1/tokens` with a `workspace_id` instead. Omit this field to get the defaults: `atc:read`, `atc:write`, `run:execute`. See ADR-0005.',
    }),
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
    'Completes a verification-first sign-up by verifying the email OTP (a 6-to-8-digit numeric code). On success it establishes the Supabase session AND mints a fresh Bearer PAT in a single response — the same shape as POST /api/v1/auth/signin — so a new account can immediately authenticate subsequent requests.',
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
    403: {
      description: '`pat_scopes` contained `workspace:admin`. The scope is schema-valid but rejected after parsing: headless auth has no `workspace_id` to bind an admin token to. Use `POST /api/v1/tokens` instead. See ADR-0005.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Rate limited.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
