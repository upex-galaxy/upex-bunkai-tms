import type { UploadCaller } from './ci-upload-service';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import {
  assertXmlContentType,
  executeUpload,
  parseUploadQuery,
  previewUpload,
  readCappedBody,
} from './ci-upload-service';
import { JUNIT_MAX_BYTES } from './junit-report';

const TEST_ID = '11111111-1111-4111-8111-111111111111';
const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_WS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface FakeState {
  test: { id: string, title: string, workspace_id: string, archived_at: string | null } | null
  steps: { position: number, atc_id: string, atcs: { title: string, project_id: string } | null }[]
  environments: { name: string }[]
  rpcCalls: { fn: string, args: Record<string, unknown> }[]
  rpcResult: { data: unknown, error: { code?: string, message: string, details?: string | null } | null }
}

function fakeDb(state: FakeState) {
  const table = (name: string) => {
    const result = () => {
      if (name === 'tests') { return { data: state.test, error: null }; }
      if (name === 'test_steps') { return { data: state.steps, error: null }; }
      return { data: state.environments, error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => Promise.resolve(result()),
      maybeSingle: async () => Promise.resolve(result()),
      then: async (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  };
  return {
    from: table,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return Promise.resolve(state.rpcResult);
    },
  };
}

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    test: { id: TEST_ID, title: 'Checkout', workspace_id: WS, archived_at: null },
    steps: [1, 2].map(position => ({ position, atc_id: `atc-${position}`, atcs: { title: `ATC ${position}`, project_id: 'p1' } })),
    environments: [{ name: 'Staging' }],
    rpcCalls: [],
    rpcResult: { data: { id: 'run-1', replayed: false }, error: null },
    ...overrides,
  };
}

function caller(s: FakeState, via: 'cookie' | 'bearer' = 'cookie', workspaceId: string | null = null): UploadCaller {
  return {
    userId: 'user-1',
    workspaceId: via === 'bearer' ? workspaceId : null,
    via,
    tokenId: via === 'bearer' ? 'token-1' : undefined,
    db: fakeDb(s) as never,
  } as UploadCaller;
}

const xml = (cases: string) => new TextEncoder().encode(`<testsuite>${cases}</testsuite>`);
const query = (extra = '') => parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}&environment=staging&file_name=junit.xml${extra}`));

async function apiError(run: () => Promise<unknown> | unknown): Promise<ApiError> {
  try {
    await run();
  }
  catch (error) {
    if (error instanceof ApiError) { return error; }
    throw error;
  }
  throw new Error('expected an ApiError');
}

function stream(bytes: Uint8Array, chunk = 1024 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, offset + chunk));
      offset += chunk;
    },
  });
}

describe('parseUploadQuery', () => {
  it('reads the parameters and defaults the file name', () => {
    const q = parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}&environment=%20Staging%20&acknowledge_unmapped=true&idempotency_key=k1`));
    expect(q).toEqual({ testId: TEST_ID, environment: 'Staging', fileName: 'report.xml', acknowledgeUnmapped: true, idempotencyKey: 'k1', previewFingerprint: undefined });
  });

  it('keeps only the base name of a file name and strips control characters', () => {
    expect(parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}&environment=s&file_name=..%2F..%2Fetc%2Fjunit%0A.xml`)).fileName).toBe('junit.xml');
  });

  it('refuses a bad test id, environment, key or fingerprint', async () => {
    expect((await apiError(() => parseUploadQuery(new URLSearchParams('test_id=nope&environment=s')))).details).toEqual({ reason: 'test_id_invalid' });
    expect((await apiError(() => parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}`)))).details).toEqual({ reason: 'environment_invalid' });
    expect((await apiError(() => parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}&environment=s&idempotency_key=${'k'.repeat(65)}`)))).details).toEqual({ reason: 'idempotency_key_invalid' });
    expect((await apiError(() => parseUploadQuery(new URLSearchParams(`test_id=${TEST_ID}&environment=s&preview_fingerprint=abc`)))).details).toEqual({ reason: 'preview_fingerprint_invalid' });
  });
});

describe('assertXmlContentType', () => {
  it('accepts application/xml and text/xml only', async () => {
    expect(() => assertXmlContentType('application/xml; charset=utf-8')).not.toThrow();
    expect(() => assertXmlContentType('text/xml')).not.toThrow();
    for (const type of [null, 'application/pdf', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const error = await apiError(() => assertXmlContentType(type));
      expect(error.status).toBe(415);
      expect(error.message).toContain('JUnit XML (.xml)');
    }
  });
});

describe('readCappedBody (Scenarios 4.1, 4.2)', () => {
  it('accepts exactly 10 MB', async () => {
    const bytes = await readCappedBody(stream(new Uint8Array(JUNIT_MAX_BYTES)), null);
    expect(bytes.byteLength).toBe(JUNIT_MAX_BYTES);
  });

  it('refuses 10 MB + 1 byte while reading, naming JUnit XML and the 10 MB limit', async () => {
    const error = await apiError(async () => readCappedBody(stream(new Uint8Array(JUNIT_MAX_BYTES + 1)), null));
    expect(error.status).toBe(413);
    expect(error.message).toContain('10 MB');
    expect(error.message).toContain('JUnit XML');
  });

  it('refuses a declared 40 MB body before reading it', async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({ pull() { pulled = true; } }, { highWaterMark: 0 });
    const error = await apiError(async () => readCappedBody(body, String(40 * 1024 * 1024)));
    expect(error.status).toBe(413);
    expect(pulled).toBe(false);
  });

  it('returns an empty body as zero bytes', async () => {
    expect((await readCappedBody(null, null)).byteLength).toBe(0);
  });
});

describe('previewUpload', () => {
  it('maps the report onto the chain without writing', async () => {
    const s = state();
    const preview = await previewUpload(caller(s), query(), xml('<testcase name="a"/><testcase name="b"><failure message="x"/></testcase><testcase name="c"/>'));
    expect(preview.mapped.map(row => row.step_title)).toEqual(['ATC 1', 'ATC 2']);
    expect(preview.unmapped.map(e => e.name)).toEqual(['c']);
    expect(preview.verdict).toBe('failed');
    expect(preview.file_name).toBe('junit.xml');
    expect(s.rpcCalls).toEqual([]);
  });

  it('answers 404 for a token of another workspace, and for a missing Test', async () => {
    expect((await apiError(async () => previewUpload(caller(state(), 'bearer', OTHER_WS), query(), xml('<testcase name="a"/>')))).status).toBe(404);
    expect((await apiError(async () => previewUpload(caller(state({ test: null })), query(), xml('<testcase name="a"/>')))).status).toBe(404);
  });

  it('refuses a token not bound to a workspace', async () => {
    const error = await apiError(async () => previewUpload(caller(state(), 'bearer', null), query(), xml('<testcase name="a"/>')));
    expect(error.status).toBe(403);
  });

  it('refuses a report with no testcase, a DTD and non-JUnit XML with an inline message (Scenarios 2.3, 4.3, 4.4)', async () => {
    const reasons = [];
    for (const body of ['<testsuite/>', '<!DOCTYPE x><testsuite/>', '<html/>']) {
      const error = await apiError(async () => previewUpload(caller(state()), query(), new TextEncoder().encode(body)));
      expect(error.status).toBe(422);
      reasons.push((error.details as { reason: string }).reason);
    }
    expect(reasons).toEqual(['report_no_entries', 'report_dtd_forbidden', 'report_not_junit']);
  });

  it('refuses an unknown environment, an archived Test and an empty chain', async () => {
    expect((await apiError(async () => previewUpload(caller(state({ environments: [{ name: 'Prod' }] })), query(), xml('<testcase name="a"/>')))).code).toBe('environment_invalid');
    expect((await apiError(async () => previewUpload(caller(state({ test: { id: TEST_ID, title: 't', workspace_id: WS, archived_at: '2026-01-01' } })), query(), xml('<testcase name="a"/>')))).status).toBe(409);
    expect((await apiError(async () => previewUpload(caller(state({ steps: [] })), query(), xml('<testcase name="a"/>')))).code).toBe('no_executable_steps');
  });
});

describe('executeUpload', () => {
  it('creates the run through the submission RPC with the upload source (session: no token)', async () => {
    const s = state();
    const result = await executeUpload(caller(s), query('&idempotency_key=k1'), xml('<testcase name="a"/><testcase name="b"><failure message="boom"/></testcase>'));
    expect(result.status).toBe(201);
    expect(s.rpcCalls).toHaveLength(1);
    const { fn, args } = s.rpcCalls[0];
    expect(fn).toBe('bunkai_submit_automated_run');
    expect(args).toMatchObject({
      p_actor_user_id: 'user-1',
      p_token_id: null,
      p_test_id: TEST_ID,
      p_environment_name: 'staging',
      p_verdict: 'failed',
      p_steps: [{ position: 1, result: 'pass' }, { position: 2, result: 'fail' }],
      p_evidence_urls: [],
      p_idempotency_key: 'k1',
      p_source: 'upload',
      p_step_notes: { 2: 'Failure: boom' },
      p_report: { file_name: 'junit.xml', entry_count: 2, unmapped: [] },
    });
  });

  it('passes the token id on the scripted path (Scenario 1.2)', async () => {
    const s = state();
    await executeUpload(caller(s, 'bearer', WS), query(), xml('<testcase name="a"/><testcase name="b"/>'));
    expect(s.rpcCalls[0].args.p_token_id).toBe('token-1');
  });

  it('refuses unmapped entries until they are acknowledged, then records them', async () => {
    const s = state();
    const body = xml('<testcase name="a"/><testcase name="b"/><testcase name="extra"/>');
    const error = await apiError(async () => executeUpload(caller(s), query(), body));
    expect(error.status).toBe(422);
    expect(error.details).toEqual({ reason: 'unmapped_not_acknowledged', unmapped: [{ index: 3, name: 'extra' }] });
    expect(s.rpcCalls).toEqual([]);
    await executeUpload(caller(s), query('&acknowledge_unmapped=true'), body);
    expect((s.rpcCalls[0].args.p_report as { unmapped: unknown[] }).unmapped).toEqual([{ index: 3, name: 'extra', classname: '', result: 'pass' }]);
  });

  it('refuses a stale preview fingerprint and writes nothing', async () => {
    const s = state();
    const error = await apiError(async () => executeUpload(caller(s), query(`&preview_fingerprint=${'0'.repeat(64)}`), xml('<testcase name="a"/><testcase name="b"/>')));
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'preview_stale' });
    expect(s.rpcCalls).toEqual([]);
  });

  it('accepts the fingerprint of its own preview', async () => {
    const s = state();
    const body = xml('<testcase name="a"/><testcase name="b"/>');
    const { fingerprint } = await previewUpload(caller(s), query(), body);
    const result = await executeUpload(caller(s), query(`&preview_fingerprint=${fingerprint}`), body);
    expect(result.status).toBe(201);
  });

  it('answers 200 on a replay and maps a viewer and a read-only project', async () => {
    expect((await executeUpload(caller(state({ rpcResult: { data: { id: 'r', replayed: true }, error: null } })), query(), xml('<testcase name="a"/><testcase name="b"/>'))).status).toBe(200);
    const viewer = await apiError(async () => executeUpload(caller(state({ rpcResult: { data: null, error: { code: '42501', message: 'forbidden' } } })), query(), xml('<testcase name="a"/><testcase name="b"/>')));
    expect(viewer.status).toBe(403);
    const locked = await apiError(async () => executeUpload(caller(state({ rpcResult: { data: null, error: { code: '45701', message: 'project_read_only' } } })), query(), xml('<testcase name="a"/><testcase name="b"/>')));
    expect(locked.code).toBe('project_read_only');
  });
});
