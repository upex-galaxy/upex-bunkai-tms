import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-209 (Slice 2: API) — the notification inbox's response contract.
// `payload` is a plain record (not a discriminated union like
// `ActivityItemSchema`): its shape is owned by the future producer stories
// (BK-211 run lifecycle, BK-212 bug lifecycle, BK-213/214), none of which
// land in this slice, so there is no per-`event_type` shape to model yet.

const NotificationItemSchema = z
  .object({
    id: z.string().uuid().describe('notifications row id — stable React key.'),
    workspace_id: z.string().uuid(),
    event_type: z.string().describe('Producer-defined event key (e.g. a future "run.finished"). Open text — no fixed enum yet in this slice.'),
    entity_type: z.string().describe('The kind of entity this notification is about (e.g. "run", "test", "bug").'),
    entity_id: z.string().uuid().nullable().describe('The target entity id, or null when the notification has no single target.'),
    payload: z.record(z.string(), z.unknown()).describe('Producer-defined snapshot captured at write time — shape is not yet fixed (no producer story lands in this slice).'),
    read_at: z.string().datetime({ offset: true }).nullable().describe('null = unread. Set once, via mark-one-read or mark-all-read.'),
    created_at: z.string().datetime({ offset: true }),
    entity_available: z.boolean().describe('false when the target entity was deleted, or is no longer visible to the caller (e.g. lost workspace/project access) — the client shows "This item is no longer available." instead of navigating. Always false for entity_type "bug" in this slice (no bug detail route exists yet).'),
  })
  .openapi('NotificationItem');

const NotificationsPageSchema = z
  .object({
    items: z.array(NotificationItemSchema).describe('The page, ordered newest first (created_at desc, id desc).'),
    unread_count: z.number().int().describe('Count of unread notifications visible to the caller in this workspace — independent of pagination, NOT capped here (the UI applies the "99+" display cap, business-rules.md).'),
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque token for the next (older) page, or null when this is the last page. base64url — echo it back verbatim as `?cursor=`; never construct or parse one.'),
  })
  .openapi('NotificationsPage');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 50, default: 30 },
  description: 'Page size, 1..50 (default 30). Out of range is rejected (422); the RPC additionally clamps for direct callers.',
};

const CursorParam = {
  name: 'cursor',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Opaque page token taken verbatim from the previous response\'s `next_cursor`. A malformed token returns 400 — it never silently falls back to the first page.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/notifications',
  tags: ['Notifications'],
  summary: 'List the caller\'s notification inbox for one workspace, newest first',
  description: 'Cookie session or Bearer PAT; no scope requirement — a personal read, not a `workspace:admin` operation. `bunkai_list_notifications` is SECURITY INVOKER — it runs under the caller\'s own RLS, so a foreign/inaccessible workspace id silently returns an empty page rather than leaking existence. Pagination is KEYSET on `(created_at desc, id desc)`. `unread_count` is independent of pagination. An empty `items` is always a valid 200 — this endpoint never answers 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, LimitParam, CursorParam],
  responses: {
    200: { description: 'One page of the notification inbox (possibly empty).', content: { 'application/json': { schema: NotificationsPageSchema } } },
    400: { description: 'An undecodable `cursor` (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — workspace id not a UUID, or `limit` outside 1..50 (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { NotificationItemSchema, NotificationsPageSchema };
