import { runBulkEdit } from '@lib/atcs/bulk-edit-client';
import { afterEach, describe, expect, test } from 'bun:test';

// BK-507 — the request shape and the two kinds of failure. `fetch` is a double.

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

const REQUEST = {
  projectId: 'p1',
  items: [{ id: 'a1', version: 3 }, { id: 'a2', version: null }],
  change: { field: 'tags', op: 'add', tags: ['smoke'] } as const,
};

const REPORT = { dry_run: false, field: 'tags', requested: 2, changed: 2, unchanged: 0, refused: 0, outcomes: [] };

describe('runBulkEdit', () => {
  test('posts the project, field, wire change, versions and the dry-run flag', async () => {
    stub(() => Response.json(REPORT));
    const result = await runBulkEdit(REQUEST, { dryRun: true });
    expect(sent[0].url).toBe('/api/v1/atcs/bulk-edit');
    expect(sent[0].body).toEqual({
      project_id: 'p1',
      field: 'tags',
      change: { op: 'add', tags: ['smoke'] },
      items: [{ id: 'a1', version: 3 }, { id: 'a2', version: null }],
      dry_run: true,
    });
    expect(result).toEqual({ ok: true, report: REPORT });
  });

  test('a server error envelope is a rejection: the server answered, so nothing changed', async () => {
    stub(() => Response.json({ error: { code: 'validation_failed', message: 'Too many.' } }, { status: 422 }));
    const result = await runBulkEdit(REQUEST, { dryRun: false });
    expect(result).toEqual({ ok: false, kind: 'rejected', status: 422, forbidden: false, message: 'Too many.' });
  });

  test('a 403 says forbidden', async () => {
    stub(() => Response.json({}, { status: 403 }));
    const result = await runBulkEdit(REQUEST, { dryRun: false });
    expect(result).toMatchObject({ ok: false, kind: 'rejected', forbidden: true, message: 'The server did not say why.' });
  });

  test('no answer at all is unknown, never "nothing changed"', async () => {
    stub(() => { throw new TypeError('network down'); });
    expect(await runBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'unknown' });
  });

  test('a 2xx that is not a report is unknown', async () => {
    stub(() => Response.json({ hello: 'world' }));
    expect(await runBulkEdit(REQUEST, { dryRun: false })).toEqual({ ok: false, kind: 'unknown' });
  });
});
