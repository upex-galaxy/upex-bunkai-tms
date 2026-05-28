import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'qa.user@example.com' }),
    password: z.string().min(6).max(128),
    pat_name: z.string().min(1).max(80).optional(),
    pat_scopes: z.array(z.enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])).optional(),
    pat_expires_in_days: z.number().int().positive().max(365).optional(),
  })
  .openapi('SigninBody');

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
  .openapi('SigninResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/signin',
  tags: ['Auth'],
  summary: 'Headless password sign-in + auto-minted PAT',
  description:
    'Password sign-in for CLI / agent callers. Returns the Supabase session AND a freshly-minted Bearer PAT in a single response so the caller can immediately authenticate subsequent requests without a browser.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Authenticated.', content: { 'application/json': { schema: ResponseSchema } } },
    401: { description: 'Invalid credentials.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
