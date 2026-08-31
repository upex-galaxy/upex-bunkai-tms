import type { WorkspaceExportEntities } from '@lib/workspace-export/collect';
import { zipSync } from 'fflate';

// BK-508 — one JSON file per entity, plus manifest.json, zipped in-memory
// (fflate). Confirmed archive format (Jira, 2026-08-24): a single ZIP file,
// one JSON file per entity type, plus a manifest listing workspace id,
// generated-at timestamp, and per-entity record counts. Satisfies AC-11
// (structured, machine-readable, no Bunkai access needed) and AC-16 (an
// empty workspace still produces a structurally valid archive — every entity
// is just an empty JSON array, no special-casing needed).

export function buildWorkspaceExportArchive(workspaceId: string, entities: WorkspaceExportEntities): Uint8Array {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};

  for (const [name, rows] of Object.entries(entities)) {
    counts[name] = rows.length;
    files[`${name}.json`] = encoder.encode(JSON.stringify(rows, null, 2));
  }

  const manifest = {
    workspace_id: workspaceId,
    generated_at: new Date().toISOString(),
    counts,
  };
  files['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2));

  return zipSync(files, { level: 6 });
}
