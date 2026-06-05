// Pure, framework-agnostic editor-formatting helpers (BK-16 toolbar). No DOM /
// React imports — the editor reads the textarea's selection into a SelectionState,
// calls one of these, and writes the result back. Keeping the transforms pure
// makes the toolbar logic unit-testable without rendering anything.

export interface SelectionState {
  value: string
  selectionStart: number
  selectionEnd: number
}

// Wrap the current selection with `before` / `after` markers (Bold → **sel**).
// With an empty selection the markers are inserted and the caret is placed
// between them so the user can type inside.
export function wrapSelection(state: SelectionState, before: string, after: string): SelectionState {
  const { value, selectionStart, selectionEnd } = state;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  const start = selectionStart + before.length;
  return {
    value: next,
    selectionStart: start,
    selectionEnd: start + selected.length,
  };
}

// Prefix every line touched by the selection (or the caret's line). `prefix` may
// be a constant string (`- `, `## `) or a function of the zero-based line index
// (ordered lists → `1. `, `2. `, …). Selection is expanded to cover the result.
export function prefixLines(
  state: SelectionState,
  prefix: string | ((index: number) => string),
): SelectionState {
  const { value, selectionStart, selectionEnd } = state;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const block = value.slice(lineStart, selectionEnd);
  const prefixed = block
    .split('\n')
    .map((line, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + line)
    .join('\n');
  const next = value.slice(0, lineStart) + prefixed + value.slice(selectionEnd);
  return {
    value: next,
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length,
  };
}

// Insert a Markdown link using the selection as the link text (falling back to
// "text" when nothing is selected), and leave the URL selected for editing.
export function insertLink(state: SelectionState, url: string): SelectionState {
  const { value, selectionStart, selectionEnd } = state;
  const text = value.slice(selectionStart, selectionEnd) || 'text';
  const markup = `[${text}](${url})`;
  const next = value.slice(0, selectionStart) + markup + value.slice(selectionEnd);
  const urlStart = selectionStart + text.length + 3; // past `[text](`
  return {
    value: next,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}

// UTF-8 byte length of a string — the size-cap unit (matches `new Blob([v]).size`
// in the browser without needing the Blob API).
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
