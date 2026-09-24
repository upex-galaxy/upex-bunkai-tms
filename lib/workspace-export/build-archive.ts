import type { WorkspaceExportEntities } from '@lib/workspace-export/collect';
import { zipSync } from 'fflate';

// BK-508 — one JSON file per entity, plus manifest.json, zipped in-memory
// (fflate). Confirmed archive format (Jira, 2026-08-24): a single ZIP file,
// one JSON file per entity type, plus a manifest listing workspace id,
// generated-at timestamp, and per-entity record counts. Satisfies AC-11
// (structured, machine-readable, no Bunkai access needed) and AC-16 (an
// empty workspace still produces a structurally valid archive — every entity
// is just an empty JSON array, no special-casing needed).
//
// BK-1025 — Run snapshots are the one exception: `runs` ships as
// `runs.ndjson` (one JSON object per line), per the ratified BK-508 decision
// ("NDJSON for the unbounded Run-snapshot entity") and TC22 (BK-1015). Every
// other entity, `run_atcs` and `run_steps` included, stays a JSON array. An
// empty workspace yields an empty `runs.ndjson`, which is valid NDJSON.

const NDJSON_ENTITIES: ReadonlySet<string> = new Set(['runs']);

function encodeNdjson(rows: unknown[]): string {
  return rows.map(row => `${JSON.stringify(row)}\n`).join('');
}

export function buildWorkspaceExportArchive(workspaceId: string, entities: WorkspaceExportEntities): Uint8Array {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};

  for (const [name, rows] of Object.entries(entities)) {
    counts[name] = rows.length;
    if (NDJSON_ENTITIES.has(name)) {
      files[`${name}.ndjson`] = encoder.encode(encodeNdjson(rows));
    }
    else {
      files[`${name}.json`] = encoder.encode(JSON.stringify(rows, null, 2));
    }
  }

  const manifest = {
    workspace_id: workspaceId,
    generated_at: new Date().toISOString(),
    counts,
  };
  files['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2));

  return zipSync(files, { level: 6 });
}
