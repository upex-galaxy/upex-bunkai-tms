import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({ token: z.string().min(8).max(256) })
  .openapi('InviteAcceptBody');

const ResponseSchema = z
  .object({
    ok: z.literal(true),
    workspace_id: z.string().uuid(),
    role: z.enum(['viewer', 'member', 'admin']),
  })
  .openapi('InviteAcceptResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/invites/accept',
  tags: ['Invites'],
  summary: 'Redeem a workspace invite token',
  description:
    'Caller must be signed in. Caller email must match invite email. Adds membership in the invite\'s workspace + role; stamps acceptance on the invite.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Accepted.', content: { 'application/json': { schema: ResponseSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Invite email does not match caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Token invalid.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Invite already accepted / revoked / expired.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
