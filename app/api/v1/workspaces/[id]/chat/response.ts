import type { ChatMember, ChatMessage, ChatRole } from '@lib/chat/messages';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import {
  CHAT_CATCH_UP_LIMIT,
  CHAT_MAX_PAGE_SIZE,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_PAGE_SIZE,
  displayNameFromEmail,
  validateMessageBody,

} from '@lib/chat/messages';
import { chatDeleteMessage, chatEditMessage, chatResolveAuthors, chatRoster } from '@lib/supabase/rpc';

// BK-215 — DB-parametrized logic for the workspace general chat routes
// (`GET/POST .../chat/messages`, `GET .../chat/roster`), split out of the
// route files so every branch is unit-testable with a fake `db`, the same
// pattern as notifications/response.ts. Everything here runs on the CALLER'S
// RLS-scoped client (migration 0104): visibility = active membership, write =
// member/admin/owner. A foreign or inaccessible workspace collapses into the
// same 404 as a missing one (non-disclosure).

export interface ChatMessageItem extends ChatMessage {
  author_name: string
}

export interface ChatMessagesPage {
  channel_id: string
  items: ChatMessageItem[]
  has_more: boolean
}

export interface ListMessagesParams {
  workspaceId: string
  limit: number
  beforeSeq?: number
  afterSeq?: number
}

const MESSAGE_COLUMNS = 'id, seq, channel_id, workspace_id, author_user_id, body, created_at, edited_at, deleted_at';

export function parseIntParam(raw: string | null, name: string, bounds: { min: number, max: number }): number | undefined {
  if (raw === null || raw === '') { return undefined; }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) {
    throw new ApiError('validation_failed', `\`${name}\` must be an integer between ${bounds.min} and ${bounds.max}.`);
  }
  return n;
}

export function parseListParams(workspaceId: string, searchParams: URLSearchParams): ListMessagesParams {
  const limit = parseIntParam(searchParams.get('limit'), 'limit', { min: 1, max: CHAT_MAX_PAGE_SIZE }) ?? CHAT_PAGE_SIZE;
  const beforeSeq = parseIntParam(searchParams.get('before_seq'), 'before_seq', { min: 1, max: Number.MAX_SAFE_INTEGER });
  const afterSeq = parseIntParam(searchParams.get('after_seq'), 'after_seq', { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (beforeSeq !== undefined && afterSeq !== undefined) {
    throw new ApiError('validation_failed', 'Use either `before_seq` or `after_seq`, not both.');
  }
  return { workspaceId, limit, beforeSeq, afterSeq };
}

async function resolveGeneralChannelId(db: SupabaseClient<Database>, workspaceId: string): Promise<string> {
  const { data, error } = await db
    .from('chat_channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'general')
    .maybeSingle();
  if (error) { throw new ApiError('internal_error', error.message); }
  if (!data) { throw new ApiError('not_found', 'Workspace not found or you are not an active member.'); }
  return data.id;
}

async function attachAuthors(
  db: SupabaseClient<Database>,
  workspaceId: string,
  rows: ChatMessage[],
): Promise<ChatMessageItem[]> {
  const ids = [...new Set(rows.map(r => r.author_user_id).filter((x): x is string => x !== null))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await chatResolveAuthors(db, { workspaceId, userIds: ids });
    if (error) { throw new ApiError('internal_error', error.message); }
    for (const row of data ?? []) { names.set(row.user_id, displayNameFromEmail(row.email)); }
  }
  return rows.map(r => ({
    ...r,
    author_name: r.author_user_id ? (names.get(r.author_user_id) ?? 'Former member') : 'Former member',
  }));
}

// Default / `before_seq`: the newest `limit` messages (older than the cursor),
// returned ascending so the client can prepend. `after_seq`: everything newer
// than the cursor, ascending, capped (reconnect catch-up).
export async function fetchMessagesPage(db: SupabaseClient<Database>, params: ListMessagesParams): Promise<ChatMessagesPage> {
  const channelId = await resolveGeneralChannelId(db, params.workspaceId);

  if (params.afterSeq !== undefined) {
    const { data, error } = await db
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('channel_id', channelId)
      .gt('seq', params.afterSeq)
      .order('seq', { ascending: true })
      .limit(CHAT_CATCH_UP_LIMIT + 1);
    if (error) { throw new ApiError('internal_error', error.message); }
    const rows = (data ?? []) as ChatMessage[];
    const hasMore = rows.length > CHAT_CATCH_UP_LIMIT;
    const page = hasMore ? rows.slice(0, CHAT_CATCH_UP_LIMIT) : rows;
    return { channel_id: channelId, items: await attachAuthors(db, params.workspaceId, page), has_more: hasMore };
  }

  let query = db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('channel_id', channelId);
  if (params.beforeSeq !== undefined) { query = query.lt('seq', params.beforeSeq); }
  const { data, error } = await query.order('seq', { ascending: false }).limit(params.limit + 1);
  if (error) { throw new ApiError('internal_error', error.message); }
  const rows = (data ?? []) as ChatMessage[];
  const hasMore = rows.length > params.limit;
  const page = (hasMore ? rows.slice(0, params.limit) : rows).reverse();
  return { channel_id: channelId, items: await attachAuthors(db, params.workspaceId, page), has_more: hasMore };
}

export async function postMessage(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, userId: string, rawBody: unknown },
): Promise<ChatMessageItem> {
  const validated = validateMessageBody(params.rawBody);
  if (!validated.ok) {
    throw new ApiError(
      'validation_failed',
      validated.reason === 'empty'
        ? 'A message cannot be empty.'
        : `A message can be at most ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
      { details: { reason: validated.reason === 'empty' ? 'message_empty' : 'message_too_long' } },
    );
  }

  const channelId = await resolveGeneralChannelId(db, params.workspaceId);

  // Friendly read-only answer for viewers. RLS (bunkai_can_write_workspace)
  // is the actual gate; this only turns its generic denial into the product
  // copy. A role-change race falls through to the insert-error mapping below.
  const { data: membership } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .maybeSingle();
  if ((membership?.role as ChatRole | undefined) === 'viewer') {
    throw new ApiError('forbidden', 'Viewers have read-only access to chat.', { details: { reason: 'viewer_read_only' } });
  }

  const { data, error } = await db
    .from('chat_messages')
    .insert({
      channel_id: channelId,
      workspace_id: params.workspaceId,
      author_user_id: params.userId,
      body: validated.body,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    if (error.code === '42501') {
      throw new ApiError('forbidden', 'Viewers have read-only access to chat.', { details: { reason: 'viewer_read_only' } });
    }
    throw new ApiError('internal_error', error.message);
  }

  const [item] = await attachAuthors(db, params.workspaceId, [data as ChatMessage]);
  return item;
}

export async function fetchRoster(db: SupabaseClient<Database>, workspaceId: string): Promise<ChatMember[]> {
  const { data, error } = await chatRoster(db, { workspaceId });
  if (error) {
    if (error.code === '42501') {
      throw new ApiError('not_found', 'Workspace not found or you are not an active member.');
    }
    throw new ApiError('internal_error', error.message);
  }
  return (data ?? []).map(r => ({
    user_id: r.user_id,
    email: r.email,
    display_name: displayNameFromEmail(r.email),
    role: r.role as ChatRole,
  }));
}

// BK-219 — edit / delete. Both run through SECURITY DEFINER RPCs (migration
// 0105) that assert ownership / role / the 15-minute window; here we only map
// their coded errors to the API envelope.
const RPC_ERRORS: Record<string, { code: 'not_found' | 'forbidden' | 'conflict' | 'validation_failed', message: string, reason?: string }> = {
  message_not_found: { code: 'not_found', message: 'Message not found.' },
  not_author: { code: 'forbidden', message: 'You can only edit your own messages.', reason: 'not_author' },
  not_allowed: { code: 'forbidden', message: 'You can only delete your own messages.', reason: 'not_allowed' },
  read_only: { code: 'forbidden', message: 'Viewers have read-only access to chat.', reason: 'viewer_read_only' },
  message_deleted: { code: 'conflict', message: 'This message was deleted.', reason: 'message_deleted' },
  edit_window_closed: { code: 'forbidden', message: 'Messages can be edited for 15 minutes after sending.', reason: 'edit_window_closed' },
  invalid_body: { code: 'validation_failed', message: 'A message must be 1 to 4000 characters.', reason: 'invalid_body' },
};

function mapRpcError(error: { message: string }): never {
  const mapped = RPC_ERRORS[error.message];
  if (!mapped) { throw new ApiError('internal_error', error.message); }
  throw new ApiError(mapped.code, mapped.message, mapped.reason ? { details: { reason: mapped.reason } } : undefined);
}

export async function editMessage(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, messageId: string, rawBody: unknown },
): Promise<ChatMessageItem> {
  const validated = validateMessageBody(params.rawBody);
  if (!validated.ok) {
    throw new ApiError(
      'validation_failed',
      validated.reason === 'empty'
        ? 'A message cannot be empty.'
        : `A message can be at most ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
      { details: { reason: validated.reason === 'empty' ? 'message_empty' : 'message_too_long' } },
    );
  }
  const { data, error } = await chatEditMessage(db, { messageId: params.messageId, body: validated.body });
  if (error) { mapRpcError(error); }
  return withAuthor(db, params.workspaceId, data);
}

export async function deleteMessage(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, messageId: string },
): Promise<ChatMessageItem> {
  const { data, error } = await chatDeleteMessage(db, { messageId: params.messageId });
  if (error) { mapRpcError(error); }
  return withAuthor(db, params.workspaceId, data);
}

async function withAuthor(
  db: SupabaseClient<Database>,
  workspaceId: string,
  data: unknown,
): Promise<ChatMessageItem> {
  const row = (Array.isArray(data) ? data[0] : data) as ChatMessage | undefined;
  // The RPC resolves the message across workspaces; a row from another
  // workspace than the URL's collapses into the same 404 as a missing one.
  if (!row || row.workspace_id !== workspaceId) { throw new ApiError('not_found', 'Message not found.'); }
  const [item] = await attachAuthors(db, workspaceId, [row]);
  return item;
}
