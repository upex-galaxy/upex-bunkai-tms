import { byteLength, insertLink, prefixLines, wrapSelection } from '@lib/markdown/format';
import { describe, expect, test } from 'bun:test';

describe('wrapSelection', () => {
  test('wraps the selection with markers (Bold → **sel**)', () => {
    const r = wrapSelection({ value: 'a bold b', selectionStart: 2, selectionEnd: 6 }, '**', '**');
    expect(r.value).toBe('a **bold** b');
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('bold');
  });

  test('empty selection inserts markers with the caret between them', () => {
    const r = wrapSelection({ value: '', selectionStart: 0, selectionEnd: 0 }, '**', '**');
    expect(r.value).toBe('****');
    expect(r.selectionStart).toBe(2);
    expect(r.selectionEnd).toBe(2);
  });

  test('inline code wrapping', () => {
    const r = wrapSelection({ value: 'use x here', selectionStart: 4, selectionEnd: 5 }, '`', '`');
    expect(r.value).toBe('use `x` here');
  });
});

describe('prefixLines', () => {
  test('prefixes a single line with a bullet', () => {
    const r = prefixLines({ value: 'item', selectionStart: 0, selectionEnd: 4 }, '- ');
    expect(r.value).toBe('- item');
  });

  test('prefixes each selected line', () => {
    const r = prefixLines({ value: 'a\nb\nc', selectionStart: 0, selectionEnd: 5 }, '- ');
    expect(r.value).toBe('- a\n- b\n- c');
  });

  test('ordered list numbers each line', () => {
    const r = prefixLines({ value: 'a\nb', selectionStart: 0, selectionEnd: 3 }, i => `${i + 1}. `);
    expect(r.value).toBe('1. a\n2. b');
  });

  test('heading prefix uses the caret line even with no selection', () => {
    // caret at index 6 ("Ti|tle"), single line
    const r = prefixLines({ value: 'Title', selectionStart: 2, selectionEnd: 2 }, '## ');
    expect(r.value).toBe('## Title');
  });
});

describe('insertLink', () => {
  test('uses the selection as link text and selects the url', () => {
    const r = insertLink({ value: 'see here now', selectionStart: 4, selectionEnd: 8 }, 'https://x.com');
    expect(r.value).toBe('see [here](https://x.com) now');
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('https://x.com');
  });

  test('empty selection falls back to "text"', () => {
    const r = insertLink({ value: '', selectionStart: 0, selectionEnd: 0 }, 'https://x.com');
    expect(r.value).toBe('[text](https://x.com)');
  });
});

describe('byteLength', () => {
  test('counts ASCII as one byte each', () => {
    expect(byteLength('hello')).toBe(5);
  });

  test('counts multi-byte UTF-8 correctly', () => {
    expect(byteLength('é')).toBe(2);
    expect(byteLength('😀')).toBe(4);
  });
});
