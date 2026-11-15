import { describe, expect, it } from 'bun:test';
import { renderTable } from './table';

describe('renderTable', () => {
  it('pads columns to the widest cell and keeps the last column unpadded', () => {
    expect(renderTable(['A', 'B'], [['long cell', 'x'], ['s', 'yy']])).toBe('A          B\nlong cell  x\ns          yy\n');
  });

  it('cuts an over-long cell with an ellipsis and flattens line breaks', () => {
    const out = renderTable(['TITLE'], [['a\nb'], ['x'.repeat(100)]], 10);
    expect(out.split('\n')[1]).toBe('a b');
    expect(out.split('\n')[2]).toBe(`${'x'.repeat(9)}…`);
  });
});
