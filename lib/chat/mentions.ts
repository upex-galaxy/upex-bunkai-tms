// BK-217 — pure, dependency-free core of chat @-mentions: the composer trigger,
// autocomplete filtering, caret-aware insertion, which picked mentions are still
// in the text, and splitting a stored body into text and mention pills. No
// React, no Supabase, no I/O, so every decision the composer and the message
// list make is unit-testable (same split as ./messages.ts).
//
// Storage model (BK-217 decisions D1 / T1): the body keeps the readable
// "@Name" text, and the member ids live server-side in chat_message_mentions.
// The client therefore sends the picked ids next to the body, and renders a
// pill by locating "@Name" for each id the server returned.

import type { ChatMember } from './messages';

export const MENTION_MAX_PER_MESSAGE = 50;
export const MENTION_QUERY_MAX_LENGTH = 40;
export const MENTION_SUGGESTION_LIMIT = 6;

// A mention as the API returns it for a stored message: the member id plus the
// display name the pill reads. `name` is "Former member" when the account could
// not be resolved (deleted), so the pill never loses its text.
export interface ChatMention {
  user_id: string
  name: string
}

export interface MentionQuery {
  // Index of the "@" that opened the query.
  start: number
  // Text typed after the "@", up to the caret.
  query: string
}

export type MentionSegment
  = | { kind: 'text', text: string }
    | { kind: 'mention', text: string, userId: string };

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const OPENERS = new Set(['(', '[', '{', '"', '\'', '«', '¿', '¡']);

// The "@" opens autocomplete only at the start of the text or after
// whitespace / an opening bracket, so "name@host" and "a@b.com" never do. The
// query may contain spaces (names do: "@Elena Va") but never a newline, never a
// leading space, and stays short, so a stray "@" does not keep a popover open
// for the rest of the sentence.
export function detectMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 1 || caret > text.length) { return null; }
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at < 0) { return null; }
  const before = at === 0 ? '' : upToCaret.charAt(at - 1);
  if (before !== '' && !/\s/.test(before) && !OPENERS.has(before)) { return null; }
  const query = upToCaret.slice(at + 1);
  if (query.includes('\n') || query.length > MENTION_QUERY_MAX_LENGTH) { return null; }
  if (query.length > 0 && /^\s/.test(query)) { return null; }
  return { start: at, query };
}

function normalize(s: string): string {
  return s.toLowerCase();
}

function emailLocal(email: string): string {
  return email.split('@')[0] ?? '';
}

// Active members whose name or email matches, best matches first: a name that
// starts with the query, then a word of the name that starts with it, then the
// email local part, then any substring of the name. Empty query lists everyone
// (the member just typed "@"). Order inside a tier keeps roster order.
export function filterMentionCandidates(
  members: readonly ChatMember[],
  query: string,
  limit: number = MENTION_SUGGESTION_LIMIT,
): ChatMember[] {
  const q = normalize(query.trim());
  if (q === '') { return members.slice(0, limit); }
  const ranked: { member: ChatMember, tier: number }[] = [];
  for (const member of members) {
    const name = normalize(member.display_name);
    const local = normalize(emailLocal(member.email));
    let tier = -1;
    if (name.startsWith(q)) { tier = 0; }
    else if (name.split(/\s+/).some(w => w.startsWith(q))) { tier = 1; }
    else if (local.startsWith(q)) { tier = 2; }
    else if (name.includes(q)) { tier = 3; }
    if (tier >= 0) { ranked.push({ member, tier }); }
  }
  return ranked.sort((a, b) => a.tier - b.tier).slice(0, limit).map(r => r.member);
}

// Replaces "@<query>" with "@<Name> " and returns the new value and the caret
// position after it. The trailing space keeps the next word from gluing onto
// the pill.
export function insertMention(
  text: string,
  query: MentionQuery,
  caret: number,
  member: Pick<ChatMember, 'display_name'>,
): { value: string, caret: number } {
  const insert = `@${member.display_name} `;
  const value = text.slice(0, query.start) + insert + text.slice(caret);
  return { value, caret: query.start + insert.length };
}

interface Range { start: number, end: number, userId: string, name: string }

// Every place "@<name>" appears with a clean right edge (the next character is
// not a letter, digit or underscore, so "@Ana" does not match inside "@Anabel").
// Overlaps resolve to the earliest, then the longest, so "@Ana Maria" wins over
// "@Ana" when both members are mentioned.
function findRanges(body: string, mentions: readonly ChatMention[]): Range[] {
  const found: Range[] = [];
  const lower = body.toLowerCase();
  for (const m of mentions) {
    if (m.name.length === 0) { continue; }
    const needle = `@${m.name}`.toLowerCase();
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i < 0) { break; }
      const end = i + needle.length;
      const next = body.charAt(end);
      if (next === '' || !WORD_CHAR.test(next)) {
        found.push({ start: i, end, userId: m.user_id, name: m.name });
      }
      from = i + 1;
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Range[] = [];
  let cursor = 0;
  for (const r of found) {
    if (r.start < cursor) { continue; }
    kept.push(r);
    cursor = r.end;
  }
  return kept;
}

// Splits a stored body into plain text and mention pills. A mention whose
// "@Name" is no longer in the body (the text was edited, or the message is a
// tombstone) simply produces no pill: nothing breaks. The pill keeps the text
// exactly as written in the body.
export function splitMentions(body: string, mentions: readonly ChatMention[] | undefined): MentionSegment[] {
  if (!mentions || mentions.length === 0 || body.length === 0) {
    return body.length === 0 ? [] : [{ kind: 'text', text: body }];
  }
  const ranges = findRanges(body, mentions);
  if (ranges.length === 0) { return [{ kind: 'text', text: body }]; }
  const out: MentionSegment[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) { out.push({ kind: 'text', text: body.slice(at, r.start) }); }
    out.push({ kind: 'mention', text: body.slice(r.start, r.end), userId: r.userId });
    at = r.end;
  }
  if (at < body.length) { out.push({ kind: 'text', text: body.slice(at) }); }
  return out;
}

// Of the members the author picked while composing, the ones whose "@Name" is
// still in the final text (deleting the pill text un-mentions them). Distinct,
// capped, in the order they appear in the text.
export function activeMentionIds(body: string, picked: readonly ChatMention[]): string[] {
  const ids: string[] = [];
  for (const r of findRanges(body, picked)) {
    if (!ids.includes(r.userId)) { ids.push(r.userId); }
    if (ids.length >= MENTION_MAX_PER_MESSAGE) { break; }
  }
  return ids;
}

// Remembers a pick without duplicating it (same member picked twice).
export function addPickedMention(picked: readonly ChatMention[], mention: ChatMention): ChatMention[] {
  return picked.some(p => p.user_id === mention.user_id && p.name === mention.name) ? [...picked] : [...picked, mention];
}

// The stored mentions of a message, as picks, so the edit box starts with the
// pills the message already carries.
export function mentionsAsPicked(mentions: readonly ChatMention[] | undefined): ChatMention[] {
  return mentions ? mentions.map(m => ({ ...m })) : [];
}
