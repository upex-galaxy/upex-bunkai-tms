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

  it('drops terminal control characters so a title cannot drive the terminal', () => {
    const esc = String.fromCharCode(0x1B);
    const bel = String.fromCharCode(0x07);
    const csi = String.fromCharCode(0x9B);
    const out = renderTable(['TITLE'], [[`${esc}]0;owned${bel}Login${esc}[2J ok${csi}`]]);
    expect(out).toBe('TITLE\n]0;ownedLogin[2J ok\n');
    expect(Array.from(out).every(ch => ch === '\n' || ((ch.codePointAt(0) ?? 0) >= 0x20 && ((ch.codePointAt(0) ?? 0) < 0x7F || (ch.codePointAt(0) ?? 0) > 0x9F)))).toBe(true);
  });

  it('keeps accents and non-Latin text', () => {
    expect(renderTable(['T'], [['Validación ログイン']])).toBe('T\nValidación ログイン\n');
  });
});
