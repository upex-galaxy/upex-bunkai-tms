import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const MarkAllNotificationsReadResponseSchema = z
  .object({
    updated_count: z.number().int().describe('How many previously-unread notifications were just marked read. 0 is a valid, successful result (e.g. a repeat call, or an already-empty inbox) — never an error.'),
  })
  .openapi('MarkAllNotificationsReadResponse');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/notifications/read-all',
  tags: ['Notifications'],
  summary: 'Mark every visible unread notification read, for one workspace',
  description: 'Marks all of the caller\'s own unread notifications in one workspace read. Plain RLS-scoped bulk update, no RPC — `notifications_update_recipient_member` (migration 0053_notifications.sql) is the entire authorization surface. Scoped to exactly ONE workspace (the path `id`) — never cross-workspace, per the PO-ratified business rule. Idempotent: a repeat call updates zero rows and still returns 200 with `updated_count: 0`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'Every visible unread notification in this workspace is now marked read.', content: { 'application/json': { schema: MarkAllNotificationsReadResponseSchema } } },
    400: { description: 'The workspace id is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { MarkAllNotificationsReadResponseSchema };
