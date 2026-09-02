import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { WorkspaceSchema } from '../route.openapi';

const PatchBodySchema = z
  .object({
    name: z.string().min(1).max(80).optional().openapi({
      description: 'New display name. The only mutable field today — slug rotation is post-MVP.',
    }),
  })
  .openapi('WorkspacePatchBody', {
    description:
      'At least one field is required. An empty object `{}` parses cleanly against this schema but is rejected by the handler with 400 `bad_request` ("Provide at least one field to update."), so the constraint is not visible in the schema itself.',
  });

const SingleResponseSchema = z
  .object({ workspace: WorkspaceSchema })
  .openapi('WorkspaceResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Get a single workspace',
  description: 'Bearer `atc:read` (or cookie session).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Workspace.',
      content: { 'application/json': { schema: SingleResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or not visible.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Update workspace metadata',
  description: 'Owner-only. Today only `name` is mutable; slug rotation is post-MVP.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: PatchBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated workspace.',
      content: { 'application/json': { schema: SingleResponseSchema } },
    },
    400: { description: 'The body was not valid JSON, the path `{id}` is not a UUID, or the body was an empty object `{}` — at least one updatable field is required (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: the Bearer PAT lacks the `workspace:admin` capability; the PAT is not bound to any workspace (there is no global admin — ADR-0005); the PAT is bound to a DIFFERENT workspace than `{id}`; or the caller is not an owner (RLS returns zero rows). The token-binding checks run before RLS, so a correctly-scoped RLS row does not rescue a mis-bound token. See ADR-0006.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

const DeleteResponseSchema = z
  .object({
    workspaceId: z.string().uuid(),
    workspaceName: z.string(),
    purgeDeadline: z.string(),
    otherMemberCount: z.number().int(),
    wasActiveWorkspace: z.boolean().openapi({
      description: 'Whether the deleted workspace was the caller\'s active one. `newActiveWorkspaceId`/`newActiveWorkspaceName` are only meaningful when this is true — they stay null when the deleted workspace was not active, which is not the same as "no workspace left" (AC-10).',
    }),
    newActiveWorkspaceId: z.string().uuid().nullable(),
    newActiveWorkspaceName: z.string().nullable(),
  })
  .openapi('WorkspaceDeleteResponse');

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Delete a workspace I own',
  description:
    'Owner-only, session-only (BK-512, ADR-0015). Soft-deletes the workspace: access ends immediately for the owner and every other member, the workspace\'s Personal Access Tokens and pending invites are revoked in the same transaction, and a deletion audit record is written. Nothing is physically removed until the 30-day grace period elapses, during which the workspace can be restored via `POST /api/v1/workspaces/{id}/restore`. A confirmation email naming the workspace, the actor and the restore deadline is sent to the owner and every active member. If the deleted workspace was the caller\'s active one, the response carries the newly re-resolved active workspace (oldest remaining membership first) and the `bk_active_ws` cookie is rotated in the same response.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Workspace deleted (soft-delete; grace period started).',
      content: { 'application/json': { schema: DeleteResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller authenticated via a Personal Access Token, or is an active member but not the workspace Owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, caller is not an active member, or the workspace was already deleted by a concurrent request (Scenario N5 — a double-submit\'s losing call is refused as not_found, matching the shipped `DELETE /api/v1/tokens/{id}` precedent, not a 409).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
