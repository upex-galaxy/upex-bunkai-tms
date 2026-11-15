import type { FinishDeps, UploadDeps, UploadResult } from '@lib/runs/attachment-upload';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { mapBugEvidenceRpcError } from '@lib/bugs/evidence-errors';
import { evidenceRefusalError } from '@lib/runs/attachment-errors';
import { isEvidenceMimeType } from '@lib/storage/evidence-policy';
import { validateEvidenceInit, validateStoredEvidence } from '@lib/storage/evidence-validation';
import { createEvidenceReadUrl, createEvidenceUploadTarget, deleteEvidenceObject, readEvidenceObject } from '@lib/storage/run-evidence-storage';
import { commitBugEvidence, discardBugEvidence, initBugEvidence } from '@lib/supabase/rpc';
import { z } from 'zod';

// BK-594 - the server side of a defect evidence upload. Same three steps as BK-593
// (ADR-0019): init (authorize + draft cap + pending row, then sign an upload URL), a direct
// browser PUT to Storage, commit (read what ARRIVED, validate it, flip the row). The upload is
// owned by the uploader and counted against a draft (one open Report-bug drawer) until
// bunkai_create_bug claims it (migration 0131). Authorization is the RPC's: it reads
// auth.uid(), so `db` MUST be the caller's own RLS-scoped client. `admin` (service role) is
// used only for Storage and for reading the caller's OWN unclaimed row, which RLS hides.

export const BugEvidenceInitBodySchema = z.object({
  filename: z.string(),
  content_type: z.string(),
  byte_size: z.number(),
  draft_id: z.string().uuid(),
});

export type BugEvidenceInitBody = z.infer<typeof BugEvidenceInitBodySchema>;

const INIT_ENDPOINT = 'POST /api/v1/projects/{id}/bug-evidence';

function notFound(): ApiError {
  return new ApiError('not_found', 'Attachment not found.', { details: { reason: 'not_found' } });
}

export async function startBugEvidenceUpload(
  deps: UploadDeps,
  args: { headers: Headers, projectId: string, body: BugEvidenceInitBody },
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
    requestPayload: { project_id: args.projectId, draft_id: args.body.draft_id, filename, content_type: contentType, byte_size: byteSize },
  });
  if (begin.isReplay) {
    return { status: begin.status, body: begin.snapshot };
  }

  let responseBody: { attachment: unknown, upload: unknown };
  try {
    const { data, error } = await initBugEvidence(deps.db, {
      projectId: args.projectId,
      draftId: args.body.draft_id,
      filename,
      contentType,
      byteSize,
    });
    if (error) {
      mapBugEvidenceRpcError(error);
    }
    const created = data as unknown as { attachment: { id: string }, storage_path: string };
    let upload;
    try {
      upload = await createEvidenceUploadTarget(deps.admin, { path: created.storage_path, contentType });
    }
    catch (signError) {
      // No upload URL means no upload will ever arrive: drop the pending row now.
      await discardBugEvidence(deps.db, { attachmentId: created.attachment.id }).catch(() => undefined);
      throw signError;
    }
    responseBody = { attachment: created.attachment, upload };
  }
  catch (raw) {
    await idem.discard(begin.token);
    throw raw;
  }

  try {
    await idem.record(begin.token, responseBody, 201);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for the bug evidence init route', recordError);
  }
  return { status: 201, body: responseBody };
}

interface OwnRow {
  id: string
  storage_path: string
  content_type: string
  status: string
  created_by: string | null
  byte_size: number
  bug_id: string | null
}

const OWN_COLUMNS = 'id, storage_path, content_type, status, created_by, byte_size, bug_id';

// The caller's own row under this project. RLS hides unclaimed rows from everybody, so the
// service role reads it; the RPC stays the authority. A row that is not the caller's is a 404.
async function readOwnRow(deps: FinishDeps, ids: { projectId: string, attachmentId: string }): Promise<OwnRow> {
  const { data, error } = await deps.admin
    .from('bug_evidence_attachments')
    .select(OWN_COLUMNS)
    .eq('id', ids.attachmentId)
    .eq('project_id', ids.projectId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'Could not read the attachment.');
  }
  const row = data as OwnRow | null;
  if (!row || row.created_by !== deps.userId) {
    throw notFound();
  }
  return row;
}

export async function finishBugEvidenceUpload(
  deps: FinishDeps,
  args: { projectId: string, attachmentId: string },
): Promise<UploadResult> {
  const row = await readOwnRow(deps, args);

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
    // What arrived is not acceptable: discard the row and the object (the sweep is the backstop).
    const removed = await discardBugEvidence(deps.db, { attachmentId: row.id });
    if (!removed.error) {
      await deleteEvidenceObject(deps.admin, row.storage_path);
    }
    throw evidenceRefusalError(checked.refusal, checked.message);
  }

  return commitAndRespond(deps, row.id, checked.value.byteSize);
}

async function commitAndRespond(deps: FinishDeps, attachmentId: string, byteSize: number): Promise<UploadResult> {
  const { data, error } = await commitBugEvidence(deps.db, { attachmentId, byteSize });
  if (error) {
    mapBugEvidenceRpcError(error);
  }
  return { status: 200, body: data };
}

// The drawer's remove of an upload that was never filed. A claimed row is refused by the RPC
// (45317): evidence on a filed defect is frozen. The object is deleted inline on a best effort
// basis; the AFTER DELETE trigger already queued it.
export async function discardOwnBugEvidence(
  deps: FinishDeps,
  ids: { projectId: string, attachmentId: string },
): Promise<void> {
  await readOwnRow(deps, ids);
  const { data, error } = await discardBugEvidence(deps.db, { attachmentId: ids.attachmentId });
  if (error) {
    mapBugEvidenceRpcError(error);
  }
  const removed = data as unknown as { storage_path?: string } | null;
  if (removed?.storage_path) {
    await deleteEvidenceObject(deps.admin, removed.storage_path);
  }
}

// The URL to redirect a content request to: a 60 second signed URL, minted only after the
// caller's own RLS-scoped read found the claimed row of exactly this defect. Missing, foreign,
// unclaimed and soft-deleted-workspace rows are one 404.
export async function resolveBugEvidenceContentUrl(
  deps: { db: SupabaseClient<Database>, admin: SupabaseClient<Database> },
  ids: { bugId: string, attachmentId: string },
): Promise<string> {
  const { data, error } = await deps.db
    .from('bug_evidence_attachments')
    .select('storage_path')
    .eq('id', ids.attachmentId)
    .eq('bug_id', ids.bugId)
    .eq('status', 'committed')
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'Could not read the attachment.');
  }
  if (!data) {
    throw notFound();
  }
  return createEvidenceReadUrl(deps.admin, (data as { storage_path: string }).storage_path);
}

// Resolved by segment NAME, like lib/runs/attachment-validation.ts.
export function extractBugEvidenceIds(pathname: string): { projectId: string, bugId: string, attachmentId: string } {
  const segments = pathname.split('/').filter(Boolean);
  const after = (name: string): string => {
    const idx = segments.lastIndexOf(name);
    return idx >= 0 ? (segments[idx + 1] ?? '') : '';
  };
  const attachmentId = after('bug-evidence') || after('evidence');
  return { projectId: after('projects'), bugId: after('bugs'), attachmentId };
}
