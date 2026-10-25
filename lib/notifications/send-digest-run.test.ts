import type { DigestCandidateRow } from './digest-grouping';
import { beforeEach, describe, expect, test } from 'bun:test';
import { EMAILED_STAMP_CHUNK_SIZE, isValidCronSecret, runDigestSend } from './send-digest-run';

// BK-214 — unit test for `send-digest-run.ts`'s own logic (CRON_SECRET
// compare, claim-before-send, per-recipient success/failure isolation,
// same-day re-invocation skip). Every collaborator is a plain fake object
// passed directly to `runDigestSend` — no `mock.module` for `@lib/supabase/
// admin` or `@lib/mail/resend-client`, which would leak into every OTHER
// test file that runs later in the same `bun test` process and calls
// `createAdminClient()` for its own real-DB work (see this module's own
// header comment). The DB-level candidate-selection logic itself
// (membership/retention/preference/entity filtering) is proven separately
// and for real against Postgres in
// `notification-digest-candidates-isolation.test.ts`.

describe('isValidCronSecret', () => {
  test('accepts a matching Bearer secret', () => {
    expect(isValidCronSecret('Bearer s3cr3t', 's3cr3t')).toBe(true);
  });

  test('rejects a missing header', () => {
    expect(isValidCronSecret(null, 's3cr3t')).toBe(false);
  });

  test('rejects a non-Bearer header', () => {
    expect(isValidCronSecret('Basic s3cr3t', 's3cr3t')).toBe(false);
  });

  test('rejects a wrong secret', () => {
    expect(isValidCronSecret('Bearer wrong', 's3cr3t')).toBe(false);
  });

  test('rejects a secret of different length (no throw from timingSafeEqual)', () => {
    expect(isValidCronSecret('Bearer short', 'a-much-longer-secret')).toBe(false);
  });
});

function candidate(overrides: Partial<DigestCandidateRow>): DigestCandidateRow {
  return {
    recipient_user_id: 'user-1',
    recipient_email: 'user1@example.com',
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    project_name: 'Bunkai Web',
    project_slug: 'bunkai-web',
    notification_id: 'notif-1',
    event_type: 'bug.assigned',
    entity_type: 'bug',
    entity_id: 'bug-1',
    payload: { title: 'Some bug' },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Minimal in-memory fake covering exactly the `.rpc()`/`.from(...)` shapes
// `runDigestSend` calls — not a general-purpose Supabase double.
interface LogRow { id: string, user_id: string, digest_date: string, status: string, notification_count: number, error: string | null }
// BK-1217 — the slice of `notifications` the runner stamps after a send.
interface NotificationRow { id: string, in_app_suppressed: boolean, emailed_at: string | null }
type StampMode = 'ok' | 'error' | 'throw';

function fakeAdminClient(candidateRows: DigestCandidateRow[], notifications: NotificationRow[] = [], stampMode: StampMode = 'ok') {
  const log: LogRow[] = [];
  const stampCalls: { ids: string[], filters: [string, unknown][] }[] = [];
  let idSeq = 0;

  // A real (if tiny) filter: `.in('id', ids).eq('in_app_suppressed', true)`
  // is applied to the rows, so a runner that stamped a visible row, or
  // skipped the suppression filter, would be caught by the assertions below.
  function notificationsTable() {
    return {
      update: (patch: { emailed_at: string }) => ({
        in: (column: string, ids: string[]) => ({
          eq: async (filterColumn: string, value: unknown) => {
            stampCalls.push({ ids: [...ids], filters: [[column, ids], [filterColumn, value]] });
            if (stampMode === 'throw') {
              throw new Error('network down');
            }
            if (stampMode === 'error') {
              return { error: { message: 'stamp failed' } };
            }
            for (const row of notifications) {
              if (ids.includes(row.id) && (row as unknown as Record<string, unknown>)[filterColumn] === value) {
                row.emailed_at = patch.emailed_at;
              }
            }
            return { error: null };
          },
        }),
      }),
    };
  }

  const client = {
    rpc: async (name: string) => {
      if (name !== 'bunkai_notification_digest_candidates') {
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      }
      return { data: candidateRows, error: null };
    },
    from: (table: string) => {
      if (table === 'notifications') {
        return notificationsTable();
      }
      if (table !== 'notification_digest_log') {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        insert: (row: { user_id: string, digest_date: string }) => ({
          select: () => ({
            single: async () => {
              if (log.some(r => r.user_id === row.user_id && r.digest_date === row.digest_date)) {
                return { data: null, error: { code: '23505', message: 'duplicate key' } };
              }
              idSeq += 1;
              const inserted: LogRow = { id: `log-${idSeq}`, user_id: row.user_id, digest_date: row.digest_date, status: 'pending', notification_count: 0, error: null };
              log.push(inserted);
              return { data: { id: inserted.id }, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            const row = log.find(r => r.id === id);
            if (row) { Object.assign(row, patch); }
            return { error: null };
          },
        }),
      };
    },
  };

  return { client, log, stampCalls };
}

describe('runDigestSend', () => {
  let sendResults: Record<string, { ok: true } | { ok: false, error: string }>;

  beforeEach(() => {
    sendResults = {};
  });

  const sendMail = async ({ to }: { to: string, subject: string, html: string }) => sendResults[to] ?? { ok: true as const };

  test('sends one email per eligible recipient and marks the log row sent', async () => {
    const { client, log } = fakeAdminClient([candidate({ recipient_user_id: 'user-1', recipient_email: 'user1@example.com' })]);

    const result = await runDigestSend(client as never, sendMail);

    expect(result).toEqual({ eligible_users: 1, sent: 1, failed: 0, skipped: 0 });
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('sent');
    expect(log[0].notification_count).toBe(1);
  });

  test('marks the log row failed when the mailer fails, without aborting other recipients', async () => {
    const { client, log } = fakeAdminClient([
      candidate({ recipient_user_id: 'user-1', recipient_email: 'user1@example.com', notification_id: 'n1' }),
      candidate({ recipient_user_id: 'user-2', recipient_email: 'user2@example.com', notification_id: 'n2' }),
    ]);
    sendResults = { 'user1@example.com': { ok: false, error: 'resend_not_configured' } };

    const result = await runDigestSend(client as never, sendMail);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    const failedRow = log.find(r => r.status === 'failed')!;
    expect(failedRow.error).toBe('resend_not_configured');
  });

  test('same-day re-invocation skips an already-claimed recipient without sending twice', async () => {
    const { client } = fakeAdminClient([candidate({ recipient_user_id: 'user-1', recipient_email: 'user1@example.com' })]);
    const now = new Date();

    const first = await runDigestSend(client as never, sendMail, now);
    expect(first.sent).toBe(1);

    const second = await runDigestSend(client as never, sendMail, now);
    expect(second).toEqual({ eligible_users: 1, sent: 0, failed: 0, skipped: 1 });
  });

  test('zero candidates -> zero sends, zero claims', async () => {
    const { client, log } = fakeAdminClient([]);
    const result = await runDigestSend(client as never, sendMail);
    expect(result).toEqual({ eligible_users: 0, sent: 0, failed: 0, skipped: 0 });
    expect(log).toHaveLength(0);
  });

  test('throws when the candidates RPC itself errors', async () => {
    const { client } = fakeAdminClient([]);
    const brokenClient = { ...client, rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    let caught: unknown;
    try {
      await runDigestSend(brokenClient as never, sendMail);
    }
    catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Failed to load digest candidates: boom');
  });
});

// BK-1217 — email-only rows (In-app off + Email on) are digested once: after a
// SUCCESSFUL send the runner stamps `emailed_at` on that user's suppressed
// candidates, which `bunkai_notification_digest_candidates()` (0107) then
// excludes. The DB side of the predicate is proven for real in
// `notification-digest-candidates-isolation.test.ts`.
describe('runDigestSend — emailed_at stamping (BK-1217)', () => {
  let sendResults: Record<string, { ok: true } | { ok: false, error: string }>;

  beforeEach(() => {
    sendResults = {};
  });

  const sendMail = async ({ to }: { to: string, subject: string, html: string }) => sendResults[to] ?? { ok: true as const };

  test('a successful send stamps every suppressed candidate of that user, including overflow past the 5-per-project cap, and never a visible one', async () => {
    // 7 rows in ONE project: the grouped digest shows 5 and folds 2 into
    // "and 2 more". Odd rows are email-only, even rows are visible.
    const rows = Array.from({ length: 7 }, (_, i) => candidate({ notification_id: `n${i}`, created_at: new Date(Date.now() - i * 60_000).toISOString() }));
    const notifications = rows.map((r, i) => ({ id: r.notification_id, in_app_suppressed: i % 2 === 1, emailed_at: null }));
    const { client, log, stampCalls } = fakeAdminClient(rows, notifications);

    const result = await runDigestSend(client as never, sendMail);

    expect(result).toEqual({ eligible_users: 1, sent: 1, failed: 0, skipped: 0 });
    expect(log[0].status).toBe('sent');
    expect(log[0].notification_count).toBe(7);
    // The stamp is scoped by the suppression flag, never by id alone.
    expect(stampCalls).toHaveLength(1);
    expect(stampCalls[0].filters[1]).toEqual(['in_app_suppressed', true]);
    expect(stampCalls[0].ids.sort()).toEqual(rows.map(r => r.notification_id).sort());
    // Overflow rows n5/n6 are beyond the cap: n5 is suppressed and stamped too.
    const stamped = notifications.filter(n => n.emailed_at !== null).map(n => n.id).sort();
    expect(stamped).toEqual(['n1', 'n3', 'n5']);
    expect(notifications.filter(n => !n.in_app_suppressed).every(n => n.emailed_at === null)).toBe(true);
  });

  test('a failed send stamps nothing, so tomorrow\'s run reconsiders the rows', async () => {
    const rows = [candidate({ notification_id: 'n1' })];
    const notifications = [{ id: 'n1', in_app_suppressed: true, emailed_at: null }];
    const { client, stampCalls } = fakeAdminClient(rows, notifications);
    sendResults = { 'user1@example.com': { ok: false, error: 'resend_down' } };

    const result = await runDigestSend(client as never, sendMail);

    expect(result.failed).toBe(1);
    expect(stampCalls).toHaveLength(0);
    expect(notifications[0].emailed_at).toBeNull();
  });

  test('stamping is scoped per user: only the recipient whose send succeeded gets stamped', async () => {
    const rows = [
      candidate({ recipient_user_id: 'user-1', recipient_email: 'user1@example.com', notification_id: 'u1-a' }),
      candidate({ recipient_user_id: 'user-2', recipient_email: 'user2@example.com', notification_id: 'u2-a' }),
    ];
    const notifications = [
      { id: 'u1-a', in_app_suppressed: true, emailed_at: null },
      { id: 'u2-a', in_app_suppressed: true, emailed_at: null },
    ];
    const { client, stampCalls } = fakeAdminClient(rows, notifications);
    sendResults = { 'user2@example.com': { ok: false, error: 'bounced' } };

    const result = await runDigestSend(client as never, sendMail);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(stampCalls).toHaveLength(1);
    expect(stampCalls[0].ids).toEqual(['u1-a']);
    expect(notifications.find(n => n.id === 'u1-a')!.emailed_at).not.toBeNull();
    expect(notifications.find(n => n.id === 'u2-a')!.emailed_at).toBeNull();
  });

  test('a large candidate set is stamped in chunks of EMAILED_STAMP_CHUNK_SIZE', async () => {
    const total = EMAILED_STAMP_CHUNK_SIZE * 2 + 5;
    const rows = Array.from({ length: total }, (_, i) => candidate({ notification_id: `n${i}` }));
    const notifications = rows.map(r => ({ id: r.notification_id, in_app_suppressed: true, emailed_at: null }));
    const { client, stampCalls } = fakeAdminClient(rows, notifications);

    await runDigestSend(client as never, sendMail);

    expect(stampCalls.map(c => c.ids.length)).toEqual([EMAILED_STAMP_CHUNK_SIZE, EMAILED_STAMP_CHUNK_SIZE, 5]);
    expect(notifications.every(n => n.emailed_at !== null)).toBe(true);
  });

  for (const mode of ['error', 'throw'] as const) {
    test(`a stamping ${mode === 'error' ? 'error' : 'exception'} never flips a sent digest to failed`, async () => {
      const rows = [candidate({ notification_id: 'n1' })];
      const notifications = [{ id: 'n1', in_app_suppressed: true, emailed_at: null }];
      const { client, log } = fakeAdminClient(rows, notifications, mode);

      const result = await runDigestSend(client as never, sendMail);

      expect(result).toEqual({ eligible_users: 1, sent: 1, failed: 0, skipped: 0 });
      expect(log[0].status).toBe('sent');
    });
  }
});
