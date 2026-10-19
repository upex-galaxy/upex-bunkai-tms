import type { EvidenceStorageClient } from './run-evidence-storage';
import { describe, expect, it } from 'bun:test';
import { EVIDENCE_BUCKET, EVIDENCE_SNIFF_BYTES } from './evidence-policy';
import {
  createEvidenceReadUrl,
  createEvidenceUploadTarget,
  deleteEvidenceObject,
  readEvidenceObject,
} from './run-evidence-storage';

// BK-593 - the Storage seam of the evidence routes, against a fake Storage client. The real
// bucket is NOT exercised here (pending apply of migration 0097).

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

interface Calls { bucket: string[], signedUpload: string[], info: string[], signedUrl: Array<[string, number]>, remove: string[][] }

function fakeStorage(overrides: Partial<{
  signedUpload: () => Promise<unknown>
  info: () => Promise<unknown>
  signedUrl: () => Promise<unknown>
  remove: () => Promise<unknown>
}> = {}) {
  const calls: Calls = { bucket: [], signedUpload: [], info: [], signedUrl: [], remove: [] };
  const client = {
    storage: {
      from(bucket: string) {
        calls.bucket.push(bucket);
        return {
          createSignedUploadUrl: async (path: string) => {
            calls.signedUpload.push(path);
            return overrides.signedUpload ? overrides.signedUpload() : { data: { signedUrl: `https://storage.test/upload/${path}?token=t`, token: 't', path }, error: null };
          },
          info: async (path: string) => {
            calls.info.push(path);
            return overrides.info ? overrides.info() : { data: { size: 2048, contentType: 'image/png' }, error: null };
          },
          createSignedUrl: async (path: string, seconds: number) => {
            calls.signedUrl.push([path, seconds]);
            return overrides.signedUrl ? overrides.signedUrl() : { data: { signedUrl: `https://storage.test/read/${path}?token=r` }, error: null };
          },
          remove: async (paths: string[]) => {
            calls.remove.push(paths);
            return overrides.remove ? overrides.remove() : { data: [], error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as EvidenceStorageClient, calls };
}

describe('createEvidenceUploadTarget', () => {
  it('signs an upload for the server-chosen path and returns the PUT contract', async () => {
    const { client, calls } = fakeStorage();
    const before = Date.now();
    const target = await createEvidenceUploadTarget(client, { path: 'w/r/s/a', contentType: 'image/webp' });
    expect(calls.bucket).toEqual([EVIDENCE_BUCKET]);
    expect(calls.signedUpload).toEqual(['w/r/s/a']);
    expect(target.method).toBe('PUT');
    expect(target.url).toBe('https://storage.test/upload/w/r/s/a?token=t');
    expect(target.headers).toEqual({ 'content-type': 'image/webp', 'x-upsert': 'false', 'cache-control': 'max-age=3600' });
    const lifetime = Date.parse(target.expires_at) - before;
    expect(lifetime).toBeGreaterThan(2 * 3_600_000 - 60_000);
    expect(lifetime).toBeLessThanOrEqual(2 * 3_600_000 + 1000);
  });

  it('answers 503 storage_unavailable when Storage refuses to sign', async () => {
    const { client } = fakeStorage({ signedUpload: async () => ({ data: null, error: { message: 'boom' } }) });
    expect(await rejection(createEvidenceUploadTarget(client, { path: 'p', contentType: 'image/png' }))).toMatchObject({ code: 'storage_unavailable', status: 503 });
  });
});

describe('readEvidenceObject', () => {
  function streamOf(bytes: Uint8Array, chunk = 1000): ReadableStream<Uint8Array> {
    let offset = 0;
    return new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset += chunk;
      },
    });
  }

  it('reads the size from Storage metadata and only the first 64 KiB of the object', async () => {
    const { client, calls } = fakeStorage();
    const big = new Uint8Array(EVIDENCE_SNIFF_BYTES * 3).fill(7);
    const seen: Array<{ url: string, range: string | null }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, range: new Headers(init?.headers).get('range') });
      return new Response(streamOf(big), { status: 206 });
    }) as unknown as typeof fetch;

    const result = await readEvidenceObject(client, { path: 'w/r/s/a', fetchImpl });
    expect(result.status).toBe('found');
    if (result.status !== 'found') { return; }
    expect(result.size).toBe(2048);
    expect(result.head.length).toBe(EVIDENCE_SNIFF_BYTES);
    expect(calls.signedUrl).toEqual([['w/r/s/a', 60]]);
    expect(seen[0].range).toBe(`bytes=0-${EVIDENCE_SNIFF_BYTES - 1}`);
  });

  it('still returns a short head when the object is smaller than 64 KiB, and copes with a server that ignores Range (200)', async () => {
    const { client } = fakeStorage();
    const small = Uint8Array.from([1, 2, 3, 4]);
    const found = await readEvidenceObject(client, { path: 'p', fetchImpl: (async () => new Response(streamOf(small), { status: 200 })) as unknown as typeof fetch });
    expect(found).toMatchObject({ status: 'found', size: 2048 });
    if (found.status === 'found') { expect(Array.from(found.head)).toEqual([1, 2, 3, 4]); }
  });

  it('reports a missing object (the client never uploaded) without calling it unavailable', async () => {
    const { client } = fakeStorage({ info: async () => ({ data: null, error: { message: 'Object not found', status: 404 } }) });
    const result = await readEvidenceObject(client, { path: 'p', fetchImpl: (async () => new Response('')) as unknown as typeof fetch });
    expect(result).toEqual({ status: 'missing' });
  });

  it('answers 503 when Storage metadata, signing or the ranged read fails', async () => {
    const dummy = (async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    const infoDown = fakeStorage({ info: async () => ({ data: null, error: { message: 'timeout', status: 500 } }) });
    expect(await rejection(readEvidenceObject(infoDown.client, { path: 'p', fetchImpl: dummy }))).toMatchObject({ code: 'storage_unavailable' });
    const signDown = fakeStorage({ signedUrl: async () => ({ data: null, error: { message: 'x' } }) });
    expect(await rejection(readEvidenceObject(signDown.client, { path: 'p', fetchImpl: dummy }))).toMatchObject({ code: 'storage_unavailable' });
    const { client } = fakeStorage();
    expect(await rejection(readEvidenceObject(client, { path: 'p', fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch }))).toMatchObject({ code: 'storage_unavailable' });
  });

  it('treats a metadata answer without a numeric size as unavailable', async () => {
    const { client } = fakeStorage({ info: async () => ({ data: { contentType: 'image/png' }, error: null }) });
    expect(await rejection(readEvidenceObject(client, { path: 'p', fetchImpl: (async () => new Response('')) as unknown as typeof fetch }))).toMatchObject({ code: 'storage_unavailable' });
  });
});

describe('deleteEvidenceObject and createEvidenceReadUrl', () => {
  it('delete is best effort: a Storage failure is swallowed (the outbox retries it)', async () => {
    const ok = fakeStorage();
    expect(await deleteEvidenceObject(ok.client, 'w/r/s/a')).toBe(true);
    expect(ok.calls.remove).toEqual([['w/r/s/a']]);
    const down = fakeStorage({ remove: async () => ({ data: null, error: { message: 'down' } }) });
    expect(await deleteEvidenceObject(down.client, 'p')).toBe(false);
    const throws = fakeStorage({ remove: async () => { throw new Error('network'); } });
    expect(await deleteEvidenceObject(throws.client, 'p')).toBe(false);
  });

  it('mints a 60 second read URL, and 503s when Storage cannot', async () => {
    const { client, calls } = fakeStorage();
    expect(await createEvidenceReadUrl(client, 'w/r/s/a')).toBe('https://storage.test/read/w/r/s/a?token=r');
    expect(calls.signedUrl).toEqual([['w/r/s/a', 60]]);
    const down = fakeStorage({ signedUrl: async () => ({ data: null, error: { message: 'x' } }) });
    expect(await rejection(createEvidenceReadUrl(down.client, 'p'))).toMatchObject({ code: 'storage_unavailable' });
  });
});
