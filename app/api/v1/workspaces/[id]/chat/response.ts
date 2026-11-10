import type { ChatMention } from '@lib/chat/mentions';
import type { ChatMember, ChatMessage, ChatRole } from '@lib/chat/messages';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { MENTION_MAX_PER_MESSAGE } from '@lib/chat/mentions';
import {
  CHAT_CATCH_UP_LIMIT,
  CHAT_MAX_PAGE_SIZE,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_PAGE_SIZE,
  displayNameFromEmail,
  validateMessageBody,

} from '@lib/chat/messages';
import { chatDeleteMessage, chatEditMessage, chatResolveAuthors, chatRoster, chatSendMessage } from '@lib/supabase/rpc';

// BK-215 — DB-parametrized logic for the workspace general chat routes
// (`GET/POST .../chat/messages`, `GET .../chat/roster`), split out of the
// route files so every branch is unit-testable with a fake `db`, the same
// pattern as notifications/response.ts. Everything here runs on the CALLER'S
// RLS-scoped client (migration 0104): visibility = active membership, write =
// member/admin/owner. A foreign or inaccessible workspace collapses into the
// same 404 as a missing one (non-disclosure).

export interface ChatMessageItem extends ChatMessage {
  author_name: string
  // BK-217: members mentioned in the body (empty on a tombstone).
  mentions: ChatMention[]
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
  // BK-217: fetch exactly these messages (the client hydrates the mentions of a
  // Realtime row, whose payload is the bare table row). Exclusive with the
  // cursors.
  ids?: string[]
}

export const CHAT_MAX_IDS_PER_REQUEST = 20;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

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
  const rawIds = searchParams.get('ids');
  let ids: string[] | undefined;
  if (rawIds !== null && rawIds !== '') {
    if (beforeSeq !== undefined || afterSeq !== undefined) {
      throw new ApiError('validation_failed', 'Use `ids` on its own, without `before_seq` or `after_seq`.');
    }
    ids = [...new Set(rawIds.split(',').map(x => x.trim().toLowerCase()))];
    if (ids.length > CHAT_MAX_IDS_PER_REQUEST || ids.some(x => !UUID.test(x))) {
      throw new ApiError('validation_failed', `\`ids\` must be at most ${CHAT_MAX_IDS_PER_REQUEST} comma-separated UUIDs.`);
    }
  }
  return { workspaceId, limit, beforeSeq, afterSeq, ids };
}

// BK-217 — the optional `mentions` array of a send / edit body: member ids the
// author picked. Shape is validated here; whether each id is an ACTIVE member
// of the workspace is the RPC's call (it drops the rest silently). Returns
// undefined when the field is absent.
export function parseMentionIds(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) { return undefined; }
  if (!Array.isArray(raw) || raw.length > MENTION_MAX_PER_MESSAGE
    || raw.some(x => typeof x !== 'string' || !UUID.test(x))) {
    throw new ApiError('validation_failed', `\`mentions\` must be an array of at most ${MENTION_MAX_PER_MESSAGE} member ids.`, {
      details: { reason: 'mentions_invalid' },
    });
  }
  return [...new Set((raw as string[]).map(x => x.toLowerCase()))];
}

export async function resolveGeneralChannelId(db: SupabaseClient<Database>, workspaceId: string): Promise<string> {
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

// Adds `author_name` and `mentions` to raw message rows. Mentions come from the
// caller's own client (RLS: workspace member), or from the RPC result when the
// caller just wrote them. One resolve call names both authors and mentioned
// members, including those who have since left (names fall back to "Former
// member" only when the account no longer exists).
async function decorate(
  db: SupabaseClient<Database>,
  workspaceId: string,
  rows: ChatMessage[],
  knownMentions?: ReadonlyMap<string, string[]>,
): Promise<ChatMessageItem[]> {
  const byMessage = new Map<string, string[]>();
  const live = rows.filter(r => !r.deleted_at);
  if (knownMentions) {
    for (const r of live) { byMessage.set(r.id, knownMentions.get(r.id) ?? []); }
  }
  else if (live.length > 0) {
    const { data, error } = await db
      .from('chat_message_mentions')
      .select('message_id, mentioned_user_id')
      .in('message_id', live.map(r => r.id));
    if (error) { throw new ApiError('internal_error', error.message); }
    const liveIds = new Set(live.map(r => r.id));
    for (const m of data ?? []) {
      if (!liveIds.has(m.message_id)) { continue; }
      byMessage.set(m.message_id, [...(byMessage.get(m.message_id) ?? []), m.mentioned_user_id]);
    }
  }
  const ids = [...new Set([
    ...rows.map(r => r.author_user_id).filter((x): x is string => x !== null),
    ...[...byMessage.values()].flat(),
  ])];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await chatResolveAuthors(db, { workspaceId, userIds: ids });
    if (error) { throw new ApiError('internal_error', error.message); }
    for (const row of data ?? []) { names.set(row.user_id, displayNameFromEmail(row.email)); }
  }
  return rows.map(r => ({
    ...r,
    author_name: r.author_user_id ? (names.get(r.author_user_id) ?? 'Former member') : 'Former member',
    mentions: (byMessage.get(r.id) ?? []).map(userId => ({ user_id: userId, name: names.get(userId) ?? 'Former member' })),
  }));
}

// Default / `before_seq`: the newest `limit` messages (older than the cursor),
// returned ascending so the client can prepend. `after_seq`: everything newer
// than the cursor, ascending, capped (reconnect catch-up).
export async function fetchMessagesPage(db: SupabaseClient<Database>, params: ListMessagesParams): Promise<ChatMessagesPage> {
  const channelId = await resolveGeneralChannelId(db, params.workspaceId);

  if (params.ids !== undefined) {
    const { data, error } = await db
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('channel_id', channelId)
      .in('id', params.ids)
      .order('seq', { ascending: true })
      .limit(CHAT_MAX_IDS_PER_REQUEST);
    if (error) { throw new ApiError('internal_error', error.message); }
    return { channel_id: channelId, items: await decorate(db, params.workspaceId, (data ?? []) as ChatMessage[]), has_more: false };
  }

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
    return { channel_id: channelId, items: await decorate(db, params.workspaceId, page), has_more: hasMore };
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
  return { channel_id: channelId, items: await decorate(db, params.workspaceId, page), has_more: hasMore };
}

export async function postMessage(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, userId: string, rawBody: unknown, rawMentions?: unknown },
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
  const mentionIds = parseMentionIds(params.rawMentions);

  // BK-217: the send is one SECURITY DEFINER transaction (migration 0123). It
  // binds the author to auth.uid(), asserts membership and write access (the
  // viewer read-only rule lives there now) and writes the message, its mention
  // rows and the inbox notifications together.
  const { data, error } = await chatSendMessage(db, { workspaceId: params.workspaceId, body: validated.body, mentionIds });
  if (error) { mapRpcError(error); }
  return withAuthor(db, params.workspaceId, data);
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
  workspace_not_found: { code: 'not_found', message: 'Workspace not found or you are not an active member.' },
  not_workspace_member: { code: 'not_found', message: 'Workspace not found or you are not an active member.' },
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
  params: { workspaceId: string, messageId: string, rawBody: unknown, rawMentions?: unknown },
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
  const mentionIds = parseMentionIds(params.rawMentions);
  const { data, error } = await chatEditMessage(db, { messageId: params.messageId, body: validated.body, mentionIds });
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
  const row = (Array.isArray(data) ? data[0] : data) as (ChatMessage & { mention_user_ids?: string[] | null }) | undefined;
  // The RPC resolves the message across workspaces; a row from another
  // workspace than the URL's collapses into the same 404 as a missing one.
  if (!row || row.workspace_id !== workspaceId) { throw new ApiError('not_found', 'Message not found.'); }
  const { mention_user_ids: mentionIds, ...message } = row;
  // Send / edit RPCs return the stored mention set; delete returns a tombstone
  // (no mentions), so an absent column means none.
  const [item] = await decorate(db, workspaceId, [message], new Map([[message.id, mentionIds ?? []]]));
  return item;
}
