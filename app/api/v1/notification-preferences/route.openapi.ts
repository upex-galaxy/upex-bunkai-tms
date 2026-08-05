import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const PreferenceCellSchema = z.object({
  event_type: z.string(),
  channel: z.enum(['in_app', 'email']),
  enabled: z.boolean(),
  locked: z.boolean(),
});

const ListPreferencesResponseSchema = z
  .object({ preferences: z.array(PreferenceCellSchema) })
  .openapi('NotificationPreferencesListResponse');

const PatchBodySchema = z
  .object({
    event_type: z.enum(['run_lifecycle', 'bug_lifecycle']),
    channel: z.enum(['in_app', 'email']),
    enabled: z.boolean(),
  })
  .openapi('NotificationPreferencePatchBody');

const PatchResponseSchema = z
  .object({
    preference: z.object({
      event_type: z.string(),
      channel: z.enum(['in_app', 'email']),
      enabled: z.boolean(),
      updated_at: z.string().datetime({ offset: true }),
    }),
  })
  .openapi('NotificationPreferencePatchResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1/notification-preferences',
  tags: ['Notifications'],
  summary: 'List my notification preferences',
  description: 'Returns the caller\'s own notification preferences grid (BK-213): 4 editable cells (`run_lifecycle` / `bug_lifecycle` x `in_app` / `email`, `enabled: true` when never touched) plus 2 structurally-locked `mentions` cells (`locked: true`, always `enabled: false`, immutable until Team Chat ships). Personal and GLOBAL — no workspace scoping.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: { description: 'The caller\'s preferences grid.', content: { 'application/json': { schema: ListPreferencesResponseSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/notification-preferences',
  tags: ['Notifications'],
  summary: 'Update one notification preference cell',
  description: 'Instant-save toggle for one (event_type, channel) cell — last-write-wins, no lock (QA Refinement Decision 2). `mentions` is deliberately excluded from `event_type` — a request naming it fails validation (`validation_failed`, 422), on top of migration 0062\'s own DB-level lock.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: PatchBodySchema } } },
  },
  responses: {
    200: { description: 'The cell is now persisted with this value.', content: { 'application/json': { schema: PatchResponseSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Invalid body — including an `event_type` of `mentions` (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ListPreferencesResponseSchema, PatchResponseSchema };
