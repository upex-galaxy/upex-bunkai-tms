import type { PageResult } from './export-query';
import { describe, expect, it } from 'bun:test';
import { fetchAllPages } from './export-query';

function ok<T>(data: T[]): PageResult<T> {
  return { data, error: null };
}

describe('fetchAllPages (BK-315, Conductor review PR #207 BLOCKER — PostgREST 1000-row cap)', () => {
  it('returns everything from a single short page without a second fetch', async () => {
    let calls = 0;
    const rows = await fetchAllPages(async (offset, limit) => {
      calls += 1;
      expect(offset).toBe(0);
      expect(limit).toBe(3);
      return ok(['a', 'b']);
    }, 3);
    expect(rows).toEqual(['a', 'b']);
    expect(calls).toBe(1);
  });

  it('pages across three full pages until a short page ends it', async () => {
    const pages = [['a', 'b'], ['c', 'd'], ['e']];
    const offsetsSeen: number[] = [];
    const rows = await fetchAllPages(async (offset) => {
      offsetsSeen.push(offset);
      return ok(pages[offset / 2] ?? []);
    }, 2);
    expect(rows).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(offsetsSeen).toEqual([0, 2, 4]);
  });

  it('fetches one extra empty page when the total is an exact multiple of the page size — proves no row is silently dropped at the boundary', async () => {
    const pages = [['a', 'b'], ['c', 'd']];
    let calls = 0;
    const rows = await fetchAllPages(async (offset) => {
      calls += 1;
      return ok(pages[offset / 2] ?? []);
    }, 2);
    expect(rows).toEqual(['a', 'b', 'c', 'd']);
    expect(calls).toBe(3);
  });

  it('returns an empty array when the Project has zero rows (AC2.1) — one call, no error', async () => {
    let calls = 0;
    const rows = await fetchAllPages(async () => {
      calls += 1;
      return ok([]);
    });
    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });

  it('simulates the reported 1,500-row truncation bug and proves it no longer truncates', async () => {
    const total = 1500;
    const rows = await fetchAllPages(async (offset, limit) => {
      const page = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => offset + i);
      return ok(page);
    });
    expect(rows).toHaveLength(total);
    expect(rows[0]).toBe(0);
    expect(rows[total - 1]).toBe(total - 1);
  });

  it('throws when a page returns an error, instead of returning a partial result', async () => {
    let thrown: unknown;
    try {
      await fetchAllPages(async () => ({ data: null, error: { message: 'boom' } }));
    }
    catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('boom');
  });

  it('defaults to the PostgREST db-max-rows page size (1000)', async () => {
    let capturedLimit = 0;
    await fetchAllPages(async (_offset, limit) => {
      capturedLimit = limit;
      return ok([]);
    });
    expect(capturedLimit).toBe(1000);
  });
});
