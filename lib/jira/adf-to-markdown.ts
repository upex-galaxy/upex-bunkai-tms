// Framework-agnostic ADF (Atlassian Document Format) -> Markdown converter for
// the Jira import worker (BK-17). No React/Next/DB imports — pure recursive
// walker over the ADF node tree Jira returns. This file OWNS the AdfNode types;
// the Jira client imports them.

export interface AdfMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface AdfNode {
  type: string
  content?: AdfNode[]
  text?: string
  marks?: AdfMark[]
  attrs?: Record<string, unknown>
}

// Convert an ADF document to Markdown. Null/undefined or empty content -> ''.
export function adfToMarkdown(doc: AdfNode | null | undefined): string {
  if (!doc) {
    return '';
  }
  return renderBlock(doc).trim();
}

// Render a block-level node to its (possibly multi-line) Markdown string.
function renderBlock(node: AdfNode): string {
  switch (node.type) {
    case 'doc':
      return joinBlocks(node.content);
    case 'paragraph':
      return renderInline(node.content);
    case 'heading':
      return renderHeading(node);
    case 'bulletList':
      return renderList(node, 'bullet');
    case 'orderedList':
      return renderList(node, 'ordered');
    case 'listItem':
      return joinBlocks(node.content);
    case 'codeBlock':
      return renderCodeBlock(node);
    case 'blockquote':
      return renderBlockquote(node);
    case 'rule':
      return '---';
    default:
      return renderUnknownBlock(node);
  }
}

// Join block children separated by a blank line, dropping empties.
function joinBlocks(content: AdfNode[] | undefined): string {
  if (!content || content.length === 0) {
    return '';
  }
  return content
    .map(renderBlock)
    .filter(block => block.length > 0)
    .join('\n\n');
}

function renderHeading(node: AdfNode): string {
  const rawLevel = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
  const level = Math.min(6, Math.max(1, Math.trunc(rawLevel)));
  return `${'#'.repeat(level)} ${renderInline(node.content)}`;
}

function renderList(node: AdfNode, kind: 'bullet' | 'ordered'): string {
  const items = node.content ?? [];
  return items
    .map((item, index) => {
      const marker = kind === 'ordered' ? `${index + 1}. ` : '- ';
      return marker + renderItemInline(item);
    })
    .join('\n');
}

// A list item usually wraps one paragraph; flatten its block children inline so
// the parent list owns the marker.
function renderItemInline(item: AdfNode): string {
  const children = item.content ?? [];
  return children
    .map(renderBlock)
    .filter(block => block.length > 0)
    .join(' ');
}

function renderCodeBlock(node: AdfNode): string {
  const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
  const body = (node.content ?? []).map(child => child.text ?? '').join('');
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

function renderBlockquote(node: AdfNode): string {
  const inner = joinBlocks(node.content);
  return inner
    .split('\n')
    .map(line => `> ${line}`.trimEnd())
    .join('\n');
}

// Unknown block: recurse into content (flattened), or emit its own text.
function renderUnknownBlock(node: AdfNode): string {
  if (node.content && node.content.length > 0) {
    return joinBlocks(node.content);
  }
  return node.text ?? '';
}

// Render inline content (text nodes + hardBreaks) of a block's children.
function renderInline(content: AdfNode[] | undefined): string {
  if (!content || content.length === 0) {
    return '';
  }
  return content.map(renderInlineNode).join('');
}

function renderInlineNode(node: AdfNode): string {
  if (node.type === 'hardBreak') {
    return '\n';
  }
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks);
  }
  // Unknown inline node: recurse, falling back to its own text.
  if (node.content && node.content.length > 0) {
    return renderInline(node.content);
  }
  return node.text ?? '';
}

// Apply marks to a single text node, innermost-first. `code` wins: when present
// it wraps in backticks and suppresses strong/em.
function applyMarks(text: string, marks: AdfMark[] | undefined): string {
  if (!marks || marks.length === 0) {
    return text;
  }
  const has = (type: string): boolean => marks.some(mark => mark.type === type);

  if (has('code')) {
    return `\`${text}\``;
  }

  let result = text;
  if (has('strong') && has('em')) {
    result = `**_${result}_**`;
  }
  else if (has('strong')) {
    result = `**${result}**`;
  }
  else if (has('em')) {
    result = `_${result}_`;
  }
  if (has('strike')) {
    result = `~~${result}~~`;
  }

  const link = marks.find(mark => mark.type === 'link');
  if (link) {
    const href = typeof link.attrs?.href === 'string' ? link.attrs.href : '';
    result = `[${result}](${href})`;
  }

  return result;
}
