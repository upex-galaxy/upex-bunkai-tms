import type { UploadableFile } from './evidence-upload';
import { describe, expect, it } from 'bun:test';
import { uploadStepEvidence } from './evidence-upload';

// BK-593 - the browser's upload sequence (init -> PUT to Storage -> commit) against a scripted
// fetch. Nothing here talks to a server or to a bucket.

const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
const APNG = Uint8Array.from([...PNG, 0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4C, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
const RUN = 'run-1';
const STEP = 'step-1';
const ATT = { id: 'att-1', run_id: RUN, run_step_id: STEP, filename: 'shot.png', content_type: 'image/png', byte_size: 33, status: 'pending', created_by: 'me', created_at: 'now', committed_at: null };

function file(bytes: Uint8Array, name = 'shot.png', size = bytes.length): UploadableFile {
  return {
    name,
    size,
    slice: (start: number, end: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }),
  } as unknown as UploadableFile;
}

interface Call { url: string, method: string, headers: Record<string, string>, body: unknown }
type Step = { status: number, json?: unknown } | 'throw';

// Scripted fetch: answers calls in order, records them.
function script(steps: Step[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body });
    const step = steps[i] ?? { status: 200, json: {} };
    i += 1;
    if (step === 'throw') { throw new TypeError('network down'); }
    return new Response(step.json === undefined ? null : JSON.stringify(step.json), { status: step.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const INIT_OK: Step = { status: 201, json: { attachment: ATT, upload: { method: 'PUT', url: 'https://storage.test/up?token=t', headers: { 'content-type': 'image/png', 'x-upsert': 'false' }, expires_at: 'later' } } };
const COMMIT_OK: Step = { status: 200, json: { attachment: { ...ATT, status: 'committed' } } };

describe('uploadStepEvidence', () => {
  it('sends init with the SNIFFED type and an Idempotency-Key, PUTs the raw bytes with the returned headers, then commits', async () => {
    const f = script([INIT_OK, { status: 200 }, COMMIT_OK]);
    const body = file(PNG, 'whatever.txt');
    const result = await uploadStepEvidence({ file: body, runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result).toMatchObject({ ok: true, attachment: { id: 'att-1', status: 'committed' } });

    expect(f.calls.map(c => `${c.method} ${c.url}`)).toEqual([
      `POST /api/v1/runs/${RUN}/steps/${STEP}/attachments`,
      'PUT https://storage.test/up?token=t',
      `POST /api/v1/runs/${RUN}/steps/${STEP}/attachments/att-1/commit`,
    ]);
    expect(f.calls[0].headers['idempotency-key']).toMatch(/^[\w-]{8,128}$/);
    expect(JSON.parse(f.calls[0].body as string)).toEqual({ filename: 'whatever.txt', content_type: 'image/png', byte_size: PNG.length });
    expect(f.calls[1].headers['content-type']).toBe('image/png');
    expect(f.calls[1].headers['x-upsert']).toBe('false');
    expect(f.calls[1].body).toBe(body);
  });

  it('uses a fresh Idempotency-Key per upload (the same image twice is a choice, not a retry)', async () => {
    const a = script([INIT_OK, { status: 200 }, COMMIT_OK]);
    const b = script([INIT_OK, { status: 200 }, COMMIT_OK]);
    await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: a.fetchImpl });
    await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: b.fetchImpl });
    expect(a.calls[0].headers['idempotency-key']).not.toBe(b.calls[0].headers['idempotency-key']);
  });

  it('refuses a wrong file in the browser, with the frozen copy and no request at all', async () => {
    const cases: Array<[UploadableFile, string]> = [
      [file(GIF, 'cat.png'), 'Only PNG, JPEG or WebP images are accepted.'],
      [file(new Uint8Array(0), 'empty.png', 0), 'That file is empty or is not a valid PNG, JPEG or WebP image.'],
      [file(PNG, 'big.png', 10 * 1024 * 1024 + 1), 'Images must be 10 MiB or smaller.'],
      [file(APNG, 'anim.png'), 'Animated images are not supported. Attach a still PNG, JPEG or WebP image.'],
    ];
    for (const [candidate, message] of cases) {
      const f = script([]);
      const result = await uploadStepEvidence({ file: candidate, runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
      expect(result).toEqual({ ok: false, message });
      expect(f.calls).toHaveLength(0);
    }
  });

  it('accepts a file of exactly 10 MiB', async () => {
    const f = script([INIT_OK, { status: 200 }, COMMIT_OK]);
    const result = await uploadStepEvidence({ file: file(PNG, 'max.png', 10 * 1024 * 1024), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result.ok).toBe(true);
  });

  it('shows the server copy verbatim when init is refused, and sends nothing else', async () => {
    const f = script([{ status: 422, json: { error: { code: 'attachment_limit_exceeded', message: 'This step already holds the maximum evidence (10 images or 50 MiB).' } } }]);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result).toEqual({ ok: false, message: 'This step already holds the maximum evidence (10 images or 50 MiB).' });
    expect(f.calls).toHaveLength(1);
  });

  it('leaves nothing behind when the PUT fails: the pending attachment is deleted and the step is untouched', async () => {
    const f = script([INIT_OK, { status: 403 }, { status: 204 }]);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Nothing was saved');
    expect(f.calls.map(c => c.method)).toEqual(['POST', 'PUT', 'DELETE']);
    expect(f.calls[2].url).toBe(`/api/v1/runs/${RUN}/steps/${STEP}/attachments/att-1`);
  });

  it('survives a dropped connection mid-upload with the same promise: nothing saved, cleanup attempted, no throw', async () => {
    const f = script([INIT_OK, 'throw', { status: 204 }]);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Nothing was saved');
    expect(f.calls.map(c => c.method)).toEqual(['POST', 'PUT', 'DELETE']);
  });

  it('reports an unreachable server on init without a cleanup call (there is nothing to clean)', async () => {
    const f = script(['throw']);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Nothing was saved');
    expect(f.calls).toHaveLength(1);
  });

  it('shows the server copy when commit refuses what arrived (the server already discarded it)', async () => {
    const f = script([INIT_OK, { status: 200 }, { status: 422, json: { error: { code: 'validation_failed', message: 'That file is empty or is not a valid PNG, JPEG or WebP image.' } } }]);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result).toEqual({ ok: false, message: 'That file is empty or is not a valid PNG, JPEG or WebP image.' });
    expect(f.calls.map(c => c.method)).toEqual(['POST', 'PUT', 'POST']);
  });

  it('retries commit once on a network drop, since commit is idempotent', async () => {
    const f = script([INIT_OK, { status: 200 }, 'throw', COMMIT_OK]);
    const result = await uploadStepEvidence({ file: file(PNG), runId: RUN, stepId: STEP, fetchImpl: f.fetchImpl });
    expect(result.ok).toBe(true);
    expect(f.calls.map(c => c.method)).toEqual(['POST', 'PUT', 'POST', 'POST']);
  });
});
