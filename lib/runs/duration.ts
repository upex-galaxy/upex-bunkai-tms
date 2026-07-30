// BK-37 — render a Run's elapsed time for the history table. Duration is NOT
// stored or returned by the API: `started_at` + `finished_at` are, and this pure
// helper formats the delta. Keeping it out of SQL makes the format unit-testable
// and changeable without a migration.
//
// Format (the leading unit is unpadded, the trailing unit is zero-padded to 2 so
// a column of durations stays aligned):
//
//   < 1 minute   `12s`      seconds only
//   < 1 hour     `3m 41s`   minutes + zero-padded seconds
//   >= 1 hour    `1h 04m`   hours + zero-padded minutes (seconds dropped — at
//                           that scale they are noise)
//
// Returns null when the Run has no `finished_at` (still running — history never
// shows those) or when either timestamp is unparseable. Silent-fail is the repo
// contract for utilities: a formatting helper must never break a table render.

export function formatRunDuration(startedAt: string, finishedAt: string | null): string | null {
  if (finishedAt === null) {
    return null;
  }

  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }

  // Clock skew between writers could yield a negative delta; floor at zero
  // rather than rendering a nonsense negative duration.
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${pad2(totalSeconds % 60)}s`;
  }

  return `${Math.floor(totalMinutes / 60)}h ${pad2(totalMinutes % 60)}m`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
