import type { ChatMember } from './messages';
import { describe, expect, it } from 'bun:test';
import {
  activeMentionIds,
  addPickedMention,
  detectMentionQuery,
  filterMentionCandidates,
  insertMention,
  MENTION_MAX_PER_MESSAGE,
  splitMentions,
} from './mentions';

const member = (user_id: string, display_name: string, email: string, role: ChatMember['role'] = 'member'): ChatMember => ({
  user_id,
  display_name,
  email,
  role,
});

const ROSTER = [
  member('u-sara', 'Sara Iglesias', 'sara.iglesias@x.test', 'owner'),
  member('u-elena', 'Elena Vargas', 'elena.vargas@x.test'),
  member('u-noa', 'Noa Viewer', 'noa@x.test', 'viewer'),
  member('u-ana', 'Ana', 'ana@x.test'),
  member('u-ana-maria', 'Ana Maria', 'ana.maria@x.test'),
];

describe('detectMentionQuery', () => {
  it('opens on a bare "@" at the start and after whitespace', () => {
    expect(detectMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(detectMentionQuery('hi @El', 6)).toEqual({ start: 3, query: 'El' });
    expect(detectMentionQuery('line\n@', 6)).toEqual({ start: 5, query: '' });
  });

  it('opens after an opening bracket but not inside an email-like token', () => {
    expect(detectMentionQuery('(@El', 4)).toEqual({ start: 1, query: 'El' });
    expect(detectMentionQuery('mail a@b', 8)).toBeNull();
  });

  it('allows spaces inside the query so a full name keeps matching', () => {
    expect(detectMentionQuery('hey @Elena Va', 13)).toEqual({ start: 4, query: 'Elena Va' });
  });

  it('closes on a leading space, a newline or an over-long query', () => {
    expect(detectMentionQuery('a @ b', 5)).toBeNull();
    expect(detectMentionQuery('@a\nb', 4)).toBeNull();
    expect(detectMentionQuery(`@${'x'.repeat(41)}`, 42)).toBeNull();
  });

  it('reads only up to the caret and ignores a caret outside the text', () => {
    expect(detectMentionQuery('@Elena later', 3)).toEqual({ start: 0, query: 'El' });
    expect(detectMentionQuery('plain', 5)).toBeNull();
    expect(detectMentionQuery('@a', 0)).toBeNull();
    expect(detectMentionQuery('@a', 9)).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  it('matches by name prefix, then word prefix, then email, case-insensitively', () => {
    expect(filterMentionCandidates(ROSTER, 'el').map(m => m.user_id)).toEqual(['u-elena']);
    expect(filterMentionCandidates(ROSTER, 'VARG').map(m => m.user_id)).toEqual(['u-elena']);
    expect(filterMentionCandidates(ROSTER, 'iglesias').map(m => m.user_id)).toEqual(['u-sara']);
  });

  it('lists everyone for an empty query, capped by the limit', () => {
    expect(filterMentionCandidates(ROSTER, '', 3)).toHaveLength(3);
  });

  it('includes viewers (they can be mentioned) and ranks a prefix above a substring', () => {
    expect(filterMentionCandidates(ROSTER, 'noa').map(m => m.user_id)).toEqual(['u-noa']);
    expect(filterMentionCandidates(ROSTER, 'a').map(m => m.user_id)[0]).toBe('u-ana');
  });

  it('returns nothing when no active member matches', () => {
    expect(filterMentionCandidates(ROSTER, 'mateo')).toEqual([]);
  });
});

describe('insertMention', () => {
  it('replaces the query with "@Name " and puts the caret after it', () => {
    const text = 'hey @El rest';
    const query = detectMentionQuery(text, 7)!;
    const next = insertMention(text, query, 7, ROSTER[1]);
    expect(next.value).toBe('hey @Elena Vargas  rest');
    expect(next.caret).toBe('hey @Elena Vargas '.length);
  });
});

describe('splitMentions', () => {
  const mentions = [{ user_id: 'u-elena', name: 'Elena Vargas' }];

  it('returns one text segment when there are no mentions', () => {
    expect(splitMentions('hello', undefined)).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(splitMentions('hello', [])).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(splitMentions('', mentions)).toEqual([]);
  });

  it('splits around every occurrence, keeping the written text', () => {
    expect(splitMentions('Hey @Elena Vargas, and @elena vargas!', mentions)).toEqual([
      { kind: 'text', text: 'Hey ' },
      { kind: 'mention', text: '@Elena Vargas', userId: 'u-elena' },
      { kind: 'text', text: ', and ' },
      { kind: 'mention', text: '@elena vargas', userId: 'u-elena' },
      { kind: 'text', text: '!' },
    ]);
  });

  it('does not match inside a longer word', () => {
    expect(splitMentions('@Anabel is here', [{ user_id: 'u-ana', name: 'Ana' }])).toEqual([
      { kind: 'text', text: '@Anabel is here' },
    ]);
  });

  it('prefers the longer name when two mentioned names overlap', () => {
    const segments = splitMentions('ping @Ana Maria now', [
      { user_id: 'u-ana', name: 'Ana' },
      { user_id: 'u-ana-maria', name: 'Ana Maria' },
    ]);
    expect(segments.filter(s => s.kind === 'mention')).toEqual([
      { kind: 'mention', text: '@Ana Maria', userId: 'u-ana-maria' },
    ]);
  });

  it('shows no pill for a mention whose text was edited away', () => {
    expect(splitMentions('no names here', mentions)).toEqual([{ kind: 'text', text: 'no names here' }]);
  });

  it('keeps a former member name renderable', () => {
    expect(splitMentions('bye @Mateo Ruiz', [{ user_id: 'u-m', name: 'Mateo Ruiz' }])[1]).toEqual({
      kind: 'mention',
      text: '@Mateo Ruiz',
      userId: 'u-m',
    });
  });
});

describe('activeMentionIds', () => {
  const picked = [
    { user_id: 'u-elena', name: 'Elena Vargas' },
    { user_id: 'u-sara', name: 'Sara Iglesias' },
  ];

  it('keeps only picked members still in the text, once each, in text order', () => {
    expect(activeMentionIds('@Sara Iglesias @Elena Vargas @Elena Vargas', picked)).toEqual(['u-sara', 'u-elena']);
    expect(activeMentionIds('deleted the pill', picked)).toEqual([]);
  });

  it('caps the number of ids per message', () => {
    const many = Array.from({ length: MENTION_MAX_PER_MESSAGE + 5 }, (_, i) => ({ user_id: `u${i}`, name: `N${String(i).padStart(3, '0')}` }));
    const body = many.map(m => `@${m.name}`).join(' ');
    expect(activeMentionIds(body, many)).toHaveLength(MENTION_MAX_PER_MESSAGE);
  });
});

describe('addPickedMention', () => {
  it('does not duplicate the same pick', () => {
    const one = addPickedMention([], { user_id: 'u1', name: 'A' });
    expect(addPickedMention(one, { user_id: 'u1', name: 'A' })).toHaveLength(1);
    expect(addPickedMention(one, { user_id: 'u2', name: 'B' })).toHaveLength(2);
  });
});
