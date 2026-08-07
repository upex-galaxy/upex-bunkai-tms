import { ApiError } from '@lib/api/error-envelope';

// BK-45 — map a bunkai_report_story_traceability RPC error (Postgres
// SQLSTATE) to the canonical API envelope. The RPC only ever raises P0002
// (missing / foreign-workspace / non-member User Story — non-disclosure,
// same code for all three); anything else is unexpected. Always throws
// (`: never`), so the route's `if (error) mapTraceabilityRpcError(error)` is
// exhaustive.
//
// AC-05 asks for "a 403 Forbidden response or equivalent access-denied UI"
// on a cross-workspace access attempt. This maps to 404 `not_found`
// instead — the SAME non-disclosure shape every sibling report RPC already
// uses (coverage/recovery-cycle/defect-heatmap: `mapCoverageRpcError`,
// `mapRecoveryCycleRpcError`, `mapDefectHeatmapRpcError`, all P0002 -> 404).
// A 403 would disclose that a story exists in a workspace the caller cannot
// read; 404 satisfies AC-05's "equivalent access-denied UI" without adding
// a disclosure channel. This is the one autonomous UI-shape call this run
// made (no PO ruling names the exact status code) — flagged here per the
// Stage 1 plan rather than left silent.
export function mapTraceabilityRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', 'User story not found.', {
        details: { reason: 'not_found' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}
