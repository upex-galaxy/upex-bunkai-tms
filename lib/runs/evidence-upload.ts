import type { StepAttachment } from './evidence-view';
import { EVIDENCE_MESSAGES, EVIDENCE_SNIFF_BYTES } from '@lib/storage/evidence-policy';
import { validateEvidenceInit } from '@lib/storage/evidence-validation';
import { sniffImage } from '@lib/storage/image-sniff';

// BK-593 - the browser side of an evidence upload. Plain async function with an injectable
// fetch, so the sequence is testable without a browser or a server:
//   1. read the first 64 KiB and decide the type from the CONTENT (never the name or the
//      browser's guess), refusing a wrong file before any request with the same frozen copy
//      the server would give;
//   2. POST init (fresh Idempotency-Key per upload: attaching the same image twice is allowed);
//   3. PUT the raw bytes straight to Storage with the headers init returned;
//   4. POST commit (idempotent, so one retry after a dropped connection is safe).
// An upload that fails part-way leaves the step exactly as it was: the pending row is deleted
// (best effort; the sweep removes it after 3 hours otherwise) and nothing is ever shown.

export interface UploadableFile {
  name: string
  size: number
  slice: (start: number, end: number) => { arrayBuffer: () => Promise<ArrayBuffer> }
}

export type UploadOutcome = { ok: true, attachment: StepAttachment } | { ok: false, message: string, attachmentId?: string };

const UNREACHABLE = 'Could not reach the server. Nothing was saved. Try again.';
const UPLOAD_FAILED = 'The upload did not finish. Nothing was saved. Try again.';

interface InitBody<T> {
  attachment: T
  upload: { method: string, url: string, headers: Record<string, string> }
}

export async function uploadStepEvidence(args: {
  file: UploadableFile
  runId: string
  stepId: string
  fetchImpl?: typeof fetch
}): Promise<UploadOutcome> {
  return uploadEvidenceFile<StepAttachment>({
    file: args.file,
    base: `/api/v1/runs/${args.runId}/steps/${args.stepId}/attachments`,
    fetchImpl: args.fetchImpl,
  });
}

// BK-594 - the same four steps for any evidence surface whose routes share the BK-593 shape:
// POST {base} (init), PUT to Storage, POST {base}/{id}/commit, DELETE {base}/{id} (discard).
// `initFields` are extra init body fields (the defect drawer's draft id). `commitTimeoutMs`
// bounds each commit attempt, so a commit that hangs after the bytes landed (the BK-1450
// pattern) ends as a retryable failure instead of an endless "Uploading".
// A failure after init carries the upload id, so the caller can discard a row the server may
// still count (a commit that timed out may have landed).
export type EvidenceUploadOutcome<T> = { ok: true, attachment: T } | { ok: false, message: string, attachmentId?: string };

export async function uploadEvidenceFile<T extends { id: string }>(args: {
  file: UploadableFile
  base: string
  initFields?: Record<string, string>
  commitTimeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<EvidenceUploadOutcome<T>> {
  const doFetch = args.fetchImpl ?? fetch;
  const base = args.base;

  const checked = await precheckEvidenceFile(args.file);
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  let init: Response;
  try {
    init = await doFetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': newKey() },
      body: JSON.stringify({ ...args.initFields, filename: checked.value.filename, content_type: checked.value.contentType, byte_size: checked.value.byteSize }),
    });
  }
  catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (!init.ok) {
    return { ok: false, message: await errorMessage(init, 'Could not start the upload.') };
  }
  const created = (await init.json().catch(() => null)) as InitBody<T> | null;
  if (!created?.attachment?.id || !created.upload?.url) {
    return { ok: false, message: 'Could not start the upload.' };
  }
  const attachmentUrl = `${base}/${created.attachment.id}`;

  let put: Response;
  try {
    put = await doFetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: args.file as unknown as BodyInit });
  }
  catch {
    await discard(doFetch, attachmentUrl);
    return { ok: false, message: UNREACHABLE };
  }
  if (!put.ok) {
    await discard(doFetch, attachmentUrl);
    return { ok: false, message: UPLOAD_FAILED };
  }

  const commit = await commitWithRetry(doFetch, `${attachmentUrl}/commit`, args.commitTimeoutMs);
  if (commit === 'unreachable') {
    // The bytes may have landed. Commit is idempotent, but the connection is gone: leave the
    // pending row to the sweep (invisible meanwhile) rather than deleting what might commit.
    return { ok: false, message: UNREACHABLE, attachmentId: created.attachment.id };
  }
  if (!commit.ok) {
    return { ok: false, message: await errorMessage(commit, 'Could not finish the upload.'), attachmentId: created.attachment.id };
  }
  const done = (await commit.json().catch(() => null)) as { attachment?: T } | null;
  if (!done?.attachment) {
    return { ok: false, message: 'Could not finish the upload.', attachmentId: created.attachment.id };
  }
  return { ok: true, attachment: done.attachment };
}

// The content check the browser runs before any request: the type is decided from the first
// 64 KiB (never the name or the browser's guess), with the same frozen copy the server gives.
export async function precheckEvidenceFile(file: UploadableFile): Promise<{ ok: true, value: { filename: string, contentType: string, byteSize: number } } | { ok: false, message: string }> {
  const head = new Uint8Array(await file.slice(0, EVIDENCE_SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffImage(head);
  if (file.size === 0) {
    return { ok: false, message: EVIDENCE_MESSAGES.empty };
  }
  if (!sniffed) {
    return { ok: false, message: EVIDENCE_MESSAGES.unsupported_type };
  }
  if (sniffed.animated) {
    return { ok: false, message: EVIDENCE_MESSAGES.animated };
  }
  const checked = validateEvidenceInit({ filename: file.name || 'image', contentType: sniffed.type, byteSize: file.size });
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }
  return { ok: true, value: checked.value };
}

async function commitWithRetry(doFetch: typeof fetch, url: string, timeoutMs?: number): Promise<Response | 'unreachable'> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await doFetch(url, timeoutMs ? { method: 'POST', signal: AbortSignal.timeout(timeoutMs) } : { method: 'POST' });
    }
    catch {
      // retry once: commit is idempotent
    }
  }
  return 'unreachable';
}

async function discard(doFetch: typeof fetch, url: string): Promise<void> {
  try {
    await doFetch(url, { method: 'DELETE' });
  }
  catch {
    // best effort: the sweep removes a stale pending upload
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function newKey(): string {
  return crypto.randomUUID();
}
