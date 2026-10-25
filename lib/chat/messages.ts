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

// Business rule: 1..4000 characters AFTER trimming; empty/whitespace-only is
// rejected. Mirrors the DB CHECK (char_length(btrim(body)) between 1 and 4000)
// so the client, the API and the table agree.
export function validateMessageBody(raw: unknown): BodyValidation {
  if (typeof raw !== 'string') { return { ok: false, reason: 'empty' }; }
  const body = raw.trim();
  if (body.length === 0) { return { ok: false, reason: 'empty' }; }
  if (body.length > CHAT_MESSAGE_MAX_LENGTH) { return { ok: false, reason: 'too_long' }; }
  return { ok: true, body };
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
// `seq` order. Returns the same array reference when nothing changed.
export function mergeMessages(existing: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) { byId.set(m.id, m); }
  let changed = false;
  for (const m of incoming) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      changed = true;
    }
  }
  if (!changed) { return existing as ChatMessage[]; }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
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
  event: 'INSERT'
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
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `workspace_id=eq.${workspaceId}`,
    },
  };
}
