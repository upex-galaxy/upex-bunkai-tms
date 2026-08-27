import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({ workspace_id: z.string().uuid() })
  .openapi('ActiveWorkspaceBody');

const ResponseSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    role: z.string().nullable(),
  })
  .openapi('ActiveWorkspaceResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/me/active-workspace',
  tags: ['Identity'],
  summary: 'Set the active workspace for the current session',
  description: 'Validates membership, then sets the `bk_active_ws` httpOnly cookie. Supabase JWT is untouched.',
  // Session-only route (`auth: 'cookie-only'` in the sibling `route.ts`). A
  // Bearer PAT is rejected by the gateway with 403 before the body runs, so
  // `bearerAuth` is deliberately NOT offered here — advertising it would hand
  // generated clients and Scalar's "Try it" a method that always fails.
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Cookie set.', content: { 'application/json': { schema: ResponseSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: {
      description: 'Caller is not a member of the target workspace, or is a Personal Access Token — PATs have no switchable active workspace and must pass `workspace_id` explicitly per request (BK-316).',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
