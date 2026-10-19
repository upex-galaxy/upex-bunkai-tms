import type { AccessDeps } from './attachment-access';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { deleteAttachment, listRunAttachments, resolveAttachmentContentUrl, toAttachmentView } from './attachment-access';

// BK-593 - remove, list and content resolution against fakes. The real RLS and the real
// bucket are lib/runs/step-attachments-isolation.test.ts and pending-apply of migration 0097.

const RUN = '11111111-1111-4111-8111-111111111111';
const STEP = '22222222-2222-4222-8222-222222222222';
const ATT = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const IDS = { runId: RUN, stepId: STEP, attachmentId: ATT };

interface Filter { column: string, value: unknown }

// A recording query builder: every `.eq` is kept so a test can assert WHICH ids and which
// status the query was pinned to.
function table(result: { data: unknown, error: { message: string } | null }, log: Array<{ table: string, filters: Filter[] }>, name: string) {
  const filters: Filter[] = [];
  log.push({ table: name, filters });
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => { filters.push({ column, value }); return builder; };
  builder.order = () => builder;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

function deps(opts: {
  runs?: { data: unknown, error: { message: string } | null }
  attachments?: { data: unknown, error: { message: string } | null }
  adminAttachments?: { data: unknown, error: { message: string } | null }
  rpc?: { data: unknown, error: { code?: string, message: string, hint?: string | null } | null }
  signedUrlError?: boolean
} = {}) {
  const dbLog: Array<{ table: string, filters: Filter[] }> = [];
  const adminLog: Array<{ table: string, filters: Filter[] }> = [];
  const rpcCalls: string[] = [];
  const removed: string[][] = [];
  const db = {
    from: (name: string) => table(name === 'runs' ? (opts.runs ?? { data: { id: RUN }, error: null }) : (opts.attachments ?? { data: [], error: null }), dbLog, name),
    rpc: async (fn: string) => { rpcCalls.push(fn); return opts.rpc ?? { data: { id: ATT, storage_path: 'w/r/s/a', status: 'committed' }, error: null }; },
  };
  const admin = {
    from: (name: string) => table(opts.adminAttachments ?? { data: { id: ATT, created_by: USER }, error: null }, adminLog, name),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => (opts.signedUrlError ? { data: null, error: { message: 'x' } } : { data: { signedUrl: `https://storage.test/read/${path}` }, error: null }),
        remove: async (paths: string[]) => { removed.push(paths); return { data: [], error: null }; },
      }),
    },
  };
  return { deps: { db, admin, userId: USER } as unknown as AccessDeps, dbLog, adminLog, rpcCalls, removed };
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the promise to reject');
}

const ROW = {
  id: ATT,
  run_id: RUN,
  run_step_id: STEP,
  original_filename: 'shot.png',
  content_type: 'image/png',
  byte_size: 2048,
  status: 'committed',
  created_by: USER,
  created_at: '2026-10-19T10:00:00Z',
  committed_at: '2026-10-19T10:00:05Z',
};

describe('toAttachmentView', () => {
  it('renames original_filename to filename and exposes no storage path', () => {
    const view = toAttachmentView({ ...ROW, storage_path: 'secret/path' } as typeof ROW);
    expect(view.filename).toBe('shot.png');
    expect(JSON.stringify(view)).not.toContain('storage_path');
    expect(JSON.stringify(view)).not.toContain('secret');
  });
});

describe('listRunAttachments', () => {
  it('lists the committed attachments of a visible Run', async () => {
    const h = deps({ attachments: { data: [ROW], error: null } });
    const out = await listRunAttachments(h.deps.db, RUN);
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0].filename).toBe('shot.png');
    const query = h.dbLog.find(l => l.table === 'run_step_attachments')!;
    expect(query.filters).toContainEqual({ column: 'run_id', value: RUN });
    expect(query.filters).toContainEqual({ column: 'status', value: 'committed' });
  });

  it('answers 404 for a Run the caller cannot see, not an empty list', async () => {
    const h = deps({ runs: { data: null, error: null } });
    const err = await rejection(listRunAttachments(h.deps.db, RUN));
    expect([err.status, err.code]).toEqual([404, 'not_found']);
  });
});

describe('resolveAttachmentContentUrl', () => {
  it('pins the read to the committed row under exactly these ids and returns the signed URL', async () => {
    const h = deps({ attachments: { data: { storage_path: 'w/r/s/a' }, error: null } });
    expect(await resolveAttachmentContentUrl(h.deps, IDS)).toBe('https://storage.test/read/w/r/s/a');
    const filters = h.dbLog[0].filters;
    expect(filters).toContainEqual({ column: 'id', value: ATT });
    expect(filters).toContainEqual({ column: 'run_id', value: RUN });
    expect(filters).toContainEqual({ column: 'run_step_id', value: STEP });
    expect(filters).toContainEqual({ column: 'status', value: 'committed' });
    // the service role signs; it never reads the table
    expect(h.adminLog).toHaveLength(0);
  });

  it('answers the same 404 for a missing, foreign or pending attachment (RLS returns no row)', async () => {
    const h = deps({ attachments: { data: null, error: null } });
    const err = await rejection(resolveAttachmentContentUrl(h.deps, IDS));
    expect([err.status, err.code, err.message]).toEqual([404, 'not_found', 'Attachment not found.']);
  });

  it('answers 503 when Storage cannot sign', async () => {
    const h = deps({ attachments: { data: { storage_path: 'p' }, error: null }, signedUrlError: true });
    expect((await rejection(resolveAttachmentContentUrl(h.deps, IDS))).status).toBe(503);
  });
});

describe('deleteAttachment', () => {
  it('removes through the RPC as the caller and then deletes the object', async () => {
    const h = deps();
    await deleteAttachment(h.deps, IDS);
    expect(h.rpcCalls).toEqual(['bunkai_remove_run_step_attachment']);
    expect(h.removed).toEqual([['w/r/s/a']]);
  });

  it('answers 404 when the ids do not name an attachment, before any write', async () => {
    const h = deps({ adminAttachments: { data: null, error: null } });
    const err = await rejection(deleteAttachment(h.deps, IDS));
    expect(err.status).toBe(404);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('maps the RPC refusals and never touches Storage on one', async () => {
    const cases: Array<[string, number, string]> = [
      ['45219', 403, 'forbidden'],
      ['45216', 409, 'conflict'],
      ['42501', 403, 'forbidden'],
      ['P0002', 404, 'not_found'],
    ];
    for (const [code, status, envelope] of cases) {
      const h = deps({ rpc: { data: null, error: { code, message: 'x', hint: 'not_uploader' } } });
      const err = await rejection(deleteAttachment(h.deps, IDS));
      expect([err.status, err.code]).toEqual([status, envelope as never]);
      expect(h.removed).toHaveLength(0);
    }
  });
});
