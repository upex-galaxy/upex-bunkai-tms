import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-215 — workspace chat roster.

const ChatMemberSchema = z
  .object({
    user_id: z.string().uuid(),
    email: z.string(),
    display_name: z.string(),
    role: z.enum(['viewer', 'member', 'admin', 'owner']),
  })
  .openapi('ChatMember');

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/chat/roster',
  tags: ['Chat'],
  summary: 'List the active members of the workspace with their role',
  description: 'Cookie session or Bearer PAT, no scope. Presence is not part of this response: it is live Realtime Presence on the client.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' as const } }],
  responses: {
    200: { description: 'Active members, oldest membership first.', content: { 'application/json': { schema: z.object({ members: z.array(ChatMemberSchema) }) } } },
    400: { description: 'Workspace id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ChatMemberSchema };
