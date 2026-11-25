// A plain text table for people. Columns are padded to the widest cell; a
// cell longer than `maxWidth` is cut with an ellipsis so one long title cannot
// push the other columns off screen.
//
// Titles and Module paths are written by other Workspace members, so a cell
// is printed only after its control characters (C0, DEL, C1) are dropped: an
// ESC sequence in a title must never move the cursor, clear the screen or
// rename the terminal of whoever runs `atc list`. `--json` needs no such step,
// JSON.stringify already escapes them.

const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

function isPrintable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x20 && (code < 0x7F || code > 0x9F) && !BIDI_CONTROLS.test(char);
}

export function printable(text: string): string {
  return Array.from(text.replace(/\s+/g, ' ')).filter(isPrintable).join('').trim();
}

export function renderTable(headers: string[], rows: string[][], maxWidth = 80): string {
  const clip = (cell: string) => {
    const flat = printable(cell);
    return flat.length > maxWidth ? `${flat.slice(0, maxWidth - 1)}…` : flat;
  };
  const cells = [headers, ...rows].map(row => row.map(clip));
  const widths = headers.map((_, col) => Math.max(...cells.map(row => (row[col] ?? '').length)));
  return `${cells
    .map(row => row.map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col] ?? 0))).join('  ').trimEnd())
    .join('\n')}\n`;
}
