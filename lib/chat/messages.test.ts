import type { ChatMessage } from './messages';
import { describe, expect, it } from 'bun:test';
import {
  buildChatChannelConfig,
  canDeleteMessage,
  canEditMessage,
  canWriteChat,
  CHAT_EDIT_WINDOW_MS,
  continuesPrevious,
  displayNameFromEmail,
  editWindowOpen,
  firstUnreadIndex,
  initialsOf,
  isNewDay,
  isTombstone,
  lastSeq,
  mergeMessages,
  validateMessageBody,
} from './messages';

function msg(seq: number, over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${seq}`,
    seq,
    channel_id: 'c',
    workspace_id: 'w',
    author_user_id: 'u1',
    body: `body ${seq}`,
    created_at: '2026-10-25T10:00:00.000Z',
    ...over,
  };
}

describe('validateMessageBody', () => {
  it('trims and accepts 1..4000 chars', () => {
    expect(validateMessageBody('  hi  ')).toEqual({ ok: true, body: 'hi' });
    expect(validateMessageBody('a'.repeat(4000)).ok).toBe(true);
  });
  it('rejects empty, whitespace-only and non-strings', () => {
    expect(validateMessageBody('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateMessageBody('  \n\t ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateMessageBody(undefined)).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects > 4000 chars after trimming but not padding', () => {
    expect(validateMessageBody('a'.repeat(4001))).toEqual({ ok: false, reason: 'too_long' });
    expect(validateMessageBody(` ${'a'.repeat(4000)} `).ok).toBe(true);
  });
});

describe('canWriteChat', () => {
  it('viewers are read-only; member and above write', () => {
    expect(canWriteChat('viewer')).toBe(false);
    expect(canWriteChat(null)).toBe(false);
    for (const r of ['member', 'admin', 'owner'] as const) { expect(canWriteChat(r)).toBe(true); }
  });
});

describe('names', () => {
  it('derives a display name from the email', () => {
    expect(displayNameFromEmail('elena.ruiz@bunkai.dev')).toBe('Elena Ruiz');
    expect(displayNameFromEmail('sara@x.io')).toBe('Sara');
    expect(displayNameFromEmail(null)).toBe('Former member');
  });
  it('builds initials', () => {
    expect(initialsOf('Elena Ruiz')).toBe('ER');
    expect(initialsOf('Sara')).toBe('SA');
  });
});

describe('mergeMessages', () => {
  it('dedupes by id and keeps seq order', () => {
    const merged = mergeMessages([msg(1), msg(3)], [msg(2), msg(3)]);
    expect(merged.map(m => m.seq)).toEqual([1, 2, 3]);
  });
  it('returns the same reference when nothing is new', () => {
    const list = [msg(1)];
    expect(mergeMessages(list, [msg(1)])).toBe(list);
  });
  it('orders a catch-up burst after the gap correctly', () => {
    const merged = mergeMessages([msg(1)], [msg(4), msg(2), msg(3)]);
    expect(merged.map(m => m.seq)).toEqual([1, 2, 3, 4]);
    expect(lastSeq(merged)).toBe(4);
    expect(lastSeq([])).toBe(0);
  });
});

describe('firstUnreadIndex', () => {
  const list = [msg(1), msg(2, { author_user_id: 'me' }), msg(3), msg(4)];
  it('finds the first unseen message from someone else', () => {
    expect(firstUnreadIndex(list, 1, 'me')).toBe(2);
  });
  it('is -1 when all are seen or own', () => {
    expect(firstUnreadIndex(list, 4, 'me')).toBe(-1);
    expect(firstUnreadIndex([msg(2, { author_user_id: 'me' })], 0, 'me')).toBe(-1);
  });
});

describe('grouping', () => {
  it('collapses same author within 5 minutes', () => {
    const a = msg(1);
    expect(continuesPrevious(a, msg(2, { created_at: '2026-10-25T10:04:00.000Z' }))).toBe(true);
    expect(continuesPrevious(a, msg(2, { created_at: '2026-10-25T10:06:00.000Z' }))).toBe(false);
    expect(continuesPrevious(a, msg(2, { author_user_id: 'u2' }))).toBe(false);
    expect(continuesPrevious(undefined, a)).toBe(false);
  });
  it('detects a day change', () => {
    expect(isNewDay(undefined, msg(1))).toBe(true);
    expect(isNewDay(msg(1), msg(2))).toBe(false);
  });
});

describe('buildChatChannelConfig', () => {
  it('scopes channels and the binding to the workspace', () => {
    const c = buildChatChannelConfig('ws-1');
    expect(c.channelName).toBe('chat-ws-1');
    expect(c.presenceChannelName).toBe('chat-presence-ws-1');
    expect(c.binding).toEqual({ event: '*', schema: 'public', table: 'chat_messages', filter: 'workspace_id=eq.ws-1' });
  });
});

describe('BK-219 edit / delete rules', () => {
  const created = '2026-10-25T10:00:00.000Z';
  const t0 = new Date(created).getTime();
  const me = { userId: 'u1', role: 'member' as const };

  it('edit window is 15 minutes inclusive', () => {
    expect(editWindowOpen(created, t0 + CHAT_EDIT_WINDOW_MS)).toBe(true);
    expect(editWindowOpen(created, t0 + CHAT_EDIT_WINDOW_MS + 1)).toBe(false);
  });
  it('author edits own live message inside the window only', () => {
    expect(canEditMessage(msg(1, { created_at: created }), me, t0 + 2 * 60_000)).toBe(true);
    expect(canEditMessage(msg(1, { created_at: created }), me, t0 + 16 * 60_000)).toBe(false);
  });
  it('nobody edits someone else (admins included), tombstones or as viewer', () => {
    const other = msg(1, { author_user_id: 'u2', created_at: created });
    expect(canEditMessage(other, me, t0)).toBe(false);
    expect(canEditMessage(other, { userId: 'u1', role: 'admin' }, t0)).toBe(false);
    expect(canEditMessage(msg(1, { created_at: created, deleted_at: created }), me, t0)).toBe(false);
    expect(canEditMessage(msg(1, { created_at: created }), { userId: 'u1', role: 'viewer' }, t0)).toBe(false);
  });
  it('delete: own anytime, others only admin/owner, never a tombstone', () => {
    const own = msg(1);
    const other = msg(2, { author_user_id: 'u2' });
    expect(canDeleteMessage(own, me)).toBe(true);
    expect(canDeleteMessage(other, me)).toBe(false);
    expect(canDeleteMessage(other, { userId: 'u1', role: 'viewer' })).toBe(false);
    expect(canDeleteMessage(other, { userId: 'u1', role: 'admin' })).toBe(true);
    expect(canDeleteMessage(other, { userId: 'u1', role: 'owner' })).toBe(true);
    expect(canDeleteMessage(msg(3, { deleted_at: 'x' }), { userId: 'u1', role: 'admin' })).toBe(false);
    expect(isTombstone(msg(3, { deleted_at: 'x' }))).toBe(true);
  });
  it('mergeMessages applies edits and tombstones, never reverts them', () => {
    const base = [msg(1)];
    const edited = mergeMessages(base, [msg(1, { body: 'fixed', edited_at: '2026-10-25T10:01:00.000Z' })]);
    expect(edited[0].body).toBe('fixed');
    const stale = mergeMessages(edited, [msg(1)]);
    expect(stale).toBe(edited);
    const dead = mergeMessages(edited, [msg(1, { body: '', deleted_at: '2026-10-25T10:02:00.000Z' })]);
    expect(dead[0].deleted_at).not.toBeNull();
    expect(mergeMessages(dead, [msg(1, { body: 'late', edited_at: '2026-10-25T10:03:00.000Z' })])).toBe(dead);
  });
});
