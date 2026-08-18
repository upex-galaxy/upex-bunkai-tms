import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { BugDetailSchema } from '../../route.openapi';

// BK-264 (Slice 2) — advance a bug's status one lifecycle stage at a time.
// Reuses the composed Bug shape from POST /bugs. BK-337 widens the response
// to `BugDetailSchema` — `bunkai_transition_bug_status` RETURNS `bunkai_
// bug_json(...)` directly (0054), so this response now also carries `origin`
// + `module.archived_at`, exactly like POST /bugs and GET /bugs/{id}.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const StatusTransitionBodySchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  })
  .openapi('BugStatusTransitionBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/bugs/{id}/status',
  tags: ['Bugs'],
  summary: 'Advance a bug\'s status one lifecycle stage at a time',
  description: 'Bearer `atc:write` (or cookie session); member+ write access. `bunkai_transition_bug_status` (migration 0054) enforces the lifecycle order open -> in_progress -> resolved -> closed: exactly one stage forward per call, never backward, never skipping a stage. Emits `bug.status_changed` with the previous status, new status, and current assignee.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: StatusTransitionBodySchema } } } },
  responses: {
    200: { description: 'Bug status updated. Returns the updated Bug.', content: { 'application/json': { schema: z.object({ bug: BugDetailSchema }) } } },
    400: { description: 'Malformed id (not a UUID) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a workspace member without write access (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Bug not found — also returned for a caller who is not even a member of the bug\'s workspace (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — the target status skips a lifecycle stage (`status_transition_skipped`), or moves backward / stays the same (`status_transition_backward`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
