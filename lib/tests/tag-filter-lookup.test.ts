import { afterEach, describe, expect, it } from 'bun:test';
import { lookupTestIdsByTag, TAG_FILTER_PAGE_LIMIT } from './tag-filter-lookup';

// BK-1548 — the Project toolbar Test tag filter said "No Tests carry this tag"
// when a later page of the paged lookup failed (the failure path wrote an empty
// id set, the same value as a real no-match), and a network-level failure left
// the explorer unfiltered under a filter that held the tag. The lookup now
// returns `failed` for both, `complete` only when every page answered. Only the
// network boundary (`fetch`) is faked.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type PageAnswer = { items: { id: string }[], next_cursor: string | null } | number | 'network';

// Answers the Nth request with the Nth entry: a page body, an HTTP status, or a
// thrown network error. Records every requested URL.
function fakeLookup(answers: PageAnswer[]) {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    const answer = answers[urls.length - 1];
    if (answer === 'network') {
      throw new TypeError('Failed to fetch');
    }
    if (typeof answer === 'number') {
      return new Response('{}', { status: answer });
    }
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return urls;
}

const page = (ids: string[], next: string | null) => ({ items: ids.map(id => ({ id })), next_cursor: next });

describe('lookupTestIdsByTag', () => {
  it('follows every page and returns the whole match', async () => {
    const urls = fakeLookup([page(['a', 'b'], 'c1'), page(['c'], 'c2'), page(['d'], null)]);
    const result = await lookupTestIdsByTag('bk742-n101', new AbortController().signal);
    expect(result).toEqual({ status: 'complete', ids: ['a', 'b', 'c', 'd'] });
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`/api/v1/tests?tag=bk742-n101&limit=${TAG_FILTER_PAGE_LIMIT}`);
    expect(urls[1]).toContain('cursor=c1');
    expect(urls[2]).toContain('cursor=c2');
  });

  it('returns an empty complete match only when the lookup finished with no Test', async () => {
    fakeLookup([page([], null)]);
    expect(await lookupTestIdsByTag('unused', new AbortController().signal)).toEqual({ status: 'complete', ids: [] });
  });

  it('reports a failed later page as a failure, never as a partial or empty match', async () => {
    const urls = fakeLookup([page(['a', 'b'], 'c1'), 500]);
    expect(await lookupTestIdsByTag('bk742-n101', new AbortController().signal)).toEqual({ status: 'failed' });
    expect(urls).toHaveLength(2);
  });

  it('reports a failed first page as a failure', async () => {
    fakeLookup([500]);
    expect(await lookupTestIdsByTag('bk742-n101', new AbortController().signal)).toEqual({ status: 'failed' });
  });

  it('reports a rate-limited page as a failure', async () => {
    fakeLookup([page(['a'], 'c1'), 429]);
    expect(await lookupTestIdsByTag('bk742-n101', new AbortController().signal)).toEqual({ status: 'failed' });
  });

  it('reports a network-level failure as a failure instead of leaving the old scope', async () => {
    fakeLookup([page(['a'], 'c1'), 'network']);
    expect(await lookupTestIdsByTag('bk742-n101', new AbortController().signal)).toEqual({ status: 'failed' });
  });

  it('rethrows an abort so a superseded lookup writes nothing', async () => {
    const controller = new AbortController();
    globalThis.fetch = (async () => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    }) as unknown as typeof fetch;
    const outcome = await lookupTestIdsByTag('bk742-n101', controller.signal).then(
      () => 'resolved',
      (err: unknown) => (err instanceof DOMException ? err.name : 'other'),
    );
    expect(outcome).toBe('AbortError');
  });
});
