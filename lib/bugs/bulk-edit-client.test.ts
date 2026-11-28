import type { BugBulkEditReport } from '@lib/bugs/bulk-edit';
import type { BugBulkEditRequest } from '@lib/bugs/bulk-edit-client';
import { runBugBulkEdit } from '@lib/bugs/bulk-edit-client';
import { afterEach, describe, expect, test } from 'bun:test';

// BK-2098 — the request shape and the two kinds of failure (AC23). fetch is a double.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

interface Sent { url: string, body: Record<string, unknown> }
const sent: Sent[] = [];

function stub(handler: () => Response | Promise<Response>): void {
  sent.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return handler();
  }) as typeof fetch;
}

const REQUEST: BugBulkEditRequest = {
  projectId: 'p1',
  items: [{ id: 'b1', version: 3 }, { id: 'b2', version: null }],
  change: { field: 'severity', severity: 'P2' },
};

const REPORT: BugBulkEditReport = { dry_run: true, field: 'severity', requested: 2, changed: 2, unchanged: 0, refused: 0, outcomes: [] };

describe('runBugBulkEdit', () => {
  test('posts the project, field, wire change, versions and the dry-run flag', async () => {
    stub(() => Response.json(REPORT));
    const result = await runBugBulkEdit(REQUEST, { dryRun: true });
    expect(sent[0].url).toBe('/api/v1/bugs/bulk-edit');
    expect(sent[0].body).toEqual({
      project_id: 'p1',
      field: 'severity',
      change: { severity: 'P2' },
      items: [{ id: 'b1', version: 3 }, { id: 'b2', version: null }],
      dry_run: true,
    });
    expect(result).toEqual({ ok: true, report: REPORT });
  });

  test('an error envelope is rejected with the server message', async () => {
    stub(() => Response.json({ error: { code: 'project_read_only', message: 'This project is read-only.' } }, { status: 422 }));
    expect(await runBugBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'rejected', status: 422, message: 'This project is read-only.' });
  });

  test('a network failure or an unreadable 2xx is unknown, never success', async () => {
    stub(() => { throw new TypeError('network'); });
    expect(await runBugBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'unknown' });
    stub(() => new Response('not json', { status: 200 }));
    expect(await runBugBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'unknown' });
    stub(() => Response.json({ field: 'tags', requested: 1, changed: 1, unchanged: 0, refused: 0, outcomes: [] }));
    expect(await runBugBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'unknown' });
  });
});
