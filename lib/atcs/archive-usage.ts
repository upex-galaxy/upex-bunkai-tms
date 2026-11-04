// BK-571 — the "N Tests chain this ATC" copy of the archive confirmation. Pure,
// framework-agnostic; unit-tested in `archive-usage.test.ts`. The warning must
// name real usage before anything is written, and it never blocks the action,
// so the list is bounded for display only.

export const ARCHIVE_USAGE_LIST_CAP = 5;

export interface BoundedTitles {
  shown: string[]
  more: number
}

// Up to `cap` titles, then how many were left out ("and {more} more").
export function boundUsageTitles(titles: readonly string[], cap: number = ARCHIVE_USAGE_LIST_CAP): BoundedTitles {
  const shown = titles.slice(0, cap);
  return { shown, more: titles.length - shown.length };
}

export const ARCHIVE_NO_USAGE_COPY = 'No Test chains this ATC.';
export const ARCHIVE_USAGE_KEEP_COPY = 'Those Tests keep this ATC in their chains.';

// 1 -> "1 Test chains this ATC."   N -> "N Tests chain this ATC."
export function archiveUsageHeadline(count: number): string {
  if (count <= 0) { return ARCHIVE_NO_USAGE_COPY; }
  return count === 1 ? '1 Test chains this ATC.' : `${count} Tests chain this ATC.`;
}

export function archiveMoreCopy(more: number): string {
  return `and ${more} more`;
}
