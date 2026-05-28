import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
    password: z.string().min(6).max(128),
    pat_name: z.string().min(1).max(80).optional(),
    pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
    pat_expires_in_days: z.number().int().positive().max(365).optional(),
  })
  .openapi('SignupBody');

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
  .openapi('SignupResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/signup',
  tags: ['Auth'],
  summary: 'Headless sign-up + auto-minted PAT',
  description:
    'Provisions a user via the Supabase admin API with `email_confirm: true` so no email click is required, then signs them in and mints a PAT. Intended for QA / CLI environments — production sign-up should still use the magic-link path.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    201: { description: 'User created + signed in.', content: { 'application/json': { schema: ResponseSchema } } },
    409: { description: 'Email already exists.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
