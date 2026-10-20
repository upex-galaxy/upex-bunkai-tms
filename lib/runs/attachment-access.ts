import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { mapAttachmentRpcError } from '@lib/runs/attachment-errors';
import { createEvidenceReadUrl, deleteEvidenceObject } from '@lib/storage/run-evidence-storage';
import { removeRunStepAttachment } from '@lib/supabase/rpc';

// BK-593 - remove, list and read of committed evidence attachments. Reads are plain RLS
// selects through the caller's OWN client: the table policy exposes committed rows of the
// caller's workspaces only, so "missing", "foreign workspace" and "pending" are one and the
// same 404 (non-disclosure). Remove is the uploader's, through the DEFINER RPC.

export interface AccessDeps {
  db: SupabaseClient<Database>
  admin: SupabaseClient<Database>
  userId: string
}

// Public shape of one attachment: never a storage path, never a URL.
export interface AttachmentView {
  id: string
  run_id: string
  run_step_id: string
  filename: string
  content_type: string
  byte_size: number
  status: string
  created_by: string | null
  created_at: string
  committed_at: string | null
}

const LIST_COLUMNS = 'id, run_id, run_step_id, original_filename, content_type, byte_size, status, created_by, created_at, committed_at';

interface ListRow {
  id: string
  run_id: string
  run_step_id: string
  original_filename: string
  content_type: string
  byte_size: number
  status: string
  created_by: string | null
  created_at: string
  committed_at: string | null
}

function notFound(): ApiError {
  return new ApiError('not_found', 'Attachment not found.', { details: { reason: 'not_found' } });
}

export function toAttachmentView(row: ListRow): AttachmentView {
  return {
    id: row.id,
    run_id: row.run_id,
    run_step_id: row.run_step_id,
    filename: row.original_filename,
    content_type: row.content_type,
    byte_size: row.byte_size,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    committed_at: row.committed_at,
  };
}

// All committed attachments of a Run, oldest first. A Run the caller cannot see is a 404, not
// an empty list.
export async function listRunAttachments(db: SupabaseClient<Database>, runId: string): Promise<{ attachments: AttachmentView[] }> {
  const run = await db.from('runs').select('id').eq('id', runId).maybeSingle();
  if (run.error) {
    throw new ApiError('internal_error', 'Could not read the run.');
  }
  if (!run.data) {
    throw new ApiError('not_found', 'Run not found.', { details: { reason: 'not_found' } });
  }
  const { data, error } = await db
    .from('run_step_attachments')
    .select(LIST_COLUMNS)
    .eq('run_id', runId)
    .eq('status', 'committed')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    throw new ApiError('internal_error', 'Could not read the attachments.');
  }
  return { attachments: ((data ?? []) as ListRow[]).map(toAttachmentView) };
}

// The URL to redirect a content request to: a 60 second signed URL, minted only after the
// caller's own RLS-scoped read found the committed row under exactly these ids.
export async function resolveAttachmentContentUrl(
  deps: AccessDeps,
  ids: { runId: string, stepId: string, attachmentId: string },
): Promise<string> {
  const { data, error } = await deps.db
    .from('run_step_attachments')
    .select('storage_path')
    .eq('id', ids.attachmentId)
    .eq('run_id', ids.runId)
    .eq('run_step_id', ids.stepId)
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

// Uploader only, Run running (both enforced by the RPC). The ids in the URL must name the
// caller's own attachment, otherwise it is a plain 404. The object is deleted inline on a best
// effort basis; the AFTER DELETE trigger already queued it for the sweep.
export async function deleteAttachment(
  deps: AccessDeps,
  ids: { runId: string, stepId: string, attachmentId: string },
): Promise<void> {
  const lookup = await deps.admin
    .from('run_step_attachments')
    .select('id, created_by')
    .eq('id', ids.attachmentId)
    .eq('run_id', ids.runId)
    .eq('run_step_id', ids.stepId)
    .maybeSingle();
  if (lookup.error) {
    throw new ApiError('internal_error', 'Could not read the attachment.');
  }
  const row = lookup.data as { id: string, created_by: string | null } | null;
  // Another member's attachment is answered by the RPC (45219): the caller is allowed to know
  // it exists. A row that is not under these ids at all is a 404.
  if (!row) {
    throw notFound();
  }

  const { data, error } = await removeRunStepAttachment(deps.db, { attachmentId: ids.attachmentId });
  if (error) {
    mapAttachmentRpcError(error);
  }
  const removed = data as unknown as { storage_path?: string } | null;
  if (removed?.storage_path) {
    await deleteEvidenceObject(deps.admin, removed.storage_path);
  }
}
