// BK-215 — pure, dependency-free core of the workspace Team Chat: message
// shape, body validation, merge/ordering, unread separator, and the Realtime
// channel config. No Supabase import and no side effects, so every decision the
// chat UI makes is unit-testable without a live socket (same split as
// lib/runs/realtime-run-channel.ts, ADR-0010).

export const CHAT_MESSAGE_MAX_LENGTH = 4000;
export const CHAT_PAGE_SIZE = 30;
export const CHAT_MAX_PAGE_SIZE = 100;
export const CHAT_CATCH_UP_LIMIT = 200;

export type ChatRole = 'viewer' | 'member' | 'admin' | 'owner';

export interface ChatMessage {
  id: string
  // Monotonic total order (bigint identity in Postgres). JSON number is safe:
  // the counter would need 2^53 messages to lose precision.
  seq: number
  channel_id: string
  workspace_id: string
  author_user_id: string | null
  body: string
  created_at: string
  // BK-219: set once the author edited the body / a tombstone replaced it.
  edited_at?: string | null
  deleted_at?: string | null
}

export interface ChatMember {
  user_id: string
  email: string
  display_name: string
  role: ChatRole
}

export type BodyValidation
  = | { ok: true, body: string }
    | { ok: false, reason: 'empty' | 'too_long' };

// BK-1282: length of a message body in the unit the DB CHECK uses. Postgres
// `char_length` counts Unicode code points, while JS `.length` counts UTF-16
// code units (an emoji like U+1F600 is 2 units but 1 code point). Iterating a
// string walks code points, so this counts the same thing as the DB. A grapheme
// (ZWJ family, flag) is several code points and counts as several: code points
// are the contract, never graphemes, or the client would accept what the DB
// rejects. No Unicode normalization, same as the DB.
export function chatBodyLength(raw: string): number {
  return [...raw.trim()].length;
}

// Business rule: 1..4000 characters AFTER trimming; empty/whitespace-only is
// rejected. Mirrors the DB CHECK (char_length(btrim(body)) between 1 and 4000)
// so the client, the API and the table agree. The trim is JS `trim()` (all
// Unicode whitespace), wider than `btrim`'s spaces-only default; the trimmed
// string is what the API stores and sends to the edit RPC, so the DB's `btrim`
// is a no-op on it and both sides measure the same text. The only difference is
// that whitespace-only input like "\n\t" is rejected here, which is the rule.
export function validateMessageBody(raw: unknown): BodyValidation {
  if (typeof raw !== 'string') { return { ok: false, reason: 'empty' }; }
  const body = raw.trim();
  const length = chatBodyLength(body);
  if (length === 0) { return { ok: false, reason: 'empty' }; }
  if (length > CHAT_MESSAGE_MAX_LENGTH) { return { ok: false, reason: 'too_long' }; }
  return { ok: true, body };
}

// BK-219: authors can edit for 15 minutes after sending (server-enforced by
// bunkai_chat_edit_message; this mirrors it to hide the action client-side).
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function isTombstone(m: Pick<ChatMessage, 'deleted_at'>): boolean {
  return Boolean(m.deleted_at);
}

export function editWindowOpen(createdAt: string, now: number): boolean {
  return now - new Date(createdAt).getTime() <= CHAT_EDIT_WINDOW_MS;
}

export function canEditMessage(
  m: ChatMessage,
  actor: { userId: string | null, role: ChatRole | null | undefined },
  now: number,
): boolean {
  return !isTombstone(m)
    && m.author_user_id !== null
    && m.author_user_id === actor.userId
    && canWriteChat(actor.role)
    && editWindowOpen(m.created_at, now);
}

// Own messages at any time (even with a read-only role); anyone else's only
// for admin/owner (moderation, delete-only).
export function canDeleteMessage(
  m: ChatMessage,
  actor: { userId: string | null, role: ChatRole | null | undefined },
): boolean {
  if (isTombstone(m)) { return false; }
  if (m.author_user_id !== null && m.author_user_id === actor.userId) { return true; }
  return actor.role === 'admin' || actor.role === 'owner';
}

export function canWriteChat(role: ChatRole | null | undefined): boolean {
  return role === 'member' || role === 'admin' || role === 'owner';
}

// Display name derived from the account email's local part ("elena.ruiz@x" ->
// "Elena Ruiz") — the app has no profile name column yet.
export function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) { return 'Former member'; }
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._\-+\s]+/).filter(Boolean);
  if (words.length === 0) { return email; }
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) { return '?'; }
  if (parts.length === 1) { return parts[0].slice(0, 2).toUpperCase(); }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Merge incoming messages into the list: dedupe by id (a message can arrive via
// the send response, the realtime event and a catch-up fetch), keep ascending
// `seq` order. An incoming version REPLACES the held one when it is newer
// (BK-219: edited / deleted); a stale copy never overwrites a tombstone or a
// later edit. Returns the same array reference when nothing changed.
export function mergeMessages<T extends ChatMessage>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of existing) { byId.set(m.id, m); }
  let changed = false;
  for (const m of incoming) {
    const held = byId.get(m.id);
    if (!held) {
      byId.set(m.id, m);
      changed = true;
    }
    else if (isNewerVersion(held, m)) {
      byId.set(m.id, { ...held, ...m });
      changed = true;
    }
  }
  if (!changed) { return existing as T[]; }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

function versionOf(m: ChatMessage): number {
  if (m.deleted_at) { return Number.MAX_SAFE_INTEGER; }
  return m.edited_at ? new Date(m.edited_at).getTime() : 0;
}

function isNewerVersion(held: ChatMessage, incoming: ChatMessage): boolean {
  return versionOf(incoming) > versionOf(held);
}

export function lastSeq(messages: readonly ChatMessage[]): number {
  return messages.length === 0 ? 0 : messages[messages.length - 1].seq;
}

// Index of the first message the member has not seen, or -1 (nothing unseen).
// Own messages never count as unseen.
export function firstUnreadIndex(
  messages: readonly ChatMessage[],
  lastSeenSeq: number,
  selfUserId: string | null,
): number {
  return messages.findIndex(m => m.seq > lastSeenSeq && m.author_user_id !== selfUserId);
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Collapsed-sender treatment: a message continues the previous one when it has
// the same author, within 5 minutes, on the same calendar day.
export function continuesPrevious(prev: ChatMessage | undefined, cur: ChatMessage): boolean {
  if (!prev || prev.author_user_id !== cur.author_user_id || cur.author_user_id === null) { return false; }
  const a = new Date(prev.created_at);
  const b = new Date(cur.created_at);
  return b.getTime() - a.getTime() < GROUP_WINDOW_MS && a.toDateString() === b.toDateString();
}

export function isNewDay(prev: ChatMessage | undefined, cur: ChatMessage): boolean {
  return !prev || new Date(prev.created_at).toDateString() !== new Date(cur.created_at).toDateString();
}

export function seenStorageKey(workspaceId: string, userId: string): string {
  return `bunkai.chat.lastSeenSeq.${workspaceId}.${userId}`;
}

export interface ChatChannelBinding {
  event: '*'
  schema: 'public'
  table: 'chat_messages'
  filter: string
}

export interface ChatChannelConfig {
  channelName: string
  presenceChannelName: string
  binding: ChatChannelBinding
}

// RLS (`chat_messages_select_member`, migration 0104) gates postgres_changes
// delivery like SELECT, so the workspace filter is a narrowing, not the trust
// boundary. Presence rides a separate channel keyed per workspace.
export function buildChatChannelConfig(workspaceId: string): ChatChannelConfig {
  return {
    channelName: `chat-${workspaceId}`,
    presenceChannelName: `chat-presence-${workspaceId}`,
    binding: {
      event: '*',
      schema: 'public',
      table: 'chat_messages',
      filter: `workspace_id=eq.${workspaceId}`,
    },
  };
}
