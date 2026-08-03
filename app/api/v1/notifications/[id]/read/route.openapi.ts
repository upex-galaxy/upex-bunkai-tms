import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const MarkNotificationReadResponseSchema = z
  .object({
    notification: z.object({
      id: z.string().uuid(),
      read_at: z.string().datetime({ offset: true }).nullable(),
    }),
  })
  .openapi('MarkNotificationReadResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/notifications/{id}/read',
  tags: ['Notifications'],
  summary: 'Mark one notification read',
  description: 'Marks one of the caller\'s own notifications read. Plain RLS-scoped update, no RPC — `notifications_update_recipient_member` (migration 0053_notifications.sql) is the entire authorization surface, so a foreign id or another recipient\'s row is indistinguishable from a nonexistent one (404, non-disclosing). Idempotent: marking an already-read notification succeeds again rather than erroring.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The notification is now marked read.', content: { 'application/json': { schema: MarkNotificationReadResponseSchema } } },
    400: { description: 'The id is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Notification not found, not the caller\'s own, or the caller lost workspace membership (`not_found`, non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { MarkNotificationReadResponseSchema };
