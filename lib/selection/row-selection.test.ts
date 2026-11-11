import {
  headerCheckState,
  hiddenSelectedCount,
  restrictTo,
  toggleId,
  toggleVisible,
} from '@lib/selection/row-selection';
import { describe, expect, test } from 'bun:test';

// BK-507 — the selection rules. The behaviours that matter to the story are the
// header checkbox over VISIBLE rows and a selection that outlives a filter (E6).

describe('row selection', () => {
  test('toggles one id without touching the others, and does not mutate its input', () => {
    const start = new Set(['a']);
    const next = toggleId(start, 'b');
    expect([...next].sort()).toEqual(['a', 'b']);
    expect([...start]).toEqual(['a']);
    expect([...toggleId(next, 'a')]).toEqual(['b']);
  });

  test('the header state is relative to the visible rows', () => {
    expect(headerCheckState(new Set(), ['a', 'b'])).toBe('none');
    expect(headerCheckState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(headerCheckState(new Set(['a', 'b', 'z']), ['a', 'b'])).toBe('all');
    expect(headerCheckState(new Set(['a']), [])).toBe('none');
  });

  test('select all selects every visible row, a second click deselects only the visible ones', () => {
    const all = toggleVisible(new Set(['hidden']), ['a', 'b']);
    expect([...all].sort()).toEqual(['a', 'b', 'hidden']);
    const back = toggleVisible(all, ['a', 'b']);
    expect([...back]).toEqual(['hidden']);
  });

  test('a partial selection is completed by the header, not cleared', () => {
    expect([...toggleVisible(new Set(['a']), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });

  test('E6: a filter change keeps the selection and counts what it now hides', () => {
    const selected = new Set(['a', 'b', 'c']);
    expect(hiddenSelectedCount(selected, ['a', 'b', 'c', 'd'])).toBe(0);
    expect(hiddenSelectedCount(selected, ['a'])).toBe(2);
    expect(hiddenSelectedCount(selected, [])).toBe(3);
  });

  test('rows that no longer exist drop out of the selection', () => {
    expect([...restrictTo(new Set(['a', 'gone']), ['a', 'b'])]).toEqual(['a']);
  });
});
