import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const MeResponseSchema = z
  .object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email().nullable(),
      display_name: z.string().nullable().openapi({
        description: 'The display name the person saved in Settings > Account (BK-1949), or null when none is saved. Never a provider name or an email guess.',
      }),
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
    active_workspace_role: z.enum(['viewer', 'member', 'admin', 'owner']).nullable(),
    auth: z.object({
      source: z.enum(['cookie', 'bearer']),
      scopes: z.array(z.string()),
    }),
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
