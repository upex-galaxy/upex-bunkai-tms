import type { UploadDeps } from '@lib/runs/attachment-upload';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { mapBugEvidenceRpcError } from './evidence-errors';
import {
  BugEvidenceInitBodySchema,
  discardOwnBugEvidence,
  extractBugEvidenceIds,
  finishBugEvidenceUpload,
  resolveBugEvidenceContentUrl,
  startBugEvidenceUpload,
} from './evidence-upload';

// BK-594 - defect evidence init, commit, discard and read against fakes: a recording RPC
// client for the caller's own `db`, a fake admin (Storage + the caller's unclaimed row) and an
// in-memory idempotency store. The real database is lib/bugs/evidence-isolation.test.ts.

const PROJECT = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';
const ATT = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const BUG = '55555555-5555-4555-8555-555555555555';
const PATH = `w/bug/${PROJECT}/${ATT}`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0x49, 0x44, 0x41, 0x54, 1, 2, 3, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

interface RpcResult { data: unknown, error: { code?: string, message: string, hint?: string | null } | null }

function harness(opts: {
  rpc?: Record<string, RpcResult>
  row?: Record<string, unknown> | null
  dbRow?: Record<string, unknown> | null
  info?: { size?: number, error?: { message: string, status?: number } }
  head?: Uint8Array
  signUploadError?: boolean
  replay?: { snapshot: unknown, status: number }
} = {}) {
  const rpcCalls: Array<{ fn: string, args: Record<string, unknown> }> = [];
  const removed: string[][] = [];
  const filters: Array<[string, unknown]> = [];
  const rpc = opts.rpc ?? {};
  const row = opts.row === undefined
    ? { id: ATT, storage_path: PATH, content_type: 'image/png', status: 'pending', created_by: USER, byte_size: 100, bug_id: null }
    : opts.row;
  const query = (result: Record<string, unknown> | null) => {
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return q; },
      maybeSingle: async () => ({ data: result, error: null }),
    };
    return q;
  };
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpc[fn] ?? { data: null, error: null };
    },
    from: () => query(opts.dbRow === undefined ? null : opts.dbRow),
  };
  const admin = {
    from: () => query(row),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => (opts.signUploadError
          ? { data: null, error: { message: 'down' } }
          : { data: { signedUrl: `https://storage.test/up/${path}?token=t`, token: 't', path }, error: null }),
        info: async () => (opts.info?.error ? { data: null, error: opts.info.error } : { data: { size: opts.info?.size ?? 5000, contentType: 'image/png' }, error: null }),
        createSignedUrl: async (path: string, seconds: number) => ({ data: { signedUrl: `https://storage.test/read/${path}?ttl=${seconds}` }, error: null }),
        remove: async (paths: string[]) => { removed.push(paths); return { data: [], error: null }; },
      }),
    },
  };
  const idem = { discarded: 0, recorded: [] as Array<{ snapshot: unknown, status: number }>, payloads: [] as unknown[] };
  const deps = {
    db,
    admin,
    userId: USER,
    fetchImpl: (async () => new Response(new Blob([(opts.head ?? PNG) as unknown as BlobPart]).stream(), { status: 206 })) as unknown as typeof fetch,
    idempotency: {
      begin: async (args: { requestPayload: unknown }) => {
        idem.payloads.push(args.requestPayload);
        return opts.replay
          ? { isReplay: true as const, snapshot: opts.replay.snapshot, status: opts.replay.status, token: { key: 'k', userId: USER, endpoint: 'e', rowId: 'r' } }
          : { isReplay: false as const, token: { key: 'k', userId: USER, endpoint: 'e', rowId: 'r' } };
      },
      record: async (_t: unknown, snapshot: unknown, status: number) => { idem.recorded.push({ snapshot, status }); },
      discard: async () => { idem.discarded += 1; },
    },
  } as unknown as UploadDeps;
  return { deps, rpcCalls, removed, idem, filters };
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

const INIT_OK: RpcResult = { data: { attachment: { id: ATT, status: 'pending' }, storage_path: PATH }, error: null };
const headers = new Headers({ 'idempotency-key': 'key-12345678' });
const body = { filename: 'shot.png', content_type: 'image/png', byte_size: 1000, draft_id: DRAFT };

describe('startBugEvidenceUpload', () => {
  it('runs the init RPC as the caller with the draft, signs the server path and never echoes it', async () => {
    const h = harness({ rpc: { bunkai_init_bug_evidence: INIT_OK } });
    const result = await startBugEvidenceUpload(h.deps, { headers, projectId: PROJECT, body });
    expect(result.status).toBe(201);
    const out = result.body as { upload: { url: string, method: string } };
    expect(out.upload.method).toBe('PUT');
    expect(out.upload.url).toContain(PATH);
    expect(JSON.stringify(result.body)).not.toContain('storage_path');
    expect(h.rpcCalls).toEqual([{
      fn: 'bunkai_init_bug_evidence',
      args: { p_project_id: PROJECT, p_draft_id: DRAFT, p_filename: 'shot.png', p_content_type: 'image/png', p_byte_size: 1000 },
    }]);
    // the key is scoped to the project and the draft, so a replay elsewhere is a mismatch
    expect(h.idem.payloads[0]).toMatchObject({ project_id: PROJECT, draft_id: DRAFT });
  });

  it('refuses a bad file before the key or the database, with the frozen copy (AC-04, AC-05)', async () => {
    const cases: Array<[typeof body, number, string, string]> = [
      [{ ...body, content_type: 'application/pdf' }, 415, 'unsupported_media_type', 'Only PNG, JPEG or WebP images are accepted.'],
      [{ ...body, content_type: 'image/svg+xml' }, 415, 'unsupported_media_type', 'Only PNG, JPEG or WebP images are accepted.'],
      [{ ...body, byte_size: 10 * 1024 * 1024 + 1 }, 413, 'file_too_large', 'Images must be 10 MiB or smaller.'],
      [{ ...body, byte_size: 0 }, 422, 'validation_failed', 'That file is empty or is not a valid PNG, JPEG or WebP image.'],
    ];
    for (const [payload, status, code, message] of cases) {
      const h = harness({ rpc: { bunkai_init_bug_evidence: INIT_OK } });
      const err = await rejection(startBugEvidenceUpload(h.deps, { headers, projectId: PROJECT, body: payload }));
      expect([err.status, String(err.code), err.message]).toEqual([status, code, message]);
      expect(h.rpcCalls).toHaveLength(0);
    }
    const h = harness({ rpc: { bunkai_init_bug_evidence: INIT_OK } });
    expect((await startBugEvidenceUpload(h.deps, { headers, projectId: PROJECT, body: { ...body, byte_size: 10 * 1024 * 1024 } })).status).toBe(201);
  });

  it('replays the stored answer for a repeated Idempotency-Key without a second row', async () => {
    const h = harness({ replay: { snapshot: { attachment: { id: ATT } }, status: 201 } });
    const result = await startBugEvidenceUpload(h.deps, { headers, projectId: PROJECT, body });
    expect(result).toEqual({ status: 201, body: { attachment: { id: ATT } } });
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('maps the draft cap and a viewer, and frees the key for a retry', async () => {
    const full = harness({ rpc: { bunkai_init_bug_evidence: { data: null, error: { code: '45303', message: 'bug_evidence_limit_exceeded', hint: 'count' } } } });
    const err = await rejection(startBugEvidenceUpload(full.deps, { headers, projectId: PROJECT, body }));
    expect([err.status, String(err.code), err.message]).toEqual([422, 'attachment_limit_exceeded', 'This defect already holds the maximum evidence (10 items).']);
    expect(full.idem.discarded).toBe(1);

    const viewer = harness({ rpc: { bunkai_init_bug_evidence: { data: null, error: { code: '42501', message: 'forbidden' } } } });
    expect((await rejection(startBugEvidenceUpload(viewer.deps, { headers, projectId: PROJECT, body }))).status).toBe(403);
  });

  it('discards the pending row when the upload URL cannot be signed', async () => {
    const h = harness({ rpc: { bunkai_init_bug_evidence: INIT_OK }, signUploadError: true });
    const err = await rejection(startBugEvidenceUpload(h.deps, { headers, projectId: PROJECT, body }));
    expect(err.status).toBe(503);
    expect(h.rpcCalls.map(c => c.fn)).toEqual(['bunkai_init_bug_evidence', 'bunkai_discard_bug_evidence']);
    expect(h.idem.discarded).toBe(1);
  });
});

describe('finishBugEvidenceUpload', () => {
  it('commits with the size measured in Storage, never the declared one', async () => {
    const h = harness({ info: { size: 4321 }, rpc: { bunkai_commit_bug_evidence: { data: { attachment: { id: ATT, status: 'committed' } }, error: null } } });
    const result = await finishBugEvidenceUpload(h.deps, { projectId: PROJECT, attachmentId: ATT });
    expect(result.status).toBe(200);
    expect(h.rpcCalls).toEqual([{ fn: 'bunkai_commit_bug_evidence', args: { p_attachment_id: ATT, p_byte_size: 4321 } }]);
    expect(h.filters).toContainEqual(['project_id', PROJECT]);
  });

  it('refuses content that is not the declared image, and discards the row and the object (AC-14)', async () => {
    const h = harness({ head: HTML });
    const err = await rejection(finishBugEvidenceUpload(h.deps, { projectId: PROJECT, attachmentId: ATT }));
    expect(err.status).toBe(422);
    expect(h.rpcCalls.map(c => c.fn)).toEqual(['bunkai_discard_bug_evidence']);
    expect(h.removed).toEqual([[PATH]]);
  });

  it('answers 409 while the bytes have not arrived (the drawer never files against them, AC-07)', async () => {
    const h = harness({ info: { error: { message: 'Object not found', status: 404 } } });
    const err = await rejection(finishBugEvidenceUpload(h.deps, { projectId: PROJECT, attachmentId: ATT }));
    expect([err.status, (err.details as { reason: string }).reason]).toEqual([409, 'upload_missing']);
  });

  it('is idempotent: an already committed upload goes straight to the RPC without reading Storage', async () => {
    const h = harness({ row: { id: ATT, storage_path: PATH, content_type: 'image/png', status: 'committed', created_by: USER, byte_size: 77, bug_id: null } });
    await finishBugEvidenceUpload(h.deps, { projectId: PROJECT, attachmentId: ATT });
    expect(h.rpcCalls).toEqual([{ fn: 'bunkai_commit_bug_evidence', args: { p_attachment_id: ATT, p_byte_size: 77 } }]);
  });

  it('answers the same 404 for somebody else\'s upload and for a missing one (AC-24)', async () => {
    const foreign = harness({ row: { id: ATT, storage_path: PATH, content_type: 'image/png', status: 'pending', created_by: 'someone-else', byte_size: 1, bug_id: null } });
    const missing = harness({ row: null });
    const a = await rejection(finishBugEvidenceUpload(foreign.deps, { projectId: PROJECT, attachmentId: ATT }));
    const b = await rejection(finishBugEvidenceUpload(missing.deps, { projectId: PROJECT, attachmentId: ATT }));
    expect([a.status, a.message, a.details]).toEqual([b.status, b.message, b.details]);
    expect(a.status).toBe(404);
    expect(foreign.rpcCalls).toHaveLength(0);
  });

  it('maps an expired upload window to 409', async () => {
    const h = harness({ rpc: { bunkai_commit_bug_evidence: { data: null, error: { code: '45318', message: 'bug_evidence_upload_expired' } } } });
    const err = await rejection(finishBugEvidenceUpload(h.deps, { projectId: PROJECT, attachmentId: ATT }));
    expect([err.status, (err.details as { reason: string }).reason]).toEqual([409, 'pending_expired']);
  });
});

describe('discardOwnBugEvidence', () => {
  it('discards an unfiled upload and deletes the object', async () => {
    const h = harness({ rpc: { bunkai_discard_bug_evidence: { data: { id: ATT, storage_path: PATH, status: 'committed' }, error: null } } });
    await discardOwnBugEvidence(h.deps, { projectId: PROJECT, attachmentId: ATT });
    expect(h.removed).toEqual([[PATH]]);
  });

  it('refuses a filed image: evidence on a filed defect is frozen (AC-11)', async () => {
    const h = harness({ rpc: { bunkai_discard_bug_evidence: { data: null, error: { code: '45317', message: 'bug_evidence_frozen' } } } });
    const err = await rejection(discardOwnBugEvidence(h.deps, { projectId: PROJECT, attachmentId: ATT }));
    expect([err.status, (err.details as { reason: string }).reason]).toEqual([409, 'evidence_frozen']);
    expect(h.removed).toHaveLength(0);
  });
});

describe('resolveBugEvidenceContentUrl', () => {
  it('signs a 60 second URL only after the caller\'s own read found the claimed row of this defect (AC-06, AC-16)', async () => {
    const h = harness({ dbRow: { storage_path: PATH } });
    const url = await resolveBugEvidenceContentUrl(h.deps, { bugId: BUG, attachmentId: ATT });
    expect(url).toBe(`https://storage.test/read/${PATH}?ttl=60`);
    expect(h.filters).toEqual(expect.arrayContaining([['id', ATT], ['bug_id', BUG], ['status', 'committed']]));
  });

  it('answers 404 with no hint when the caller\'s read finds nothing (foreign, missing, unclaimed)', async () => {
    const h = harness({ dbRow: null });
    const err = await rejection(resolveBugEvidenceContentUrl(h.deps, { bugId: BUG, attachmentId: ATT }));
    expect([err.status, err.message, err.details]).toEqual([404, 'Attachment not found.', { reason: 'not_found' }]);
  });
});

describe('extractBugEvidenceIds', () => {
  it('reads the ids by segment name from every route of the feature', () => {
    expect(extractBugEvidenceIds(`/api/v1/projects/${PROJECT}/bug-evidence`)).toEqual({ projectId: PROJECT, bugId: '', attachmentId: '' });
    expect(extractBugEvidenceIds(`/api/v1/projects/${PROJECT}/bug-evidence/${ATT}/commit`)).toEqual({ projectId: PROJECT, bugId: '', attachmentId: ATT });
    expect(extractBugEvidenceIds(`/api/v1/bugs/${BUG}/evidence/${ATT}/content`)).toEqual({ projectId: '', bugId: BUG, attachmentId: ATT });
  });
});

describe('BugEvidenceInitBodySchema', () => {
  it('requires a draft id', () => {
    expect(BugEvidenceInitBodySchema.safeParse({ filename: 'a.png', content_type: 'image/png', byte_size: 1 }).success).toBe(false);
    expect(BugEvidenceInitBodySchema.safeParse(body).success).toBe(true);
  });
});

describe('mapBugEvidenceRpcError', () => {
  function capture(error: { code?: string, message: string, hint?: string | null }): ApiError {
    try {
      mapBugEvidenceRpcError(error);
    }
    catch (raw) {
      return raw as ApiError;
    }
    throw new Error('mapper must throw');
  }

  it('maps the draft caps by reason and the non-disclosing 404', () => {
    expect(capture({ code: '45303', message: 'x', hint: 'bytes' }).message).toBe('This defect already holds the maximum evidence (10 items or 50 MiB).');
    expect(capture({ code: '45303', message: 'x', hint: 'file_bytes' }).message).toBe('Images must be 10 MiB or smaller.');
    expect(capture({ code: 'P0002', message: 'project_not_found' }).message).toBe('Project not found.');
    expect(capture({ code: 'P0002', message: 'attachment_not_found' }).status).toBe(404);
    expect(capture({ code: '22023', message: 'x' }).status).toBe(422);
    expect(capture({ code: '99999', message: 'x' }).status).toBe(500);
  });
});
