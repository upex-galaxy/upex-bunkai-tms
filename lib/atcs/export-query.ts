// BK-315 — Conductor review of PR #207, BLOCKER: PostgREST caps a single REST
// read at `db-max-rows` (empirically confirmed 1000 against this project's own
// API: `Range: 0-99999` came back `content-range: 0-999/2948`). A bare
// `.select()` with no `.range()` silently truncates any Project with more
// than 1000 non-archived ATCs — HTTP 200, a partial file, no signal — which
// breaks AC5.1/5.2/5.3 and the story's own §5 D36 "no row cap" ruling.
//
// `fetchAllPages` pages a read to completion. Deliberately decoupled from the
// Supabase client's chain shape — it takes a plain `(offset, limit) =>
// Promise<page>` closure — so it is unit-testable without a live DB or a
// 1000+-row fixture: the caller supplies canned pages in a test.

export const ATCS_EXPORT_PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<PageResult<T>>,
  pageSize: number = ATCS_EXPORT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await fetchPage(offset, pageSize);
    if (error) {
      throw new Error(error.message);
    }
    const page = data ?? [];
    rows.push(...page);
    hasMore = page.length === pageSize;
    offset += pageSize;
  }
  return rows;
}
