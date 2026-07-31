import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const LeaveResponseSchema = z
  .object({
    newActiveWorkspaceId: z.string().uuid().nullable(),
    newActiveWorkspaceName: z.string().nullable(),
  })
  .openapi('WorkspaceLeaveResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/membership',
  tags: ['Workspaces'],
  summary: 'Leave a workspace',
  description:
    'Removes the caller\'s own active membership row. Session-only — Personal Access Tokens cannot leave a workspace. Blocked server-side when the caller has no other active membership, or is the workspace\'s only active owner. On success, the caller\'s workspace-scoped PATs for the left workspace are revoked. If the left workspace was the caller\'s active one, the response carries the newly re-resolved active workspace (oldest remaining membership first) and the `bk_active_ws` cookie is rotated in the same response.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Left the workspace.',
      content: { 'application/json': { schema: LeaveResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller authenticated via a Personal Access Token.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Caller has no other active membership (`last_membership`), or is the workspace\'s only active owner (`sole_owner`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
