// BK-1548 — the Project toolbar Test tag filter's lookup, lifted out of
// `test-tag-filter.tsx` so its outcome is a value the caller cannot misread.
// The lookup is paged (BK-742): it follows `next_cursor` until it is null so
// the explorer is scoped to EVERY matching Test. A failed page (non-2xx, or a
// network error) is reported as `failed`, never as an empty match: an empty id
// set is what "No Tests carry this tag" means. An abort is not a failure — the
// caller started a newer lookup or unmounted — so it is rethrown untouched.

export const TAG_FILTER_PAGE_LIMIT = 50;

export type TagFilterLookupResult
  = | { status: 'complete', ids: string[] }
    | { status: 'failed' };

interface TagFilterPage {
  items?: { id: string }[]
  next_cursor?: string | null
}

export async function lookupTestIdsByTag(tag: string, signal: AbortSignal): Promise<TagFilterLookupResult> {
  const ids: string[] = [];
  let cursor: string | null = null;
  try {
    do {
      const params = new URLSearchParams({ tag, limit: String(TAG_FILTER_PAGE_LIMIT) });
      if (cursor !== null) {
        params.set('cursor', cursor);
      }
      const res = await fetch(`/api/v1/tests?${params}`, { signal });
      if (!res.ok) {
        return { status: 'failed' };
      }
      const body = (await res.json()) as TagFilterPage;
      for (const t of body.items ?? []) {
        ids.push(t.id);
      }
      cursor = body.next_cursor ?? null;
    } while (cursor !== null);
  }
  catch (err) {
    if (signal.aborted) {
      throw err;
    }
    return { status: 'failed' };
  }
  return { status: 'complete', ids };
}
