import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { describe, expect, test } from 'bun:test';

describe('sanitizeMarkdown — dangerous HTML', () => {
  test('drops a <script> block and its content, keeps surrounding text', () => {
    const out = sanitizeMarkdown('before <script>alert(1)</script> after');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  test('drops iframe, style, object, embed', () => {
    expect(sanitizeMarkdown('<iframe src="x"></iframe>')).not.toContain('<iframe');
    expect(sanitizeMarkdown('<style>body{}</style>')).not.toContain('<style');
    expect(sanitizeMarkdown('<object data="x"></object>')).not.toContain('<object');
    expect(sanitizeMarkdown('<embed src="x">')).not.toContain('<embed');
  });

  test('strips inline event handlers', () => {
    const out = sanitizeMarkdown('<a href="https://x.com" onclick="steal()">x</a>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('steal()');
  });

  test('strips an unsafe href from a raw <a> tag', () => {
    const out = sanitizeMarkdown('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  test('removes an unsafe autolink', () => {
    expect(sanitizeMarkdown('see <javascript:alert(1)> here')).not.toContain('javascript:');
  });
});

describe('sanitizeMarkdown — Markdown links by scheme', () => {
  test('a javascript: markdown link is reduced to its text', () => {
    expect(sanitizeMarkdown('[click](javascript:alert(1))')).toBe('click');
  });

  test('a data: markdown link is reduced to its text', () => {
    expect(sanitizeMarkdown('[x](data:text/html;base64,PHN2Zz4=)')).toBe('x');
  });

  test('a javascript: markdown image is reduced to its text', () => {
    expect(sanitizeMarkdown('![logo](javascript:alert(1))')).toBe('logo');
  });

  test('keeps a safe http/https link intact (with title)', () => {
    const md = '[site](https://example.com "Home")';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test('keeps a mailto link intact', () => {
    expect(sanitizeMarkdown('[mail](mailto:x@y.com)')).toBe('[mail](mailto:x@y.com)');
  });

  test('keeps a relative / anchor link intact', () => {
    expect(sanitizeMarkdown('[doc](./readme.md)')).toBe('[doc](./readme.md)');
    expect(sanitizeMarkdown('[top](#section)')).toBe('[top](#section)');
  });

  test('drops only the unsafe link in a mixed paragraph', () => {
    const out = sanitizeMarkdown('mail [a](mailto:x@y.com) and [b](javascript:alert(1))');
    expect(out).toContain('[a](mailto:x@y.com)');
    expect(out).toContain('b');
    expect(out).not.toContain('javascript:');
  });

  test('a whitespace-smuggled scheme in an angle-bracket URL is dropped', () => {
    // Angle-bracket URLs may contain whitespace, so a space inside the scheme is
    // a real evasion vector here (the bare form is not a valid link at all).
    const out = sanitizeMarkdown('[x](<java script:alert(1)>)');
    expect(out).toBe('x');
  });
});

describe('sanitizeMarkdown — does not corrupt legitimate Markdown', () => {
  test('inline code with angle brackets survives byte-for-byte', () => {
    const md = 'compare `a < b` and `x > y`';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test('a fenced code block survives', () => {
    const md = '```ts\nconst x = a < b ? 1 : 2;\n```';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test('headings, lists, blockquote and a gfm table survive', () => {
    const md = '## Steps\n\n- one\n- two\n\n> note\n\n| col | col |\n| --- | --- |\n| a | b |';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test('safe content is idempotent under repeated sanitizing', () => {
    const md = '# Title\n\n[link](https://x.com)\n\n`code`';
    expect(sanitizeMarkdown(sanitizeMarkdown(md))).toBe(sanitizeMarkdown(md));
  });
});
