import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const RestoreResponseSchema = z
  .object({
    workspaceId: z.string().uuid(),
    workspaceName: z.string(),
  })
  .openapi('WorkspaceRestoreResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/restore',
  tags: ['Workspaces'],
  summary: 'Restore a workspace during its grace period',
  description:
    'Owner-only, session-only (BK-512, ADR-0015 point 10). Clears `deleted_at` on a soft-deleted workspace — no data movement. Reachable from the confirm-time deletion-receipt email even though the workspace is invisible via RLS while deleted, since the underlying RPC resolves ownership directly and bypasses RLS internally.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Workspace restored.',
      content: { 'application/json': { schema: RestoreResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller authenticated via a Personal Access Token, or is an active member but not the workspace Owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, already purged, or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The workspace is not currently deleted (`not_deleted`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
