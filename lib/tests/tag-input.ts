import { RESERVED_TEST_TAGS, TEST_TAG_MAX_LEN, TEST_TAGS_MAX_COUNT, testTagLength } from '@lib/tests/validation';

const RESERVED = RESERVED_TEST_TAGS as readonly string[];

export function normalizeTestTagForCompare(tag: string): string {
  const t = tag.trim();
  return RESERVED.includes(t.toLowerCase()) ? t.toLowerCase() : t;
}

export type TestTagAddResult
  = | { kind: 'added', tags: string[] }
    | { kind: 'present' }
    | { kind: 'empty' }
    | { kind: 'refused', error: string };

export function addTestTag(tags: string[], raw: string): TestTagAddResult {
  const value = raw.trim();
  if (!value) {
    return { kind: 'empty' };
  }
  if (value.includes(',')) {
    return { kind: 'refused', error: 'Tags must not contain commas.' };
  }
  if (testTagLength(value) > TEST_TAG_MAX_LEN) {
    return { kind: 'refused', error: `Tags must be ${TEST_TAG_MAX_LEN} characters or fewer.` };
  }
  const norm = normalizeTestTagForCompare(value);
  if (tags.some(t => normalizeTestTagForCompare(t) === norm)) {
    return { kind: 'present' };
  }
  if (tags.length >= TEST_TAGS_MAX_COUNT) {
    return { kind: 'refused', error: `A Test can carry at most ${TEST_TAGS_MAX_COUNT} tags.` };
  }
  return { kind: 'added', tags: [...tags, RESERVED.includes(value.toLowerCase()) ? value.toLowerCase() : value] };
}
