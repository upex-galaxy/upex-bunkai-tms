import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-572 — DELETE /api/v1/workspaces/{id}/members/{userId} (ADR-0022).

const RemoveMemberResponseSchema = z
  .object({
    removed_user_id: z.string().uuid(),
    removed_role: z.enum(['viewer', 'member', 'admin', 'owner']),
    revoked_token_count: z.number().int().describe('Personal Access Tokens scoped to this workspace that were revoked. Tokens not scoped to a workspace are never touched.'),
    unassigned_bug_count: z.number().int().describe('Bugs that were assigned to the removed teammate and are now unassigned (each one records a bug.unassigned activity event).'),
    revoked_invite_count: z.number().int().describe('Pending invites addressed to the removed teammate\'s email that were revoked.'),
  })
  .openapi('WorkspaceMemberRemoveResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const UserIdParam = {
  name: 'userId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The teammate to remove.',
};

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/members/{userId}',
  tags: ['Members'],
  summary: 'Remove a teammate from a workspace',
  description: 'An Owner or Admin ends a teammate\'s membership in one all-or-nothing act: the membership row is deleted, the teammate\'s Personal Access Tokens scoped to this workspace are revoked, pending invites addressed to their email are revoked, every Bug assigned to them becomes unassigned, and a `member.removed` activity event is written. Authorship is preserved. The ladder: a caller may remove a target whose role does not outrank theirs (viewer < member < admin < owner), never themselves (use `DELETE /api/v1/workspaces/{id}/membership` to leave). Refusals are checked in this order: workspace visibility (404), caller role (403 `not_a_member`), self (409 `cannot_remove_self`), target membership (404, the same body as the first 404), ladder (403 `cannot_remove_owner`). Re-inviting is the only reversal.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, UserIdParam],
  responses: {
    200: { description: 'Removed.', content: { 'application/json': { schema: RemoveMemberResponseSchema } } },
    400: { description: 'A path id is not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: the caller is a Member or Viewer (`details.reason = not_a_member`); an Admin targets an Owner (`details.reason = cannot_remove_owner`); the Bearer PAT lacks the `workspace:admin` capability, is not bound to any workspace, or is bound to a DIFFERENT workspace than `{id}` (ADR-0006, identical whether `{id}` exists or not).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'The workspace does not exist, is scheduled for deletion or is not visible to the caller, or the target is not an active member. Indistinguishable by design.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Either `details.reason = cannot_remove_self` (with `details.leave_endpoint`), or `details.reason = sole_owner` (a backstop: the workspace would be left with no Owner).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
