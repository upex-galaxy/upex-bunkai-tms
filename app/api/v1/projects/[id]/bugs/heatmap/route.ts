import type { DefectHeatmapRawPayload } from '@lib/metrics/defect-heatmap';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { buildDefectHeatmapReport } from '@lib/metrics/defect-heatmap';
import { mapDefectHeatmapRpcError } from '@lib/metrics/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { reportProjectDefectHeatmap } from '@lib/supabase/rpc';

// GET /api/v1/projects/{id}/bugs/heatmap — a Project's per-module defect
// heatmap: defect count over a chosen window (7d/30d/90d, default 30d) plus
// a week-over-week trend per module (BK-42). Read auth only, no scope
// requirement — mirrors the sibling report routes on this screen (Runs
// report, Coverage, Recovery-cycle): any active workspace role, viewers
// included, passes the SECURITY DEFINER RPC's own membership check.
// Non-disclosure: missing, foreign-workspace, and non-member Projects all
// collapse into the SAME 404 (`not_found`) — never a 403, never an
// existence echo (AC-11's literal "403" is deliberately rejected, per the
// BK-42 ratification comment — see 0052_defect_heatmap_report.sql's header).
//
// No pagination — a project's per-module rollup is small and bounded, same
// shape as the Coverage/Recovery-cycle reports.
//
// The RPC returns only raw per-module counts (defect_count for the window,
// plus the two raw 7-day bucket counts); THIS route derives the heat bucket
// and trend direction/delta/percent via lib/metrics/defect-heatmap.ts —
// never passed through blindly (mirrors the Recovery-cycle route's own
// raw-RPC / derived-report split).
const SUPPORTED_WINDOWS = ['7d', '30d', '90d'] as const;
type SupportedWindow = (typeof SUPPORTED_WINDOWS)[number];
const DEFAULT_WINDOW: SupportedWindow = '30d';

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const window = parseWindow(new URL(request.url).searchParams.get('window'));

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await reportProjectDefectHeatmap(supabase, {
    actorUserId: principal.userId,
    projectId,
    window,
  });
  if (error) {
    mapDefectHeatmapRpcError(error);
  }

  const raw = data as unknown as DefectHeatmapRawPayload;
  const report = buildDefectHeatmapReport(raw);

  return jsonResponse(report, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — reporting reads.',
});

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/bugs/heatmap`, so the id is the third-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-3) ?? '';
}

// AC-11: an unsupported window (e.g. "365d") is a 400 `bad_request`, not the
// repo's usual validation_failed/422 — this AC is explicit and was not one
// of the conventions the BK-42 ratification corrected (only its 403 was).
// Absent -> default '30d' (AC-1/business-rules.md).
function parseWindow(raw: string | null): SupportedWindow {
  if (raw === null) { return DEFAULT_WINDOW; }
  if ((SUPPORTED_WINDOWS as readonly string[]).includes(raw)) {
    return raw as SupportedWindow;
  }
  throw new ApiError('bad_request', 'Unsupported window. Use one of: 7d, 30d, 90d.');
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
