import type { Principal } from '@lib/api/principal';
import type { UploadChainStep, UploadPreview } from '@lib/runs/ci-upload';
import { ApiError } from '@lib/api/error-envelope';
import { buildUploadPreview, toUploadSubmission } from '@lib/runs/ci-upload';
import { decodeReportBytes, JUNIT_MAX_BYTES, JunitReportError, readJunitReport } from '@lib/runs/junit-report';
import { mapSubmissionRpcError } from '@lib/runs/submission-errors';
import { submitAutomatedRun } from '@lib/supabase/rpc';
import { Gunzip } from 'fflate';

export type UploadCaller = Pick<Principal, 'userId' | 'workspaceId' | 'via' | 'tokenId' | 'db'>;

export interface UploadQuery {
  testId: string
  environment: string
  fileName: string
  acknowledgeUnmapped: boolean
  idempotencyKey?: string
  previewFingerprint?: string
}

export const UPLOAD_ENVIRONMENT_MAX = 60;
export const UPLOAD_KEY_MAX = 64;
export const UPLOAD_FILE_NAME_MAX = 255;
export const UPLOAD_DEFAULT_FILE_NAME = 'report.xml';
export const UPLOAD_CONTENT_TYPES = ['application/xml', 'text/xml', 'application/gzip', 'application/x-gzip'] as const;
export type UploadEncoding = 'xml' | 'gzip';
const GUNZIP_CHUNK = 16 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
// eslint-disable-next-line no-control-regex -- control characters never belong in a stored file name
const UNSAFE_NAME_CHARS = /[\u0000-\u001F\u007F]/g;

const SIZE_MESSAGE = 'The report is larger than 10 MB. Only JUnit XML (.xml) reports of 10 MB at most are accepted.';

function invalid(reason: string, message: string): never {
  throw new ApiError('validation_failed', message, { details: { reason } });
}

export function parseUploadQuery(params: URLSearchParams): UploadQuery {
  const testId = params.get('test_id') ?? '';
  if (!UUID_RE.test(testId)) {
    return invalid('test_id_invalid', 'test_id must be a valid UUID.');
  }
  const environment = (params.get('environment') ?? '').trim();
  if (environment.length < 1 || environment.length > UPLOAD_ENVIRONMENT_MAX) {
    return invalid(
      'environment_invalid',
      `environment must be the name of a Project environment (1 to ${UPLOAD_ENVIRONMENT_MAX} characters).`,
    );
  }
  const rawName = (params.get('file_name') ?? '').replace(UNSAFE_NAME_CHARS, '').split(/[\\/]/).pop()?.trim() ?? '';
  const fileName = rawName === '' ? UPLOAD_DEFAULT_FILE_NAME : rawName.slice(0, UPLOAD_FILE_NAME_MAX);

  const ack = params.get('acknowledge_unmapped');
  const key = params.get('idempotency_key');
  if (key !== null && (key.length < 1 || key.length > UPLOAD_KEY_MAX)) {
    return invalid('idempotency_key_invalid', `idempotency_key must be between 1 and ${UPLOAD_KEY_MAX} characters.`);
  }
  const fingerprint = params.get('preview_fingerprint');
  if (fingerprint !== null && !FINGERPRINT_RE.test(fingerprint)) {
    return invalid('preview_fingerprint_invalid', 'preview_fingerprint must be the fingerprint returned by the preview.');
  }
  return {
    testId,
    environment,
    fileName,
    acknowledgeUnmapped: ack === 'true' || ack === '1',
    idempotencyKey: key ?? undefined,
    previewFingerprint: fingerprint ?? undefined,
  };
}

export function assertXmlContentType(header: string | null): UploadEncoding {
  const type = (header ?? '').split(';')[0].trim().toLowerCase();
  if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(type)) {
    throw new ApiError(
      'unsupported_media_type',
      'Send the report as the request body with Content-Type: application/xml (or application/gzip for a gzip-compressed report). Only JUnit XML (.xml) reports of 10 MB at most are accepted.',
      { details: { reason: 'content_type_invalid', accepted: UPLOAD_CONTENT_TYPES } },
    );
  }
  return type.endsWith('gzip') ? 'gzip' : 'xml';
}

function tooLarge(): never {
  throw new ApiError('file_too_large', SIZE_MESSAGE, { details: { reason: 'file_too_large', max_bytes: JUNIT_MAX_BYTES } });
}

class InflateLimitError extends Error {}

export function gunzipCapped(bytes: Uint8Array, max: number = JUNIT_MAX_BYTES): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    total += chunk.byteLength;
    if (total > max) {
      throw new InflateLimitError();
    }
    chunks.push(chunk);
  });
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += GUNZIP_CHUNK) {
      stream.push(bytes.subarray(offset, offset + GUNZIP_CHUNK), offset + GUNZIP_CHUNK >= bytes.byteLength);
    }
  }
  catch (error) {
    if (error instanceof InflateLimitError) {
      return tooLarge();
    }
    throw new ApiError('validation_failed', 'The body is declared as gzip but is not a valid gzip file. Send the JUnit XML report as application/xml or gzip it whole.', {
      details: { reason: 'report_not_gzip' },
    });
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  max: number = JUNIT_MAX_BYTES,
): Promise<Uint8Array> {
  const declared = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared > max) {
    return tooLarge();
  }
  if (!body) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function testNotFound(): never {
  throw new ApiError('not_found', 'Test not found.', { details: { reason: 'test_not_found' } });
}

function assertBearerShape(caller: UploadCaller): void {
  if (caller.via !== 'bearer') {
    return;
  }
  if (!caller.tokenId) {
    throw new ApiError('unauthorized', 'The access token is not valid for this request.', { details: { reason: 'token_invalid' } });
  }
  if (caller.workspaceId === null) {
    throw new ApiError('forbidden', 'This token is not scoped to a workspace; it cannot upload runs.', {
      details: { reason: 'token_not_workspace_scoped' },
    });
  }
}

interface LoadedTest {
  test: { id: string, title: string }
  chain: UploadChainStep[]
}

async function loadTestChain(caller: UploadCaller, testId: string, environment: string): Promise<LoadedTest> {
  const { data: test } = await caller.db
    .from('tests')
    .select('id, title, workspace_id, archived_at')
    .eq('id', testId)
    .maybeSingle();
  if (!test || (caller.via === 'bearer' && test.workspace_id !== caller.workspaceId)) {
    return testNotFound();
  }
  if (test.archived_at !== null) {
    throw new ApiError('conflict', 'This Test is archived. Restore it before uploading results.', {
      details: { reason: 'test_archived' },
    });
  }

  const { data: rows, error } = await caller.db
    .from('test_steps')
    .select('position, atc_id, atcs(title, project_id)')
    .eq('test_id', testId)
    .order('position', { ascending: true });
  if (error) {
    throw new ApiError('internal_error', 'Could not read the Test chain.');
  }
  const steps = (rows ?? []) as unknown as { position: number, atc_id: string, atcs: { title: string, project_id: string } | null }[];
  if (steps.length === 0 || steps.some(step => step.atcs === null)) {
    throw new ApiError('no_executable_steps', 'This Test has no executable steps and cannot receive results.', {
      details: { reason: 'no_executable_steps' },
    });
  }

  const projectId = steps[0].atcs!.project_id;
  const { data: environments } = await caller.db
    .from('project_environments')
    .select('name')
    .eq('project_id', projectId);
  const known = (environments ?? []).some(env => env.name.toLowerCase() === environment.toLowerCase());
  if (!known) {
    throw new ApiError('environment_invalid', `Environment "${environment}" is not configured for this Test's Project.`, {
      details: { reason: 'environment_invalid', environment },
    });
  }

  return {
    test: { id: test.id, title: test.title },
    chain: steps.map((step, i) => ({ position: i + 1, atcId: step.atc_id, title: step.atcs!.title })),
  };
}

function readReport(bytes: Uint8Array, encoding: UploadEncoding) {
  const raw = encoding === 'gzip' ? (bytes.byteLength === 0 ? bytes : gunzipCapped(bytes)) : bytes;
  try {
    return readJunitReport(decodeReportBytes(raw));
  }
  catch (error) {
    if (error instanceof JunitReportError) {
      throw new ApiError('validation_failed', error.message, { details: { reason: error.reason } });
    }
    throw error;
  }
}

export async function previewUpload(
  caller: UploadCaller,
  query: UploadQuery,
  bytes: Uint8Array,
  encoding: UploadEncoding = 'xml',
): Promise<UploadPreview> {
  assertBearerShape(caller);
  const { test, chain } = await loadTestChain(caller, query.testId, query.environment);
  const report = readReport(bytes, encoding);
  return buildUploadPreview({ test, environment: query.environment, fileName: query.fileName, chain, report });
}

export interface UploadResult {
  status: 200 | 201
  body: { run: unknown }
}

export async function executeUpload(
  caller: UploadCaller,
  query: UploadQuery,
  bytes: Uint8Array,
  encoding: UploadEncoding = 'xml',
): Promise<UploadResult> {
  const preview = await previewUpload(caller, query, bytes, encoding);
  if (query.previewFingerprint !== undefined && query.previewFingerprint !== preview.fingerprint) {
    throw new ApiError('conflict', 'The Test or the report changed after the preview. Review the mapping again before creating the run.', {
      details: { reason: 'preview_stale' },
    });
  }
  if (preview.requires_acknowledgement && !query.acknowledgeUnmapped) {
    throw new ApiError(
      'validation_failed',
      `${preview.unmapped.length} report ${preview.unmapped.length === 1 ? 'entry has' : 'entries have'} no matching step. Acknowledge them (acknowledge_unmapped=true) to record them as not mapped.`,
      { details: { reason: 'unmapped_not_acknowledged', unmapped: preview.unmapped.map(entry => ({ index: entry.index, name: entry.name })) } },
    );
  }

  const submission = toUploadSubmission(preview);
  const { data, error } = await submitAutomatedRun(caller.db, {
    actorUserId: caller.userId,
    tokenId: caller.via === 'bearer' ? caller.tokenId : null,
    testId: query.testId,
    environmentName: query.environment,
    verdict: submission.verdict,
    durationSeconds: submission.durationSeconds,
    steps: submission.steps,
    evidenceUrls: [],
    idempotencyKey: query.idempotencyKey,
    upload: { stepNotes: submission.stepNotes, report: submission.report },
  });
  if (error) {
    mapSubmissionRpcError({ code: error.code, message: error.message, details: error.details });
  }

  const replayed = (data as { replayed?: boolean } | null)?.replayed === true;
  return { status: replayed ? 200 : 201, body: { run: data } };
}
