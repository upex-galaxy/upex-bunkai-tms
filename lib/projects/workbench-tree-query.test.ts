import type { Atc } from '@lib/types';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import {
  batchIds,
  fetchExplorerTests,
  fetchTreeAcceptanceCriteria,
  fetchTreeAtcs,
  fetchTreeModules,
  fetchTreeStories,
  TREE_ATC_COLUMNS,
  TREE_IN_FILTER_BATCH,
} from './workbench-tree-query';

// BK-1233 — the workbench tree loaders. The paging loop itself
// (`fetchAllPages`) is covered by `lib/atcs/export-query.test.ts`; this suite
// pins what each loader asks PostgREST for: ranged windows, a primary-key
// tiebreak in the ordering, the soft-delete filter, batched `.in()` lists,
// and a loud failure on a mid-way page error.

interface Call {
  table: string
  ops: Array<[string, ...unknown[]]>
}

interface FakeOptions {
  // Total rows the table holds for one request (per `.in()` batch).
  total: (call: Call) => number
  // Fail the request whose range starts at this offset.
  failAtOffset?: number
}

function fakeDb({ total, failAtOffset }: FakeOptions) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder = {
        select: (...args: unknown[]) => { call.ops.push(['select', ...args]); return builder; },
        eq: (...args: unknown[]) => { call.ops.push(['eq', ...args]); return builder; },
        in: (...args: unknown[]) => { call.ops.push(['in', ...args]); return builder; },
        is: (...args: unknown[]) => { call.ops.push(['is', ...args]); return builder; },
        order: (...args: unknown[]) => { call.ops.push(['order', ...args]); return builder; },
        range: async (from: number, to: number) => {
          call.ops.push(['range', from, to]);
          if (failAtOffset === from) {
            return { data: null, error: { message: `page at ${from} failed` } };
          }
          const n = total(call);
          const length = Math.max(0, Math.min(to + 1, n) - from);
          const batchTag = String((call.ops.find(op => op[0] === 'in')?.[2] as string[] | undefined)?.[0] ?? '');
          const data = Array.from({ length }, (_, i) => ({ id: `${batchTag}${from + i}` }));
          return { data, error: null };
        },
      };
      return builder;
    },
  };
  return { calls, db: db as unknown as SupabaseClient<Database> };
}

const ops = (call: Call, name: string) => call.ops.filter(op => op[0] === name);
const ranges = (calls: Call[]) => calls.map(c => ops(c, 'range')[0]?.slice(1));

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  }
  catch (error) {
    return error as Error;
  }
  throw new Error('expected the loader to reject');
}

describe('BK-1233 — fetchTreeAtcs (the workbench ATC tree read)', () => {
  it('returns every live ATC of a Project past the 1000-row cap (the 5001-ATC repro)', async () => {
    const { calls, db } = fakeDb({ total: () => 5001 });
    const atcs = await fetchTreeAtcs(db, 'project-1');

    expect(atcs).toHaveLength(5001);
    expect(new Set(atcs.map(a => a.id)).size).toBe(5001);
    expect(ranges(calls)).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999], [5000, 5999]]);
  });

  it('scopes to the Project, drops archived ATCs, and orders by creation with an id tiebreak', async () => {
    const { calls, db } = fakeDb({ total: () => 1 });
    await fetchTreeAtcs(db, 'project-1');

    const [call] = calls;
    expect(call.table).toBe('atcs');
    expect(ops(call, 'eq')).toEqual([['eq', 'project_id', 'project-1']]);
    expect(ops(call, 'is')).toEqual([['is', 'archived_at', null]]);
    expect(ops(call, 'order')).toEqual([
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ]);
  });

  it('fetches one extra, empty page when the total is an exact multiple of the page size', async () => {
    const { calls, db } = fakeDb({ total: () => 2000 });
    expect(await fetchTreeAtcs(db, 'project-1')).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it('returns an empty list for a Project with no ATCs, in one request', async () => {
    const { calls, db } = fakeDb({ total: () => 0 });
    expect(await fetchTreeAtcs(db, 'project-1')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('throws when a page fails mid-way instead of rendering a truncated tree', async () => {
    const { db } = fakeDb({ total: () => 3000, failAtOffset: 1000 });
    const error = await rejection(fetchTreeAtcs(db, 'project-1'));
    expect(error.message).toBe('page at 1000 failed');
  });

  it('selects exactly the Atc fields — never `*`, so the search tsvector stays out of the payload', async () => {
    const { calls, db } = fakeDb({ total: () => 0 });
    await fetchTreeAtcs(db, 'project-1');
    expect(ops(calls[0], 'select')).toEqual([['select', TREE_ATC_COLUMNS]]);

    const atcFields: Record<keyof Atc, true> = {
      id: true,
      project_id: true,
      module_id: true,
      user_story_id: true,
      slug: true,
      title: true,
      layer: true,
      version: true,
      status: true,
      tags: true,
      technique: true,
      priority: true,
      created_at: true,
      updated_at: true,
      archived_at: true,
    };
    const selected = TREE_ATC_COLUMNS.split(',').map(c => c.trim());
    expect([...selected].sort()).toEqual(Object.keys(atcFields).sort());
    expect(selected).not.toContain('tsv');
  });
});

describe('BK-1233 — the sibling tree reads are paged too', () => {
  it('fetchTreeModules pages live modules in position order with an id tiebreak', async () => {
    const { calls, db } = fakeDb({ total: () => 1001 });
    expect(await fetchTreeModules(db, 'project-1')).toHaveLength(1001);
    expect(calls).toHaveLength(2);
    expect(ops(calls[0], 'is')).toEqual([['is', 'archived_at', null]]);
    expect(ops(calls[0], 'order')).toEqual([
      ['order', 'position', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ]);
  });

  it('fetchExplorerTests pages the workspace Tests newest first with an id tiebreak', async () => {
    const { calls, db } = fakeDb({ total: () => 1500 });
    expect(await fetchExplorerTests(db, 'workspace-1')).toHaveLength(1500);
    expect(ops(calls[0], 'eq')).toEqual([['eq', 'workspace_id', 'workspace-1']]);
    expect(ops(calls[0], 'order')).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
  });

  it('fetchTreeStories sends module ids in batches and pages each batch', async () => {
    const moduleIds = Array.from({ length: TREE_IN_FILTER_BATCH * 2 + 5 }, (_, i) => `m${i}-`);
    // First batch holds 1200 stories (two pages), the others hold 3 each.
    const { calls, db } = fakeDb({
      total: call => ((ops(call, 'in')[0]?.[2] as string[])[0] === 'm0-' ? 1200 : 3),
    });
    const stories = await fetchTreeStories(db, moduleIds);

    expect(stories).toHaveLength(1200 + 3 + 3);
    const inLists = calls.map(c => ops(c, 'in')[0]?.[2] as string[]);
    expect(new Set(inLists.map(l => l.length))).toEqual(new Set([TREE_IN_FILTER_BATCH, 5]));
    expect(new Set(inLists.flat())).toEqual(new Set(moduleIds));
    for (const call of calls) {
      expect(ops(call, 'in')[0]?.[1]).toBe('module_id');
      expect(ops(call, 'is')).toEqual([['is', 'archived_at', null]]);
      expect(ops(call, 'order').at(-1)).toEqual(['order', 'id', { ascending: true }]);
    }
  });

  it('fetchTreeStories makes no request when there are no live modules', async () => {
    const { calls, db } = fakeDb({ total: () => 0 });
    expect(await fetchTreeStories(db, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('fetchTreeAcceptanceCriteria batches story ids and drops archived ACs', async () => {
    const storyIds = Array.from({ length: 839 }, (_, i) => `s${i}-`);
    const { calls, db } = fakeDb({ total: () => 2 });
    const acs = await fetchTreeAcceptanceCriteria(db, storyIds);

    expect(acs).toHaveLength(9 * 2);
    expect(calls).toHaveLength(9);
    for (const call of calls) {
      expect(call.table).toBe('acceptance_criteria');
      expect(ops(call, 'in')[0]?.[1]).toBe('user_story_id');
      expect((ops(call, 'in')[0]?.[2] as string[]).length).toBeLessThanOrEqual(TREE_IN_FILTER_BATCH);
      expect(ops(call, 'is')).toEqual([['is', 'archived_at', null]]);
    }
  });

  it('fetchTreeAcceptanceCriteria throws when any batch fails', async () => {
    const { db } = fakeDb({ total: () => 1500, failAtOffset: 1000 });
    const error = await rejection(fetchTreeAcceptanceCriteria(db, ['s1', 's2']));
    expect(error.message).toBe('page at 1000 failed');
  });
});

describe('batchIds', () => {
  it('splits into fixed-size batches and keeps every id once, in order', () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    const batches = batchIds(ids);
    expect(batches.map(b => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(ids);
  });

  it('returns no batch for an empty list', () => {
    expect(batchIds([])).toEqual([]);
  });
});
