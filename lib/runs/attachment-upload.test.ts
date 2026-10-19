import type { UploadDeps } from './attachment-upload';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { finishAttachmentUpload, startAttachmentUpload } from './attachment-upload';

// BK-593 - init and commit orchestration against fakes: a recording RPC client for the
// caller's own `db`, a fake admin (Storage + the caller's pending row) and an in-memory
// idempotency store. The real database is lib/runs/step-attachments-isolation.test.ts and the
// real bucket is pending-apply of migration 0097.

const RUN = '11111111-1111-4111-8111-111111111111';
const STEP = '22222222-2222-4222-8222-222222222222';
const ATT = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);

interface RpcResult { data: unknown, error: { code?: string, message: string, hint?: string | null } | null }
interface Harness {
  deps: UploadDeps
  rpcCalls: Array<{ fn: string, args: Record<string, unknown> }>
  removed: string[][]
  idem: { discarded: number, recorded: Array<{ snapshot: unknown, status: number }>, replay: { snapshot: unknown, status: number } | null }
}

function harness(opts: {
  rpc?: Record<string, RpcResult>
  row?: Record<string, unknown> | null
  info?: { size?: number, error?: { message: string, status?: number } }
  head?: Uint8Array
  signUploadError?: boolean
  fetchStatus?: number
  replay?: { snapshot: unknown, status: number }
} = {}): Harness {
  const rpcCalls: Harness['rpcCalls'] = [];
  const removed: string[][] = [];
  const rpc = opts.rpc ?? {};
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpc[fn] ?? { data: null, error: null };
    },
  };
  const row = opts.row === undefined
    ? { id: ATT, storage_path: `w/${RUN}/${STEP}/${ATT}`, content_type: 'image/png', status: 'pending', created_by: USER, byte_size: 100 }
    : opts.row;
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const admin = {
    from: () => query,
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => (opts.signUploadError
          ? { data: null, error: { message: 'down' } }
          : { data: { signedUrl: `https://storage.test/up/${path}?token=t`, token: 't', path }, error: null }),
        info: async () => (opts.info?.error ? { data: null, error: opts.info.error } : { data: { size: opts.info?.size ?? 5000, contentType: 'image/png' }, error: null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/read/${path}` }, error: null }),
        remove: async (paths: string[]) => { removed.push(paths); return { data: [], error: null }; },
      }),
    },
  };
  const idem = { discarded: 0, recorded: [] as Array<{ snapshot: unknown, status: number }>, replay: opts.replay ?? null };
  const deps = {
    db,
    admin,
    userId: USER,
    fetchImpl: (async () => new Response(new Blob([(opts.head ?? PNG) as unknown as BlobPart]).stream(), { status: opts.fetchStatus ?? 206 })) as unknown as typeof fetch,
    idempotency: {
      begin: async () => (idem.replay
        ? { isReplay: true as const, snapshot: idem.replay.snapshot, status: idem.replay.status, token: { key: 'k', userId: USER, endpoint: 'e', rowId: 'r' } }
        : { isReplay: false as const, token: { key: 'k', userId: USER, endpoint: 'e', rowId: 'r' } }),
      record: async (_t: unknown, snapshot: unknown, status: number) => { idem.recorded.push({ snapshot, status }); },
      discard: async () => { idem.discarded += 1; },
    },
  } as unknown as UploadDeps;
  return { deps, rpcCalls, removed, idem };
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

const INIT_OK: RpcResult = { data: { attachment: { id: ATT, status: 'pending' }, storage_path: `w/${RUN}/${STEP}/${ATT}` }, error: null };
const headers = new Headers({ 'idempotency-key': 'key-12345678' });
const body = { filename: 'shot.png', content_type: 'image/png', byte_size: 1000 };

describe('startAttachmentUpload', () => {
  it('runs the init RPC as the caller, signs the upload for the server path and answers 201 without the path', async () => {
    const h = harness({ rpc: { bunkai_init_run_step_attachment: INIT_OK } });
    const result = await startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body });
    expect(result.status).toBe(201);
    const out = result.body as { attachment: { id: string }, upload: { method: string, url: string, headers: Record<string, string>, expires_at: string } };
    expect(out.attachment.id).toBe(ATT);
    expect(out.upload.method).toBe('PUT');
    expect(out.upload.url).toContain(`w/${RUN}/${STEP}/${ATT}`);
    expect(out.upload.headers['content-type']).toBe('image/png');
    expect(JSON.stringify(result.body)).not.toContain('storage_path');
    expect(h.rpcCalls).toEqual([{
      fn: 'bunkai_init_run_step_attachment',
      args: { p_run_id: RUN, p_run_step_id: STEP, p_filename: 'shot.png', p_content_type: 'image/png', p_byte_size: 1000 },
    }]);
    expect(h.idem.recorded).toHaveLength(1);
    expect(h.idem.recorded[0].status).toBe(201);
  });

  it('refuses a bad file BEFORE touching the idempotency key or the database', async () => {
    const cases: Array<[typeof body, number, string]> = [
      [{ ...body, content_type: 'image/gif' }, 415, 'unsupported_media_type'],
      [{ ...body, byte_size: 10 * 1024 * 1024 + 1 }, 413, 'file_too_large'],
      [{ ...body, byte_size: 10 * 1024 * 1024 }, 201, ''],
      [{ ...body, byte_size: 0 }, 422, 'validation_failed'],
      [{ ...body, filename: '  ' }, 422, 'validation_failed'],
    ];
    for (const [payload, status, code] of cases) {
      const h = harness({ rpc: { bunkai_init_run_step_attachment: INIT_OK } });
      if (status === 201) {
        expect((await startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body: payload })).status).toBe(201);
        continue;
      }
      const err = await rejection(startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body: payload }));
      expect([err.status, String(err.code)]).toEqual([status, code]);
      expect(h.rpcCalls).toHaveLength(0);
      expect(h.idem.discarded).toBe(0);
    }
  });

  it('replays the stored answer for a repeated Idempotency-Key without a second row', async () => {
    const snapshot = { attachment: { id: ATT }, upload: { url: 'u' } };
    const h = harness({ replay: { snapshot, status: 201 } });
    const result = await startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body });
    expect(result).toEqual({ status: 201, body: snapshot });
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('maps an RPC refusal to the envelope and frees the idempotency key', async () => {
    const h = harness({ rpc: { bunkai_init_run_step_attachment: { data: null, error: { code: '45216', message: 'attachment_run_closed' } } } });
    const err = await rejection(startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body }));
    expect([err.status, err.code]).toEqual([409, 'conflict']);
    expect(h.idem.discarded).toBe(1);
    expect(h.idem.recorded).toHaveLength(0);
  });

  it('maps a full step to attachment_limit_exceeded with the frozen copy', async () => {
    const h = harness({ rpc: { bunkai_init_run_step_attachment: { data: null, error: { code: '45217', message: 'x', hint: 'step_count' } } } });
    const err = await rejection(startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body }));
    expect([err.status, err.code, err.message]).toEqual([422, 'attachment_limit_exceeded', 'This step already holds the maximum evidence (10 images or 50 MiB).']);
  });

  it('answers 503 when Storage cannot sign, drops the pending row and frees the key (safe to retry)', async () => {
    const h = harness({ rpc: { bunkai_init_run_step_attachment: INIT_OK }, signUploadError: true });
    const err = await rejection(startAttachmentUpload(h.deps, { headers, runId: RUN, stepId: STEP, body }));
    expect([err.status, err.code]).toEqual([503, 'storage_unavailable']);
    expect(h.rpcCalls.map(c => c.fn)).toEqual(['bunkai_init_run_step_attachment', 'bunkai_remove_run_step_attachment']);
    expect(h.idem.discarded).toBe(1);
  });
});

describe('finishAttachmentUpload', () => {
  const ids = { runId: RUN, stepId: STEP, attachmentId: ATT };
  const COMMITTED: RpcResult = { data: { attachment: { id: ATT, status: 'committed', byte_size: 5000 } }, error: null };

  it('validates what arrived and commits with the ACTUAL size from Storage metadata', async () => {
    const h = harness({ rpc: { bunkai_commit_run_step_attachment: COMMITTED }, info: { size: 5000 } });
    const result = await finishAttachmentUpload(h.deps, ids);
    expect(result.status).toBe(200);
    expect(h.rpcCalls).toEqual([{ fn: 'bunkai_commit_run_step_attachment', args: { p_attachment_id: ATT, p_byte_size: 5000 } }]);
  });

  it('answers 404 for a row that is missing or not the caller\'s, without reading Storage', async () => {
    for (const row of [null, { id: ATT, storage_path: 'p', content_type: 'image/png', status: 'pending', created_by: 'someone-else', byte_size: 1 }]) {
      const h = harness({ row });
      const err = await rejection(finishAttachmentUpload(h.deps, ids));
      expect([err.status, err.code]).toEqual([404, 'not_found']);
      expect(h.rpcCalls).toHaveLength(0);
    }
  });

  it('retries an already committed row through the RPC without reading Storage', async () => {
    const h = harness({
      rpc: { bunkai_commit_run_step_attachment: COMMITTED },
      row: { id: ATT, storage_path: 'p', content_type: 'image/png', status: 'committed', created_by: USER, byte_size: 777 },
      info: { error: { message: 'must not be called', status: 500 } },
    });
    const result = await finishAttachmentUpload(h.deps, ids);
    expect(result.status).toBe(200);
    expect(h.rpcCalls[0].args.p_byte_size).toBe(777);
  });

  it('answers 409 upload_missing when nothing was uploaded, and 503 when Storage is down', async () => {
    const missing = harness({ info: { error: { message: 'Object not found', status: 404 } } });
    const err = await rejection(finishAttachmentUpload(missing.deps, ids));
    expect([err.status, err.code, err.details]).toEqual([409, 'conflict', { reason: 'upload_missing' }]);
    expect(missing.rpcCalls).toHaveLength(0);

    const down = harness({ info: { error: { message: 'boom', status: 500 } } });
    expect((await rejection(finishAttachmentUpload(down.deps, ids))).status).toBe(503);
  });

  it('discards a pending row and its object when the bytes are not the declared image (415/422 family)', async () => {
    const mismatch = harness({ head: GIF, info: { size: 10 }, rpc: { bunkai_remove_run_step_attachment: { data: {}, error: null } } });
    const err = await rejection(finishAttachmentUpload(mismatch.deps, ids));
    expect([err.status, err.code, err.details]).toEqual([422, 'validation_failed', { reason: 'content_mismatch' }]);
    expect(mismatch.rpcCalls.map(c => c.fn)).toEqual(['bunkai_remove_run_step_attachment']);
    expect(mismatch.removed).toEqual([[`w/${RUN}/${STEP}/${ATT}`]]);

    const huge = harness({ info: { size: 10 * 1024 * 1024 + 1 } });
    const tooBig = await rejection(finishAttachmentUpload(huge.deps, ids));
    expect([tooBig.status, tooBig.code]).toEqual([413, 'file_too_large']);

    const empty = harness({ info: { size: 0 } });
    expect((await rejection(finishAttachmentUpload(empty.deps, ids))).details).toEqual({ reason: 'empty_file' });
  });

  it('keeps the object when the discard itself is refused (Run closed): the sweep removes both later', async () => {
    const h = harness({ head: GIF, info: { size: 10 }, rpc: { bunkai_remove_run_step_attachment: { data: null, error: { code: '45216', message: 'attachment_run_closed' } } } });
    await rejection(finishAttachmentUpload(h.deps, ids));
    expect(h.removed).toHaveLength(0);
  });

  it('maps commit refusals: a closed Run is 409 run_not_open and the pending row is left for the sweep', async () => {
    const h = harness({ rpc: { bunkai_commit_run_step_attachment: { data: null, error: { code: '45216', message: 'attachment_run_closed' } } } });
    const err = await rejection(finishAttachmentUpload(h.deps, ids));
    expect([err.status, err.code, err.details]).toEqual([409, 'conflict', { reason: 'run_not_open' }]);
    expect(h.rpcCalls.map(c => c.fn)).toEqual(['bunkai_commit_run_step_attachment']);
  });
});
