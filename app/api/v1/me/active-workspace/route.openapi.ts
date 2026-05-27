import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({ workspace_id: z.string().uuid() })
  .openapi('ActiveWorkspaceBody');

const ResponseSchema = z
  .object({
    ok: z.literal(true),
    active_workspace_id: z.string().uuid(),
  })
  .openapi('ActiveWorkspaceResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/me/active-workspace',
  tags: ['Identity'],
  summary: 'Set the active workspace for the current session',
  description: 'Validates membership, then sets the `bk_active_ws` httpOnly cookie. Supabase JWT is untouched.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Cookie set.', content: { 'application/json': { schema: ResponseSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not a member of the target workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
