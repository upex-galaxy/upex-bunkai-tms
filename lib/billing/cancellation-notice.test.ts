import type { SendMailFn } from './cancellation-notice';
import type { QueryCall } from './test-doubles';
import { describe, expect, mock, spyOn, test } from 'bun:test';
import { fakeSupabase, WORKSPACE_ID } from './test-doubles';

// BK-2497 — the owner notice for a scheduled cancellation. The database and the
// mail sender are injected doubles: no email ever leaves the test.

void mock.module('server-only', () => ({}));

const {
  buildCancellationNoticeHtml,
  buildCancellationNoticeSubject,
  formatPeriodEnd,
  notifyCancellationScheduled,
  scheduleCancellationNotice,
} = await import('./cancellation-notice');

const PERIOD_END = '2026-12-31T00:00:00.000Z';
const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';

interface Setup {
  name?: string
  state?: { current_period_end: string | null, cancel_at_period_end: boolean } | null
  owners?: Array<{ user_id: string }>
  failTable?: string
}

function setup(opts: Setup = {}) {
  const db = fakeSupabase((call: QueryCall) => {
    if (opts.failTable === call.table) {
      return { data: null, error: { message: 'boom' } };
    }
    switch (call.table) {
      case 'workspaces':
        return { data: { name: opts.name ?? 'Acme QA' }, error: null };
      case 'workspace_billing_state':
        return { data: opts.state === undefined ? { current_period_end: PERIOD_END, cancel_at_period_end: true } : opts.state, error: null };
      case 'workspace_members':
        return { data: opts.owners ?? [{ user_id: OWNER_A }], error: null };
      default:
        return undefined;
    }
  });
  const sent: Array<{ to: string, subject: string, html: string }> = [];
  const emails: Record<string, string | null> = { [OWNER_A]: 'owner-a@acme.test', [OWNER_B]: 'owner-b@acme.test' };
  return {
    db,
    sent,
    deps: {
      admin: db.client,
      sendMail: mock<SendMailFn>(async (input) => {
        sent.push(input);
        return { ok: true };
      }),
      lookupEmail: async (userId: string) => emails[userId] ?? null,
    },
  };
}

describe('cancellation notice copy', () => {
  test('names the workspace and the exact UTC end date', () => {
    expect(formatPeriodEnd(PERIOD_END)).toBe('December 31, 2026 (UTC)');
    expect(buildCancellationNoticeSubject({ workspaceName: 'Acme QA', endsAt: PERIOD_END })).toBe('Cloud for Acme QA ends on December 31, 2026 (UTC)');
    const html = buildCancellationNoticeHtml({ workspaceName: 'Acme QA', endsAt: PERIOD_END });
    expect(html).toContain('Cloud access ends on <strong style="color:#f1f3f5;">December 31, 2026 (UTC)</strong>');
    expect(html).toContain('Resubscribe before December 31, 2026 (UTC) from Billing');
    expect(html).toContain('Nothing is deleted.');
    expect(html).toContain('/settings/billing');
  });

  test('never invents a date when none is known', () => {
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd('not a date')).toBeNull();
    expect(buildCancellationNoticeSubject({ workspaceName: 'Acme QA', endsAt: null })).toBe('Cloud for Acme QA ends at the end of the paid period');
    expect(buildCancellationNoticeHtml({ workspaceName: 'Acme QA', endsAt: null })).toContain('Cloud access ends at the end of the period already paid');
  });

  test('escapes a workspace name typed by a user', () => {
    const html = buildCancellationNoticeHtml({ workspaceName: '<img src=x onerror=alert(1)>', endsAt: PERIOD_END });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('notifyCancellationScheduled', () => {
  test('sends one email to the active owner with the stored period end', async () => {
    const { db, deps, sent } = setup();
    const outcome = await notifyCancellationScheduled(WORKSPACE_ID, deps);
    expect(outcome).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner-a@acme.test');
    expect(sent[0].subject).toBe('Cloud for Acme QA ends on December 31, 2026 (UTC)');
    const members = db.calls.find(c => c.table === 'workspace_members');
    expect(members?.filters).toEqual([['workspace_id', 'eq', WORKSPACE_ID], ['role', 'eq', 'owner'], ['status', 'eq', 'active']]);
  });

  test('every active owner gets it, nobody else is ever looked up', async () => {
    const { deps, sent } = setup({ owners: [{ user_id: OWNER_A }, { user_id: OWNER_B }] });
    expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(sent.map(s => s.to)).toEqual(['owner-a@acme.test', 'owner-b@acme.test']);
  });

  test('sends nothing when the cancellation is no longer pending (a resubscribe won the race)', async () => {
    const { deps } = setup({ state: { current_period_end: PERIOD_END, cancel_at_period_end: false } });
    expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  test('a sender that is not configured is logged and never throws', async () => {
    const { deps } = setup();
    deps.sendMail = mock<SendMailFn>(async () => ({ ok: false, error: 'resend_not_configured' }));
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 0, failed: 1, skipped: 0 });
      expect(log).toHaveBeenCalledWith('cancellation notice not sent', { workspaceId: WORKSPACE_ID, error: 'resend_not_configured' });
      expect(JSON.stringify(log.mock.calls)).not.toContain('owner-a@acme.test');
    }
    finally {
      log.mockRestore();
    }
  });

  test('a sender that throws is caught, never reaches the caller', async () => {
    const { deps } = setup();
    deps.sendMail = mock<SendMailFn>(async () => { throw new Error('network down'); });
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    }
    finally {
      log.mockRestore();
    }
  });

  test('an owner with no email is skipped and logged without an address', async () => {
    const { deps } = setup({ owners: [{ user_id: '00000000-0000-4000-8000-0000000000ff' }] });
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(deps.sendMail).not.toHaveBeenCalled();
    }
    finally {
      log.mockRestore();
    }
  });

  test('a failed lookup sends nothing and reports a failure', async () => {
    const { deps } = setup({ failTable: 'workspace_members' });
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await notifyCancellationScheduled(WORKSPACE_ID, deps)).toEqual({ sent: 0, failed: 1, skipped: 0 });
      expect(deps.sendMail).not.toHaveBeenCalled();
    }
    finally {
      log.mockRestore();
    }
  });
});

describe('scheduleCancellationNotice', () => {
  test('hands exactly one task to the scheduler and sends nothing in the request itself', () => {
    const tasks: Array<() => Promise<void>> = [];
    scheduleCancellationNotice(WORKSPACE_ID, task => tasks.push(task));
    expect(tasks).toHaveLength(1);
  });
});
