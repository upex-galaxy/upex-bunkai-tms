import type { DigestCandidateRow } from './digest-grouping';
import { beforeEach, describe, expect, test } from 'bun:test';
import { isValidCronSecret, runDigestSend } from './send-digest-run';

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

function fakeAdminClient(candidateRows: DigestCandidateRow[]) {
  const log: LogRow[] = [];
  let idSeq = 0;

  const client = {
    rpc: async (name: string) => {
      if (name !== 'bunkai_notification_digest_candidates') {
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      }
      return { data: candidateRows, error: null };
    },
    from: (table: string) => {
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

  return { client, log };
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
