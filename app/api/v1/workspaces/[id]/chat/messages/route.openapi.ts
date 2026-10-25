import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-215 — workspace general channel: message list + send.

const ChatMessageSchema = z
  .object({
    id: z.string().uuid(),
    seq: z.number().int().describe('Monotonic total order across the workspace channel. The only ordering and pagination key.'),
    channel_id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    author_user_id: z.string().uuid().nullable().describe('null once the author account is deleted.'),
    author_name: z.string().describe('Display name derived from the author\'s email; "Former member" when unknown.'),
    body: z.string().max(4000).describe('1..4000 characters; empty only on a tombstone.'),
    created_at: z.string().datetime({ offset: true }),
    edited_at: z.string().datetime({ offset: true }).nullable().optional().describe('Set once the author edited the message (BK-219).'),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional().describe('Set on a tombstone; `body` is then empty. Author and moderator deletions are indistinguishable.'),
  })
  .openapi('ChatMessage');

const ChatMessagesPageSchema = z
  .object({
    channel_id: z.string().uuid(),
    items: z.array(ChatMessageSchema).describe('Ascending by `seq` (oldest first, newest last).'),
    has_more: z.boolean().describe('More older messages exist (default / `before_seq`), or more newer ones beyond the 200 catch-up cap (`after_seq`).'),
  })
  .openapi('ChatMessagesPage');

const SendChatMessageBodySchema = z
  .object({ body: z.string().describe('1..4000 characters after trimming; empty or whitespace-only is rejected.') })
  .openapi('SendChatMessageBody');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/chat/messages',
  tags: ['Chat'],
  summary: 'List messages of the workspace general channel',
  description: 'Cookie session or Bearer PAT, no scope: visibility is active workspace membership (RLS). Default returns the newest `limit` messages; `before_seq` pages back through history; `after_seq` returns everything newer (reconnect catch-up, capped at 200). `before_seq` and `after_seq` are mutually exclusive.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    WorkspaceIdParam,
    { name: 'limit', in: 'query' as const, required: false, schema: { type: 'integer' as const, minimum: 1, maximum: 100, default: 30 } },
    { name: 'before_seq', in: 'query' as const, required: false, schema: { type: 'integer' as const, minimum: 1 } },
    { name: 'after_seq', in: 'query' as const, required: false, schema: { type: 'integer' as const, minimum: 0 } },
  ],
  responses: {
    200: { description: 'A page of messages.', content: { 'application/json': { schema: ChatMessagesPageSchema } } },
    400: { description: 'Workspace id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Invalid `limit` / `before_seq` / `after_seq`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/chat/messages',
  tags: ['Chat'],
  summary: 'Send a message to the workspace general channel',
  description: 'Members, admins and owners can write; viewers are read-only (403, reason `viewer_read_only`). The body is trimmed and must be 1..4000 characters.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  request: { body: { required: true, content: { 'application/json': { schema: SendChatMessageBodySchema } } } },
  responses: {
    201: { description: 'The created message.', content: { 'application/json': { schema: ChatMessageSchema } } },
    400: { description: 'Malformed JSON or workspace id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller has the viewer role (`viewer_read_only`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty (`message_empty`) or over-long (`message_too_long`) body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

const EditChatMessageBodySchema = z
  .object({ body: z.string().describe('New text, 1..4000 characters after trimming.') })
  .openapi('EditChatMessageBody');

const MessageIdParam = {
  name: 'messageId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{id}/chat/messages/{messageId}',
  tags: ['Chat'],
  summary: 'Edit my own message',
  description: 'Author only, live message only, within 15 minutes of sending (BK-219). Sets `edited_at`. Admins cannot edit others\' messages.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, MessageIdParam],
  request: { body: { required: true, content: { 'application/json': { schema: EditChatMessageBodySchema } } } },
  responses: {
    200: { description: 'The edited message.', content: { 'application/json': { schema: ChatMessageSchema } } },
    400: { description: 'Malformed JSON or id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not the author (`not_author`), read-only role (`viewer_read_only`) or window closed (`edit_window_closed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Message not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The message was already deleted (`message_deleted`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty or over-long body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/chat/messages/{messageId}',
  tags: ['Chat'],
  summary: 'Delete a message (own, or any as admin/owner)',
  description: 'Replaces the message with a tombstone (body scrubbed, `deleted_at` set). The author may delete at any time; admins and owners may moderate any message. Idempotent. The tombstone never reveals who deleted it.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, MessageIdParam],
  responses: {
    200: { description: 'The tombstone.', content: { 'application/json': { schema: ChatMessageSchema } } },
    400: { description: 'Id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not the author and not an admin/owner (`not_allowed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Message not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ChatMessageSchema, ChatMessagesPageSchema };
