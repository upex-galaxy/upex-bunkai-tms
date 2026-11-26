import { addTestTag } from '@lib/tests/tag-input';
import { describe, expect, it } from 'bun:test';

const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);

describe('addTestTag', () => {
  it('appends a custom tag with its casing and lowercases a reserved one', () => {
    expect(addTestTag(['smoke'], 'Checkout')).toEqual({ kind: 'added', tags: ['smoke', 'Checkout'] });
    expect(addTestTag([], ' Regression ')).toEqual({ kind: 'added', tags: ['regression'] });
  });

  it('adds nothing for a reserved tag already present in another case', () => {
    expect(addTestTag(['smoke'], 'SMOKE')).toEqual({ kind: 'present' });
  });

  it('refuses a 21st tag, a tag over 50 characters and a tag with a comma', () => {
    expect(addTestTag(twenty, 'one-more')).toEqual({ kind: 'refused', error: 'A Test can carry at most 20 tags.' });
    expect(addTestTag([], 'x'.repeat(51))).toEqual({ kind: 'refused', error: 'Tags must be 50 characters or fewer.' });
    expect(addTestTag([], 'a,b')).toEqual({ kind: 'refused', error: 'Tags must not contain commas.' });
  });

  it('counts characters, so 50 emoji fit and 51 do not', () => {
    expect(addTestTag([], '🔥'.repeat(50)).kind).toBe('added');
    expect(addTestTag([], '🔥'.repeat(51)).kind).toBe('refused');
  });

  it('ignores a blank entry', () => {
    expect(addTestTag([], '   ')).toEqual({ kind: 'empty' });
  });
});
