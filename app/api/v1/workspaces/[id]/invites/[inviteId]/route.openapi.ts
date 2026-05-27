import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ResendResponseSchema = z
  .object({
    invite: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(['viewer', 'member', 'admin']),
      expires_at: z.string().datetime(),
      created_at: z.string().datetime(),
    }),
    token: z.string(),
    accept_url: z.string().url(),
    warning: z.string(),
  })
  .openapi('WorkspaceInviteResendResponse');

const DeleteResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi('WorkspaceInviteDeleteResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const InviteIdParam = {
  name: 'inviteId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/invites/{inviteId}',
  tags: ['Invites'],
  summary: 'Rotate (resend) a workspace invite token',
  description: 'Generates a new secret + extends expiry by 7 days. Clears any prior acceptance/revocation. Admin/owner only via RLS.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, InviteIdParam],
  responses: {
    200: { description: 'Rotated invite.', content: { 'application/json': { schema: ResendResponseSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Invite not found or no permission.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/invites/{inviteId}',
  tags: ['Invites'],
  summary: 'Revoke a workspace invite',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, InviteIdParam],
  responses: {
    200: { description: 'Revoked.', content: { 'application/json': { schema: DeleteResponseSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Invite not found or no permission.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
