import type { UploadCaller } from './ci-upload-service';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { gzipSync } from 'fflate';
import {
  assertXmlContentType,
  executeUpload,
  gunzipCapped,
  parseUploadCiContext,
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

describe('parseUploadCiContext (BK-2097)', () => {
  const ci = (params: Record<string, string> | string) => parseUploadCiContext(new URLSearchParams(params));
  const refusedField = async (params: Record<string, string> | string) => (await apiError(() => ci(params))).details;

  it('reads no detail when none is sent, and the preview query ignores the details', () => {
    expect(ci(`test_id=${TEST_ID}&environment=s`)).toEqual({ commit: null, branch: null, pipeline_name: null, pipeline_url: null });
    const plain = `test_id=${TEST_ID}&environment=s`;
    expect(parseUploadQuery(new URLSearchParams(`${plain}&commit=zz!&branch=`))).toEqual(parseUploadQuery(new URLSearchParams(plain)));
  });

  it('records any subset, lower-cases the commit, trims and keeps a tag name as the branch', () => {
    expect(ci({ commit: 'A1B2C3D', branch: ' feature/checkout-discounts ' })).toEqual({ commit: 'a1b2c3d', branch: 'feature/checkout-discounts', pipeline_name: null, pipeline_url: null });
    expect(ci({ pipeline_name: 'nightly-regression', pipeline_url: 'https://ci.acme.dev/p/42' })).toEqual({ commit: null, branch: null, pipeline_name: 'nightly-regression', pipeline_url: 'https://ci.acme.dev/p/42' });
    expect(ci({ branch: 'v2.4.0' }).branch).toBe('v2.4.0');
  });

  it('keeps reserved and accented characters sent percent-encoded (AC14)', () => {
    const branch = 'release/v2+hotfix&x=1#é';
    const pipelineUrl = 'https://ci.acme.dev/p/42?job=7&attempt=2#log';
    expect(ci(new URLSearchParams({ branch, pipeline_url: pipelineUrl }).toString())).toMatchObject({ branch, pipeline_url: pipelineUrl });
    expect(ci('branch=a+b').branch).toBe('a b');
  });

  it('counts the first of a repeated parameter, like the other upload parameters', () => {
    expect(ci('branch=main&branch=develop').branch).toBe('main');
  });

  it('refuses a present empty or spaces-only value, naming the field (AC4, AC6)', async () => {
    for (const field of ['commit', 'branch', 'pipeline_name', 'pipeline_url']) {
      expect(await refusedField(`${field}=`)).toEqual({ reason: `${field}_invalid`, field });
      expect(await refusedField(`${field}=%20%20`)).toEqual({ reason: `${field}_invalid`, field });
    }
  });

  it('refuses bad values with the BK-1995 message that names the field', async () => {
    const commit = await apiError(() => ci({ commit: 'zz!' }));
    expect(commit.status).toBe(422);
    expect(commit.message).toBe('commit must be a hexadecimal commit reference of 7 to 64 characters.');
    expect(await refusedField({ branch: 'feature/checkout\ndiscounts' })).toEqual({ reason: 'branch_invalid', field: 'branch' });
    expect(await refusedField({ pipeline_name: 'nightly\u0007' })).toEqual({ reason: 'pipeline_name_invalid', field: 'pipeline_name' });
    expect(await refusedField({ pipeline_url: 'javascript:alert(1)' })).toEqual({ reason: 'pipeline_url_invalid', field: 'pipeline_url' });
    expect(await refusedField({ pipeline_url: 'https://deploy:s3cret@ci.acme.dev/p/42' })).toEqual({ reason: 'pipeline_url_invalid', field: 'pipeline_url' });
  });

  it('reports the first invalid detail in the order commit, branch, pipeline_name, pipeline_url', async () => {
    expect(await refusedField({ pipeline_url: 'ftp://x', branch: '', commit: 'zz' })).toEqual({ reason: 'commit_invalid', field: 'commit' });
    expect(await refusedField({ pipeline_url: 'ftp://x', branch: '' })).toEqual({ reason: 'branch_invalid', field: 'branch' });
  });

  it('enforces each limit at its boundaries (AC5)', async () => {
    const hex = (n: number) => 'a'.repeat(n);
    expect(ci({ commit: hex(7) }).commit).toBe(hex(7));
    expect(ci({ commit: hex(64) }).commit).toBe(hex(64));
    expect(await refusedField({ commit: hex(6) })).toEqual({ reason: 'commit_invalid', field: 'commit' });
    expect(await refusedField({ commit: hex(65) })).toEqual({ reason: 'commit_invalid', field: 'commit' });
    expect(ci({ branch: 'b' }).branch).toBe('b');
    expect(ci({ branch: 'é'.repeat(255) }).branch).toBe('é'.repeat(255));
    expect(await refusedField({ branch: 'b'.repeat(256) })).toEqual({ reason: 'branch_invalid', field: 'branch' });
    expect(ci({ pipeline_name: 'n'.repeat(100) }).pipeline_name).toBe('n'.repeat(100));
    expect(await refusedField({ pipeline_name: 'n'.repeat(101) })).toEqual({ reason: 'pipeline_name_invalid', field: 'pipeline_name' });
    const url = (n: number) => `https://ci.acme.dev/${'p'.repeat(n - 'https://ci.acme.dev/'.length)}`;
    expect(ci({ pipeline_url: url(2048) }).pipeline_url).toBe(url(2048));
    expect(await refusedField({ pipeline_url: url(2049) })).toEqual({ reason: 'pipeline_url_invalid', field: 'pipeline_url' });
  });
});

describe('assertXmlContentType', () => {
  it('accepts application/xml and text/xml only', async () => {
    expect(() => assertXmlContentType('application/xml; charset=utf-8')).not.toThrow();
    expect(assertXmlContentType('text/xml')).toBe('xml');
    expect(assertXmlContentType('application/gzip')).toBe('gzip');
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

describe('gunzipCapped (reports sent compressed past the 4.5 MB hosting limit)', () => {
  it('accepts a report of exactly 10 MB once decompressed and refuses 10 MB + 1', async () => {
    expect(gunzipCapped(gzipSync(new Uint8Array(JUNIT_MAX_BYTES))).byteLength).toBe(JUNIT_MAX_BYTES);
    const error = await apiError(() => gunzipCapped(gzipSync(new Uint8Array(JUNIT_MAX_BYTES + 1))));
    expect(error.status).toBe(413);
  });

  it('stops a decompression bomb at the limit', async () => {
    const bomb = gzipSync(new Uint8Array(40 * 1024 * 1024));
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    expect((await apiError(() => gunzipCapped(bomb))).status).toBe(413);
  });

  it('refuses a body that is not gzip', async () => {
    expect((await apiError(() => gunzipCapped(new TextEncoder().encode('<testsuite/>')))).details).toEqual({ reason: 'report_not_gzip' });
  });

  it('reads a gzip-compressed report through the preview', async () => {
    const preview = await previewUpload(caller(state()), query(), gzipSync(xml('<testcase name="a"/><testcase name="b"/>')), 'gzip');
    expect(preview.mapped.map(row => row.entry.name)).toEqual(['a', 'b']);
  });
});

describe('previewUpload', () => {
  it('authorizes the Test before reading the report', async () => {
    const error = await apiError(async () => previewUpload(caller(state({ test: null })), query(), new TextEncoder().encode('<!DOCTYPE x><testsuite/>')));
    expect(error.status).toBe(404);
  });

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

  it('passes the CI details to the submission RPC, and none when the upload carries none (BK-2097)', async () => {
    const s = state();
    const body = xml('<testcase name="a"/><testcase name="b"/>');
    const ciParams = new URLSearchParams({ commit: 'A1B2C3D', branch: 'feature/checkout-discounts', pipeline_name: 'nightly-regression', pipeline_url: 'https://ci.acme.dev/p/42' });
    await executeUpload(caller(s, 'bearer', WS), { ...query(), ci: parseUploadCiContext(ciParams) }, body);
    expect(s.rpcCalls[0].args).toMatchObject({
      p_source: 'upload',
      p_ci_commit: 'a1b2c3d',
      p_ci_branch: 'feature/checkout-discounts',
      p_ci_pipeline_name: 'nightly-regression',
      p_ci_pipeline_url: 'https://ci.acme.dev/p/42',
    });
    await executeUpload(caller(s), { ...query(), ci: parseUploadCiContext(new URLSearchParams()) }, body);
    await executeUpload(caller(s), query(), body);
    for (const call of s.rpcCalls.slice(1)) {
      expect([call.args.p_ci_commit, call.args.p_ci_branch, call.args.p_ci_pipeline_name, call.args.p_ci_pipeline_url]).toEqual([undefined, undefined, undefined, undefined]);
    }
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
