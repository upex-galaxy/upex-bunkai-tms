import type { AdfNode } from '@lib/jira/adf-to-markdown';
import { adfToMarkdown } from '@lib/jira/adf-to-markdown';
import { describe, expect, test } from 'bun:test';

// Helpers to keep the realistic ADF fixtures terse.
function doc(...content: AdfNode[]): AdfNode {
  return { type: 'doc', version: 1, content } as AdfNode;
}

function text(value: string, marks?: AdfNode['marks']): AdfNode {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraph(...content: AdfNode[]): AdfNode {
  return { type: 'paragraph', content };
}

describe('adfToMarkdown', () => {
  test('null / undefined doc -> empty string', () => {
    expect(adfToMarkdown(null)).toBe('');
    expect(adfToMarkdown(undefined)).toBe('');
  });

  test('empty content -> empty string', () => {
    expect(adfToMarkdown(doc())).toBe('');
  });

  test('single paragraph renders its inline text', () => {
    expect(adfToMarkdown(doc(paragraph(text('Hello world'))))).toBe('Hello world');
  });

  test('multiple blocks are separated by a blank line', () => {
    const input = doc(paragraph(text('First')), paragraph(text('Second')));
    expect(adfToMarkdown(input)).toBe('First\n\nSecond');
  });

  test('heading levels render hashes, clamping out-of-range levels', () => {
    expect(adfToMarkdown(doc({ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }))).toBe(
      '# Title',
    );
    expect(adfToMarkdown(doc({ type: 'heading', attrs: { level: 3 }, content: [text('Sub')] }))).toBe(
      '### Sub',
    );
    // Default level 1 when attrs absent.
    expect(adfToMarkdown(doc({ type: 'heading', content: [text('NoLevel')] }))).toBe('# NoLevel');
    // Clamp above 6 down to 6.
    expect(adfToMarkdown(doc({ type: 'heading', attrs: { level: 9 }, content: [text('Deep')] }))).toBe(
      '###### Deep',
    );
    // Clamp at-or-below 0 up to 1.
    expect(adfToMarkdown(doc({ type: 'heading', attrs: { level: 0 }, content: [text('Top')] }))).toBe(
      '# Top',
    );
  });

  test('bulletList renders dash markers per item', () => {
    const input = doc({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph(text('Apples'))] },
        { type: 'listItem', content: [paragraph(text('Oranges'))] },
      ],
    });
    expect(adfToMarkdown(input)).toBe('- Apples\n- Oranges');
  });

  test('orderedList renders incrementing numeric markers', () => {
    const input = doc({
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [paragraph(text('Step one'))] },
        { type: 'listItem', content: [paragraph(text('Step two'))] },
        { type: 'listItem', content: [paragraph(text('Step three'))] },
      ],
    });
    expect(adfToMarkdown(input)).toBe('1. Step one\n2. Step two\n3. Step three');
  });

  test('codeBlock renders a fenced block with its language', () => {
    const input = doc({
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [text('const a = 1;')],
    });
    expect(adfToMarkdown(input)).toBe('```typescript\nconst a = 1;\n```');
  });

  test('codeBlock with no language uses a bare fence', () => {
    const input = doc({ type: 'codeBlock', content: [text('plain code')] });
    expect(adfToMarkdown(input)).toBe('```\nplain code\n```');
  });

  test('blockquote prefixes every line with "> " (blank lines trimmed to ">")', () => {
    const input = doc({
      type: 'blockquote',
      content: [paragraph(text('Line one')), paragraph(text('Line two'))],
    });
    expect(adfToMarkdown(input)).toBe('> Line one\n>\n> Line two');
  });

  test('rule renders a thematic break', () => {
    expect(adfToMarkdown(doc({ type: 'rule' }))).toBe('---');
  });

  test('hardBreak inserts a newline within inline content', () => {
    const input = doc(paragraph(text('before'), { type: 'hardBreak' }, text('after')));
    expect(adfToMarkdown(input)).toBe('before\nafter');
  });

  test('strong mark wraps text in double asterisks', () => {
    const input = doc(paragraph(text('bold', [{ type: 'strong' }])));
    expect(adfToMarkdown(input)).toBe('**bold**');
  });

  test('em mark wraps text in underscores', () => {
    const input = doc(paragraph(text('italic', [{ type: 'em' }])));
    expect(adfToMarkdown(input)).toBe('_italic_');
  });

  test('strong + em combine as **_text_**', () => {
    const input = doc(paragraph(text('both', [{ type: 'strong' }, { type: 'em' }])));
    expect(adfToMarkdown(input)).toBe('**_both_**');
  });

  test('code mark wins over strong/em and wraps in backticks', () => {
    const input = doc(
      paragraph(text('inline()', [{ type: 'code' }, { type: 'strong' }, { type: 'em' }])),
    );
    expect(adfToMarkdown(input)).toBe('`inline()`');
  });

  test('strike mark wraps text in double tildes', () => {
    const input = doc(paragraph(text('gone', [{ type: 'strike' }])));
    expect(adfToMarkdown(input)).toBe('~~gone~~');
  });

  test('link mark renders Markdown link with href from attrs', () => {
    const input = doc(
      paragraph(text('Bunkai', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
    );
    expect(adfToMarkdown(input)).toBe('[Bunkai](https://example.com)');
  });

  test('nested list item with marks renders inline formatting', () => {
    const input = doc({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph(
              text('See '),
              text('the docs', [{ type: 'link', attrs: { href: 'https://docs.test' } }]),
              text(' for '),
              text('details', [{ type: 'strong' }]),
            ),
          ],
        },
      ],
    });
    expect(adfToMarkdown(input)).toBe('- See [the docs](https://docs.test) for **details**');
  });

  test('unknown block node flattens to its text', () => {
    const input = doc({ type: 'mention', text: '@alice' });
    expect(adfToMarkdown(input)).toBe('@alice');
  });

  test('unknown block node with content recurses into children', () => {
    const input = doc({ type: 'panel', content: [paragraph(text('Inside a panel'))] });
    expect(adfToMarkdown(input)).toBe('Inside a panel');
  });
});
