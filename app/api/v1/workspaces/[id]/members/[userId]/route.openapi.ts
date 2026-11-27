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

// BK-2542 — PATCH /api/v1/workspaces/{id}/members/{userId} (ADR-0022, migration 0144).

const AssignableRoleSchema = z.enum(['viewer', 'member', 'admin']);

const ChangeMemberRoleRequestSchema = z
  .object({
    role: AssignableRoleSchema.describe('The new role. `owner` is never accepted: the Owner role is neither granted nor taken away here.'),
  })
  .openapi('WorkspaceMemberRoleChangeRequest');

const ChangeMemberRoleResponseSchema = z
  .object({
    user_id: z.string().uuid(),
    previous_role: AssignableRoleSchema.describe('The role the teammate held when the change was written (after the row lock), which can differ from what the caller saw.'),
    role: AssignableRoleSchema,
    changed: z.boolean().describe('false when the teammate already held `role`: nothing was written and no activity event was recorded.'),
    unassigned_bug_count: z.number().int().describe('Bugs of this workspace that were assigned to the teammate and are now unassigned (only when the new role is viewer; each one records a bug.unassigned activity event).'),
  })
  .openapi('WorkspaceMemberRoleChangeResponse');

registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{id}/members/{userId}',
  tags: ['Members'],
  summary: 'Change a teammate\'s role',
  description: 'An Owner or Admin changes a teammate\'s role between viewer, member and admin, in one all-or-nothing act that writes a `member.role_changed` activity event. Becoming a viewer unassigns every Bug of the teammate in this workspace. Personal Access Tokens are not revoked: the current role decides what a token may do, from the next request. The ladder is the removal ladder (viewer < member < admin < owner): an Owner row is never changeable and nobody changes their own role. Refusals are checked in this order: role value (422 `invalid_member_role`), workspace visibility (404), caller role (403 `not_an_admin`), self (409 `cannot_change_own_role`), target membership, suspended included (404, the same body as the first 404), Owner target (403 `cannot_change_owner_role`). Asking for the current role answers 200 with `changed: false` after every check passes.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, { ...UserIdParam, description: 'The teammate whose role changes.' }],
  request: { body: { content: { 'application/json': { schema: ChangeMemberRoleRequestSchema } } } },
  responses: {
    200: { description: 'Changed, or already held (`changed: false`).', content: { 'application/json': { schema: ChangeMemberRoleResponseSchema } } },
    400: { description: 'A path id is not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: the caller is a Member or Viewer (`details.reason = not_an_admin`); the target is an Owner (`details.reason = cannot_change_owner_role`); the Bearer PAT lacks the `workspace:admin` capability, is not bound to any workspace, or is bound to a DIFFERENT workspace than `{id}` (ADR-0006, identical whether `{id}` exists or not).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'The workspace does not exist, is scheduled for deletion or is not visible to the caller, or the target is not an active member. Indistinguishable by design.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: '`details.reason = cannot_change_own_role`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: '`role` is missing or is not exactly one of viewer, member, admin (`details.reason = invalid_member_role`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
