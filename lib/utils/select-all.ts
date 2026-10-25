// PostgREST silently caps every un-ranged select at 1000 rows (the project's
// `max_rows`). Integration suites that scan whole tables for a fixture must
// page through them, or they work from a truncated, internally inconsistent
// snapshot as the shared DB grows. Agnostic helper: takes a page fetcher so it
// never depends on a particular Supabase client type.
const PAGE_SIZE = 1000;

interface PageResult<T> { data: T[] | null, error: { message: string } | null }

export async function selectAll<T>(
  fetchPage: (range: { from: number, to: number }) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage({ from, to: from + PAGE_SIZE - 1 });
    if (error) { throw new Error(error.message); }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) { return rows; }
  }
}
