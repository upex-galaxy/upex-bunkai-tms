import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { EVIDENCE_BUCKET, EVIDENCE_READ_URL_SECONDS, EVIDENCE_SNIFF_BYTES } from './evidence-policy';

// BK-593 - the server-side Storage seam of the evidence routes. Every call is made with the
// service-role client AFTER an RPC or RLS check (the bucket has no client policy, ADR-0019).
// The client is passed in, so this module stays testable with a fake and never reads the
// environment itself. Server only: never import it from a client component.
//
// NOT proven against a real bucket in this repo until migration 0097 is applied
// (pending-apply): the unit tests use a fake Storage client.

export type EvidenceStorageClient = Pick<SupabaseClient, 'storage'>;

// Supabase signed upload URLs live 2 hours and cannot be shortened.
const UPLOAD_URL_LIFETIME_MS = 2 * 60 * 60 * 1000;

function unavailable(what: string): ApiError {
  return new ApiError('storage_unavailable', 'File storage is temporarily unavailable. Please try again.', {
    details: { reason: 'storage_unavailable', operation: what },
  });
}

function bucket(client: EvidenceStorageClient) {
  return client.storage.from(EVIDENCE_BUCKET);
}

export interface EvidenceUploadTarget {
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expires_at: string
}

// The browser (or an agent) PUTs the raw bytes to `url` with exactly these headers.
// `x-upsert: false` makes a second PUT to the same path fail instead of overwriting.
export async function createEvidenceUploadTarget(
  client: EvidenceStorageClient,
  args: { path: string, contentType: string },
): Promise<EvidenceUploadTarget> {
  const { data, error } = await bucket(client).createSignedUploadUrl(args.path);
  if (error || !data?.signedUrl) {
    throw unavailable('sign_upload');
  }
  return {
    method: 'PUT',
    url: data.signedUrl,
    headers: {
      'content-type': args.contentType,
      'x-upsert': 'false',
      'cache-control': 'max-age=3600',
    },
    expires_at: new Date(Date.now() + UPLOAD_URL_LIFETIME_MS).toISOString(),
  };
}

export type EvidenceObject
  = | { status: 'missing' }
    | { status: 'found', size: number, head: Uint8Array };

// Size comes from Storage METADATA (never from what the client declared); the type is decided
// from the first 64 KiB, read with a Range request on a short-lived signed URL. A server that
// ignores Range answers 200 with the whole body: the stream is cut after 64 KiB either way.
export async function readEvidenceObject(
  client: EvidenceStorageClient,
  args: { path: string, fetchImpl?: typeof fetch },
): Promise<EvidenceObject> {
  const files = bucket(client);
  const info = await files.info(args.path);
  if (info.error) {
    const status = (info.error as { status?: number }).status;
    if (status === 404 || /not.?found/i.test(info.error.message)) {
      return { status: 'missing' };
    }
    throw unavailable('info');
  }
  const size = info.data?.size;
  if (typeof size !== 'number') {
    throw unavailable('info');
  }

  const signed = await files.createSignedUrl(args.path, EVIDENCE_READ_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw unavailable('sign_read');
  }
  const doFetch = args.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(signed.data.signedUrl, { headers: { Range: `bytes=0-${EVIDENCE_SNIFF_BYTES - 1}` } });
  }
  catch {
    throw unavailable('read_head');
  }
  if (!response.ok || !response.body) {
    throw unavailable('read_head');
  }
  return { status: 'found', size, head: await readHead(response.body) };
}

async function readHead(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const out = new Uint8Array(EVIDENCE_SNIFF_BYTES);
  let filled = 0;
  try {
    while (filled < EVIDENCE_SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done) { break; }
      const take = Math.min(value.length, EVIDENCE_SNIFF_BYTES - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  }
  finally {
    await reader.cancel().catch(() => undefined);
  }
  return out.slice(0, filled);
}

// Best effort. The AFTER DELETE trigger already queued the path in storage_cleanup_queue, so a
// failure here is retried by the daily sweep; it must never turn a successful remove into an
// error for the caller.
export async function deleteEvidenceObject(client: EvidenceStorageClient, path: string): Promise<boolean> {
  try {
    const { error } = await bucket(client).remove([path]);
    return !error;
  }
  catch {
    return false;
  }
}

// A 60 second URL for the content route's 302. Never log the returned value.
export async function createEvidenceReadUrl(client: EvidenceStorageClient, path: string): Promise<string> {
  const { data, error } = await bucket(client).createSignedUrl(path, EVIDENCE_READ_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw unavailable('sign_read');
  }
  return data.signedUrl;
}
