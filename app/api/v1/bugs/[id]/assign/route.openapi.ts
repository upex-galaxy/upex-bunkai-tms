import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { BugDetailSchema } from '../../route.openapi';

// BK-264 (Slice 2) — assign / reassign / unassign a bug. Reuses the composed
// Bug shape from POST /bugs (now carrying `assignee_user_id`). BK-337 widens
// the response to `BugDetailSchema` — `bunkai_assign_bug` RETURNS `bunkai_
// bug_json(...)` directly (0054), so this response now also carries `origin`
// + `module.archived_at`, exactly like POST /bugs and GET /bugs/{id}.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const AssignBodySchema = z
  .object({
    assignee_user_id: z
      .string()
      .uuid()
      .nullable()
      .describe('The workspace member to assign this bug to, or null to unassign. Must be an active, non-viewer member of the bug\'s own workspace.'),
  })
  .openapi('BugAssignBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/bugs/{id}/assign',
  tags: ['Bugs'],
  summary: 'Assign, reassign, or unassign a bug',
  description: 'Bearer `atc:write` (or cookie session); member+ write access. `bunkai_assign_bug` (migration 0054) is a no-op (no new activity row) when the requested assignee is already the current one. Emits `bug.assigned` / `bug.reassigned` / `bug.unassigned` depending on the prior state.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: AssignBodySchema } } } },
  responses: {
    200: { description: 'Bug assignment updated. Returns the updated Bug.', content: { 'application/json': { schema: z.object({ bug: BugDetailSchema }) } } },
    400: { description: 'Malformed id (not a UUID) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a workspace member without write access (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Bug not found — also returned for a caller who is not even a member of the bug\'s workspace (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — the requested assignee is not an active member of this workspace (`assignee_not_workspace_member`), or is a view-only member (`assignee_view_only`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
