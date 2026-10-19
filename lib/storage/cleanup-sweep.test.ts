import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { CLEANUP_MAX_ATTEMPTS, runStorageCleanupSweep } from './cleanup-sweep';

// BK-593 - the outbox sweep against a recording fake. The real queue and the trigger that feeds
// it are lib/runs/step-attachments-isolation.test.ts; the real bucket is pending-apply of 0097.

interface Update { values: Record<string, unknown>, column: string, value: unknown }

function fake(opts: {
  rows?: Array<{ id: number, bucket: string, path: string, attempts: number }>
  expired?: number | { message: string }
  removeError?: (bucket: string, paths: string[]) => string | null
  purged?: number
  stuck?: number
}) {
  const removes: Array<{ bucket: string, paths: string[] }> = [];
  const updates: Update[] = [];
  const queries: string[] = [];
  const selectFilters: string[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      queries.push(`rpc:${fn}:${JSON.stringify(args)}`);
      if (typeof opts.expired === 'object') { return { data: null, error: opts.expired }; }
      return { data: opts.expired ?? 0, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removes.push({ bucket, paths });
          const message = opts.removeError?.(bucket, paths) ?? null;
          return message ? { data: null, error: { message } } : { data: [], error: null };
        },
      }),
    },
    from: (table: string) => {
      const state: { op: string, values?: Record<string, unknown>, head?: boolean } = { op: 'select' };
      const builder: Record<string, unknown> = {};
      builder.select = (_cols: string, o?: { head?: boolean }) => { state.head = o?.head; return builder; };
      builder.update = (values: Record<string, unknown>) => { state.op = 'update'; state.values = values; return builder; };
      builder.delete = () => { state.op = 'delete'; return builder; };
      builder.is = (c: string) => { selectFilters.push(`is:${c}`); return builder; };
      builder.not = () => builder;
      builder.lt = (c: string) => { selectFilters.push(`lt:${c}`); return builder; };
      builder.lte = (c: string, v: unknown) => { selectFilters.push(`lte:${c}:${String(v)}`); return builder; };
      builder.gte = (c: string) => { selectFilters.push(`gte:${c}`); return builder; };
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.in = async (column: string, value: unknown) => { updates.push({ values: state.values ?? {}, column, value }); return Promise.resolve({ error: null }); };
      builder.eq = async (column: string, value: unknown) => { updates.push({ values: state.values ?? {}, column, value }); return Promise.resolve({ error: null }); };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table !== 'storage_cleanup_queue') { return resolve({ data: null, error: null }); }
        if (state.op === 'delete') { return resolve({ count: opts.purged ?? 0, error: null }); }
        if (state.head) { return resolve({ count: opts.stuck ?? 0, error: null }); }
        return resolve({ data: opts.rows ?? [], error: null });
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, removes, updates, queries, selectFilters };
}

describe('runStorageCleanupSweep', () => {
  it('expires stale pending uploads first, then deletes the queued objects and marks them done', async () => {
    const f = fake({
      expired: 3,
      rows: [
        { id: 1, bucket: 'run-evidence', path: 'w/r/s/a', attempts: 0 },
        { id: 2, bucket: 'run-evidence', path: 'w/r/s/b', attempts: 2 },
      ],
      purged: 4,
      stuck: 1,
    });
    const now = new Date('2026-10-20T03:00:00Z');
    const result = await runStorageCleanupSweep(f.client, { now });
    expect(f.queries[0]).toContain('bunkai_expire_pending_run_step_attachments');
    expect(f.removes).toEqual([{ bucket: 'run-evidence', paths: ['w/r/s/a', 'w/r/s/b'] }]);
    expect(f.updates).toEqual([{ values: { done_at: now.toISOString() }, column: 'id', value: [1, 2] }]);
    expect(result).toEqual({ expired_pending: 3, deleted: 2, failed: 0, purged: 4, stuck: 1 });
    // only open rows below the attempt cap are read
    expect(f.selectFilters).toContain('is:done_at');
    expect(f.selectFilters).toContain('lt:attempts');
    // held-back entries (not_before in the future) are not read
    expect(f.selectFilters).toContain(`lte:not_before:${now.toISOString()}`);
  });

  it('keeps a failed batch queued: counts an attempt per row and records the error, never marks done', async () => {
    const f = fake({
      rows: [{ id: 7, bucket: 'run-evidence', path: 'p', attempts: 4 }],
      removeError: () => 'storage is down',
    });
    const result = await runStorageCleanupSweep(f.client);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(1);
    expect(f.updates).toEqual([{ values: { attempts: 5, last_error: 'storage is down' }, column: 'id', value: 7 }]);
  });

  it('keeps going with the other buckets when one bucket fails', async () => {
    const f = fake({
      rows: [
        { id: 1, bucket: 'other', path: 'x', attempts: 0 },
        { id: 2, bucket: 'run-evidence', path: 'y', attempts: 0 },
      ],
      removeError: bucket => (bucket === 'other' ? 'boom' : null),
    });
    const result = await runStorageCleanupSweep(f.client);
    expect([result.deleted, result.failed]).toEqual([1, 1]);
    expect(f.removes.map(r => r.bucket)).toEqual(['other', 'run-evidence']);
  });

  it('does nothing harmful on an empty queue (repeat run the same day)', async () => {
    const f = fake({});
    const result = await runStorageCleanupSweep(f.client);
    expect(result).toEqual({ expired_pending: 0, deleted: 0, failed: 0, purged: 0, stuck: 0 });
    expect(f.removes).toHaveLength(0);
    expect(f.updates).toHaveLength(0);
  });

  it('surfaces an expiry failure instead of draining on top of it', async () => {
    const f = fake({ expired: { message: 'permission denied' } });
    let message = '';
    try {
      await runStorageCleanupSweep(f.client);
    }
    catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('permission denied');
    expect(f.removes).toHaveLength(0);
  });

  it('parks rows at the attempt cap (exposed as a constant the stuck count uses)', () => {
    expect(CLEANUP_MAX_ATTEMPTS).toBe(10);
  });
});
