import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expirePendingRunStepAttachments } from '@lib/supabase/rpc';

// BK-593 - the daily sweep of the storage cleanup outbox (ADR-0019, ADR-0017 shape). Three
// idempotent steps, safe to run twice the same day:
//   1. expire pending uploads whose window lapsed (their rows are deleted, which enqueues
//      their objects through the AFTER DELETE trigger);
//   2. drain the outbox: delete each queued object whose `not_before` has passed from its bucket, mark the row done on
//      success, count an attempt and keep the error on failure (retried by the next sweep,
//      parked after MAX_ATTEMPTS and reported as `stuck`);
//   3. purge outbox rows that finished more than a week ago.
// Removing an object that is already gone is a success in Storage, so a repeat is harmless.
// Plain function taking the service-role client: the route is the only place that builds it.

export const CLEANUP_BATCH = 200;
export const CLEANUP_MAX_ATTEMPTS = 10;
export const CLEANUP_RETENTION_DAYS = 7;

export interface CleanupSweepResult {
  expired_pending: number
  deleted: number
  failed: number
  purged: number
  stuck: number
}

interface QueueRow {
  id: number
  bucket: string
  path: string
  attempts: number
}

type Client = SupabaseClient<Database>;

export async function runStorageCleanupSweep(
  admin: Client,
  opts: { now?: Date, batch?: number } = {},
): Promise<CleanupSweepResult> {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? CLEANUP_BATCH;

  const expired = await expirePendingRunStepAttachments(admin, { limit: 500 });
  if (expired.error) {
    throw new Error(`expire pending uploads failed: ${expired.error.message}`);
  }

  const open = await admin
    .from('storage_cleanup_queue')
    .select('id, bucket, path, attempts')
    .is('done_at', null)
    .lt('attempts', CLEANUP_MAX_ATTEMPTS)
    // Held-back entries (a signed upload URL could still recreate the object) wait for their turn.
    .lte('not_before', now.toISOString())
    .order('id', { ascending: true })
    .limit(batch);
  if (open.error) {
    throw new Error(`read cleanup queue failed: ${open.error.message}`);
  }

  let deleted = 0;
  let failed = 0;
  const byBucket = new Map<string, QueueRow[]>();
  for (const row of (open.data ?? []) as QueueRow[]) {
    byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);
  }
  for (const [bucket, rows] of byBucket) {
    const outcome = await removeFromBucket(admin, bucket, rows.map(r => r.path));
    if (outcome === null) {
      const done = await admin.from('storage_cleanup_queue').update({ done_at: now.toISOString() }).in('id', rows.map(r => r.id));
      if (done.error) {
        throw new Error(`mark cleanup rows done failed: ${done.error.message}`);
      }
      deleted += rows.length;
    }
    else {
      // The whole batch for this bucket failed: count the attempt on every row. Rows share
      // one error, so they are updated one by one only because `attempts` differs per row.
      for (const row of rows) {
        await admin.from('storage_cleanup_queue').update({ attempts: row.attempts + 1, last_error: outcome.slice(0, 500) }).eq('id', row.id);
      }
      failed += rows.length;
    }
  }

  const cutoff = new Date(now.getTime() - CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const purge = await admin.from('storage_cleanup_queue').delete({ count: 'exact' }).not('done_at', 'is', null).lt('done_at', cutoff);

  const stuck = await admin
    .from('storage_cleanup_queue')
    .select('id', { count: 'exact', head: true })
    .is('done_at', null)
    .gte('attempts', CLEANUP_MAX_ATTEMPTS);

  return {
    expired_pending: typeof expired.data === 'number' ? expired.data : 0,
    deleted,
    failed,
    purged: purge.count ?? 0,
    stuck: stuck.count ?? 0,
  };
}

// null on success, otherwise the error text.
async function removeFromBucket(admin: Client, bucket: string, paths: string[]): Promise<string | null> {
  try {
    const { error } = await admin.storage.from(bucket).remove(paths);
    return error ? error.message : null;
  }
  catch (err) {
    return err instanceof Error ? err.message : 'storage remove threw';
  }
}
