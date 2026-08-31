import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@lib/supabase/admin';
import { buildWorkspaceExportArchive } from '@lib/workspace-export/build-archive';
import { collectWorkspaceExportEntities } from '@lib/workspace-export/collect';
import { EXPORT_DOWNLOAD_WINDOW_HOURS, EXPORT_STORAGE_BUCKET } from '@lib/workspace-export/constants';
import 'server-only';

// BK-508 — the workspace export background worker. Runs in the Vercel
// `after()` slot via the service-role admin client (RLS bypassed;
// authorization was enforced at enqueue). Byte-for-byte shape of
// lib/jira/import-runner.ts's runImportJob/executeImport: claim the queued
// row, do the work, mark completed or failed — never left stuck in `running`.

type Admin = SupabaseClient<Database>;

export async function runWorkspaceExportJob(jobId: string): Promise<void> {
  await executeExport(createAdminClient(), jobId);
}

export async function executeExport(supabase: Admin, jobId: string): Promise<void> {
  const { data: claimed } = await supabase
    .from('workspace_exports')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id, workspace_id')
    .maybeSingle();
  if (!claimed) {
    // Not a queued job — already claimed, completed, or failed.
    return;
  }

  try {
    const entities = await collectWorkspaceExportEntities(supabase, claimed.workspace_id);
    const archive = buildWorkspaceExportArchive(claimed.workspace_id, entities);
    const archivePath = `${claimed.workspace_id}/${jobId}.zip`;

    const { error: uploadError } = await supabase.storage
      .from(EXPORT_STORAGE_BUCKET)
      .upload(archivePath, archive, { contentType: 'application/zip', upsert: true });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + EXPORT_DOWNLOAD_WINDOW_HOURS * 60 * 60 * 1000);

    await supabase
      .from('workspace_exports')
      .update({
        status: 'completed',
        archive_path: archivePath,
        archive_bytes: archive.byteLength,
        completed_at: completedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', jobId);
  }
  catch (fatal) {
    const message = fatal instanceof Error ? fatal.message : String(fatal);
    await supabase
      .from('workspace_exports')
      .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: message })
      .eq('id', jobId);
  }
}
