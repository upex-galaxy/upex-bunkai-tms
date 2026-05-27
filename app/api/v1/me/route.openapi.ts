import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const MeResponseSchema = z
  .object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email().nullable(),
    }),
    workspaces: z.array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
        plan: z.enum(['community', 'cloud', 'enterprise']),
        owner_user_id: z.string().uuid(),
        created_at: z.string().datetime(),
      }),
    ),
    active_workspace_id: z.string().uuid().nullable(),
  })
  .openapi('MeResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1/me',
  tags: ['Identity'],
  summary: 'Introspect the authenticated principal',
  description: 'Returns the signed-in user, all workspaces they belong to, and the selected active workspace (driven by the bk_active_ws cookie).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Identity snapshot.',
      content: { 'application/json': { schema: MeResponseSchema } },
    },
    401: {
      description: 'Caller is not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
