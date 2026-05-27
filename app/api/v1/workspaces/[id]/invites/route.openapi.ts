import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const InviteSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['viewer', 'member', 'admin']),
    expires_at: z.string().datetime(),
    created_at: z.string().datetime(),
    accepted_at: z.string().datetime().nullable().optional(),
    revoked_at: z.string().datetime().nullable().optional(),
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
  })
  .openapi('WorkspaceInvite');

const CreateBodySchema = z
  .object({
    email: z.string().email().max(254),
    role: z.enum(['viewer', 'member', 'admin']).default('member'),
  })
  .openapi('WorkspaceInviteCreateBody');

const CreateResponseSchema = z
  .object({
    invite: InviteSchema,
    token: z.string().describe('Raw token. Returned exactly once.'),
    accept_url: z.string().url(),
    warning: z.string(),
  })
  .openapi('WorkspaceInviteCreateResponse');

const ListResponseSchema = z
  .object({ invites: z.array(InviteSchema) })
  .openapi('WorkspaceInviteListResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/invites',
  tags: ['Invites'],
  summary: 'Issue a workspace invite',
  description:
    'Admin/owner only. Generates a one-time token; returns the raw token + accept_url in the body. MVP does not send an email — share the URL out-of-band.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Invite created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not an admin/owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/invites',
  tags: ['Invites'],
  summary: 'List workspace invites',
  description: 'RLS limits results to admins/owners of the workspace.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Invite list.',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { InviteSchema };
