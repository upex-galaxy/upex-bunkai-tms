// A plain text table for people. Columns are padded to the widest cell; a
// cell longer than `maxWidth` is cut with an ellipsis so one long title cannot
// push the other columns off screen.

export function renderTable(headers: string[], rows: string[][], maxWidth = 80): string {
  const clip = (cell: string) => {
    const flat = cell.replace(/\s+/g, ' ').trim();
    return flat.length > maxWidth ? `${flat.slice(0, maxWidth - 1)}…` : flat;
  };
  const cells = [headers, ...rows].map(row => row.map(clip));
  const widths = headers.map((_, col) => Math.max(...cells.map(row => (row[col] ?? '').length)));
  return `${cells
    .map(row => row.map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col] ?? 0))).join('  ').trimEnd())
    .join('\n')}\n`;
}
