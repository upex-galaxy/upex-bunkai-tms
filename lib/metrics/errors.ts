import { ApiError } from '@lib/api/error-envelope';

// BK-47 — map a bunkai_report_project_recovery_cycles RPC error (Postgres
// SQLSTATE) to the canonical API envelope. Mirrors lib/coverage/errors.ts
// exactly: the RPC only ever raises P0002 (missing / foreign / non-member
// Project — non-disclosure, same code for all three); anything else is
// unexpected. Always throws (`: never`), so the route's
// `if (error) mapRecoveryCycleRpcError(error)` is exhaustive.
export function mapRecoveryCycleRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', 'Project not found.', {
        details: { reason: 'not_found' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-42 — map a bunkai_report_project_defect_heatmap RPC error (Postgres
// SQLSTATE) to the canonical API envelope. Same non-disclosure P0002 as
// every sibling in this report family (missing / foreign / non-member
// Project all collapse into 404 `not_found` — AC-11's literal "403" is
// deliberately rejected per the BK-42 ratification comment, see
// 0052_defect_heatmap_report.sql's header). `45308` is the RPC's own window
// backstop (the API route's own validation is the primary guard) — maps to
// `bad_request` (400), matching AC-11's literal wording for THIS error only.
// Always throws (`: never`), so the route's `if (error) mapDefectHeatmapRpcError(error)`
// is exhaustive.
export function mapDefectHeatmapRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', 'Project not found.', {
        details: { reason: 'not_found' },
      });
    case '45308':
      throw new ApiError('bad_request', 'Unsupported window. Use one of: 7d, 30d, 90d.');
    default:
      throw new ApiError('internal_error', error.message);
  }
}
