import type { ChatMessage } from './messages';
import { describe, expect, it } from 'bun:test';
import {
  buildChatChannelConfig,
  canWriteChat,
  continuesPrevious,
  displayNameFromEmail,
  firstUnreadIndex,
  initialsOf,
  isNewDay,
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
    expect(c.binding).toEqual({ event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'workspace_id=eq.ws-1' });
  });
});
