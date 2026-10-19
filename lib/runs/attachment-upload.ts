import type { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import type { AttachmentInitBody } from '@lib/runs/attachment-validation';
import type { EvidenceStorageClient } from '@lib/storage/run-evidence-storage';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { evidenceRefusalError, mapAttachmentRpcError } from '@lib/runs/attachment-errors';
import { isEvidenceMimeType } from '@lib/storage/evidence-policy';
import { validateEvidenceInit, validateStoredEvidence } from '@lib/storage/evidence-validation';
import { createEvidenceUploadTarget, deleteEvidenceObject, readEvidenceObject } from '@lib/storage/run-evidence-storage';
import { commitRunStepAttachment, initRunStepAttachment, removeRunStepAttachment } from '@lib/supabase/rpc';

// BK-593 - the two server steps of an evidence upload (ADR-0019):
//   init   -> authorize + lock + quota + pending row (RPC), then sign an upload URL;
//   commit -> read what ARRIVED in Storage, validate it, then flip the row (RPC).
// The browser PUTs the bytes straight to Storage in between (a Vercel Function cannot carry a
// 10 MiB body). Authorization is the RPC's: it reads auth.uid(), so `db` MUST be the caller's
// own RLS-scoped client. `admin` (service role) is used only for Storage and for reading the
// caller's OWN pending row, which RLS hides on purpose.

export interface FinishDeps {
  db: SupabaseClient<Database>
  admin: SupabaseClient<Database>
  userId: string
  fetchImpl?: typeof fetch
}

export interface UploadDeps extends FinishDeps {
  // Injected by the route (the real implementation reads the service-role environment, which
  // a unit test must not load).
  idempotency: {
    begin: typeof beginIdempotentRequest
    record: typeof recordIdempotencyResult
    discard: typeof discardIdempotencyResult
  }
}

export interface UploadResult { status: number, body: unknown }

const INIT_ENDPOINT = 'POST /api/v1/runs/{id}/steps/{stepId}/attachments';

export async function startAttachmentUpload(
  deps: UploadDeps,
  args: { headers: Headers, runId: string, stepId: string, body: AttachmentInitBody },
): Promise<UploadResult> {
  const validated = validateEvidenceInit({
    filename: args.body.filename,
    contentType: args.body.content_type,
    byteSize: args.body.byte_size,
  });
  if (!validated.ok) {
    throw evidenceRefusalError(validated.refusal, validated.message);
  }
  const { filename, contentType, byteSize } = validated.value;

  const idem = deps.idempotency;
  const begin = await idem.begin({
    headers: args.headers,
    userId: deps.userId,
    endpoint: INIT_ENDPOINT,
    workspaceId: null,
    requestPayload: { run_id: args.runId, step_id: args.stepId, filename, content_type: contentType, byte_size: byteSize },
  });
  if (begin.isReplay) {
    return { status: begin.status, body: begin.snapshot };
  }

  // Any throw before the response is built must not strand the pending key: discard it so
  // the same key can be retried (a 503 is safe to retry with the same key).
  let responseBody: { attachment: unknown, upload: unknown };
  try {
    const { data, error } = await initRunStepAttachment(deps.db, { runId: args.runId, stepId: args.stepId, filename, contentType, byteSize });
    if (error) {
      mapAttachmentRpcError(error);
    }
    const created = data as unknown as { attachment: { id: string }, storage_path: string };
    let upload;
    try {
      upload = await createEvidenceUploadTarget(deps.admin, { path: created.storage_path, contentType });
    }
    catch (signError) {
      // No upload URL means no upload will ever arrive: drop the pending row now (the sweep
      // would do it in 3 hours). Failure of this cleanup is not worth masking the 503.
      await removeRunStepAttachment(deps.db, { attachmentId: created.attachment.id }).catch(() => undefined);
      throw signError;
    }
    responseBody = { attachment: created.attachment, upload };
  }
  catch (raw) {
    await idem.discard(begin.token);
    throw raw;
  }

  // The row exists from here on: a snapshot-store failure must not fail the request.
  try {
    await idem.record(begin.token, responseBody, 201);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for the attachment init route', recordError);
  }
  return { status: 201, body: responseBody };
}

interface PendingRow {
  id: string
  storage_path: string
  content_type: string
  status: string
  created_by: string | null
  byte_size: number
}

export async function finishAttachmentUpload(
  deps: FinishDeps,
  args: { runId: string, stepId: string, attachmentId: string },
): Promise<UploadResult> {
  // The caller's own row, matched on every id in the URL. RLS hides pending rows from the
  // caller, so the service role reads it; the commit RPC below stays the authority (member+,
  // uploader, window, Run state, quotas). A row that is not the caller's is a plain 404.
  const { data, error } = await deps.admin
    .from('run_step_attachments')
    .select('id, storage_path, content_type, status, created_by, byte_size')
    .eq('id', args.attachmentId)
    .eq('run_id', args.runId)
    .eq('run_step_id', args.stepId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'Could not read the attachment.');
  }
  const row = data as PendingRow | null;
  if (!row || row.created_by !== deps.userId) {
    throw new ApiError('not_found', 'Attachment not found.', { details: { reason: 'not_found' } });
  }

  // Retry of an already committed row: the RPC answers with the same body, nothing is read.
  if (row.status === 'committed') {
    return commitAndRespond(deps, row.id, row.byte_size);
  }

  const object = await readEvidenceObject(deps.admin, { path: row.storage_path, fetchImpl: deps.fetchImpl });
  if (object.status === 'missing') {
    throw new ApiError('conflict', 'The file has not been uploaded yet.', { details: { reason: 'upload_missing' } });
  }
  if (!isEvidenceMimeType(row.content_type)) {
    throw new ApiError('internal_error', 'Stored attachment has an unsupported type.');
  }

  const checked = validateStoredEvidence({ declaredType: row.content_type, actualSize: object.size, head: object.head });
  if (!checked.ok) {
    // What arrived is not acceptable: discard the pending row (RPC: uploader, Run running)
    // and the object. If the RPC refuses (Run closed), the sweep removes both later.
    const removed = await removeRunStepAttachment(deps.db, { attachmentId: row.id });
    if (!removed.error) {
      await deleteEvidenceObject(deps.admin, row.storage_path);
    }
    throw evidenceRefusalError(checked.refusal, checked.message);
  }

  return commitAndRespond(deps, row.id, checked.value.byteSize);
}

async function commitAndRespond(deps: FinishDeps, attachmentId: string, byteSize: number): Promise<UploadResult> {
  const { data, error } = await commitRunStepAttachment(deps.db, { attachmentId, byteSize });
  if (error) {
    mapAttachmentRpcError(error);
  }
  return { status: 200, body: data };
}

export type { EvidenceStorageClient };
