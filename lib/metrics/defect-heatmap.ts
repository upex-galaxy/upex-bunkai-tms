// BK-42 — pure TS layer for the defect-heatmap report. The RPC
// (bunkai_report_project_defect_heatmap, 0052_defect_heatmap_report.sql)
// returns only raw per-module counts (defect_count for the selected window,
// plus the two raw 7-day bucket counts); this file derives the heat bucket
// (Clean/Low/Elevated/Hotspot, master-design-plan §4.6) and the
// week-over-week trend (direction, absolute delta, nullable percent) — kept
// out of SQL so every edge case (zero-baseline, flat-zero) is unit-testable
// without a live Postgres connection. Mirrors lib/metrics/recovery-cycle.ts's
// "RPC returns raw, TS derives" split (Decision 3 there).

export type HeatBucket = 'clean' | 'low' | 'elevated' | 'hotspot';
export type TrendDirection = 'rising' | 'falling' | 'flat';

export interface DefectHeatmapRawItem {
  module_id: string
  module_name: string
  module_path: string
  defect_count: number
  current_week_count: number
  previous_week_count: number
}

export interface DefectHeatmapRawPayload {
  window: '7d' | '30d' | '90d'
  generated_at: string
  items: DefectHeatmapRawItem[]
}

export interface DefectHeatmapReportItem {
  module_id: string
  module_name: string
  module_path: string
  defect_count: number
  heat: HeatBucket
  current_week_count: number
  previous_week_count: number
  trend_direction: TrendDirection
  // Absolute delta (current - previous), always present — the mockup's own
  // "Rising +N" / "Falling -N" / "Flat ±0" grammar (master-design-plan §4.6)
  // never uses a percentage.
  trend_delta: number
  // Null exactly when previous_week_count is 0 and current_week_count > 0
  // (AC boundary scenario: "shown as not applicable or null rather than
  // infinity"). Null also has no meaning for a flat 0/0 module, where it is
  // conventionally reported as 0 (AC: "the trend percent is 0").
  trend_pct: number | null
}

export interface DefectHeatmapReport {
  window: '7d' | '30d' | '90d'
  generated_at: string
  items: DefectHeatmapReportItem[]
}

// Clean 0 · Low 1-2 · Elevated 3-4 · Hotspot 5+ — the exact tier boundaries
// frozen in the mockup's legend (bug-reports-index.html, master-design-plan
// §4.6). Applied to `defect_count` (the selected-window count), not the
// weekly trend buckets.
export function heatBucketForCount(defectCount: number): HeatBucket {
  if (defectCount <= 0) { return 'clean'; }
  if (defectCount <= 2) { return 'low'; }
  if (defectCount <= 4) { return 'elevated'; }
  return 'hotspot';
}

export interface TrendResult {
  direction: TrendDirection
  delta: number
  pct: number | null
}

// Week-over-week trend from the two raw 7-day bucket counts. Never returns
// Infinity/NaN: a zero previous-week baseline with a positive current count
// is `pct: null` (AC boundary — "not applicable or null rather than
// infinity"), still correctly directioned `rising` with the absolute delta
// exposed. A 0/0 pair is `flat` with `pct: 0` (AC: "trend percent is 0").
export function computeDefectTrend(currentWeekCount: number, previousWeekCount: number): TrendResult {
  const delta = currentWeekCount - previousWeekCount;

  let direction: TrendDirection = 'flat';
  if (currentWeekCount > previousWeekCount) { direction = 'rising'; }
  else if (currentWeekCount < previousWeekCount) { direction = 'falling'; }

  if (previousWeekCount === 0) {
    return { direction, delta, pct: currentWeekCount === 0 ? 0 : null };
  }

  const pct = Math.round((delta / previousWeekCount) * 100);
  return { direction, delta, pct };
}

// Assembles the full API response from the RPC's raw payload — one
// DefectHeatmapReportItem per module, heat bucket + trend attached.
export function buildDefectHeatmapReport(raw: DefectHeatmapRawPayload): DefectHeatmapReport {
  const items: DefectHeatmapReportItem[] = raw.items.map((item) => {
    const trend = computeDefectTrend(item.current_week_count, item.previous_week_count);
    return {
      module_id: item.module_id,
      module_name: item.module_name,
      module_path: item.module_path,
      defect_count: item.defect_count,
      heat: heatBucketForCount(item.defect_count),
      current_week_count: item.current_week_count,
      previous_week_count: item.previous_week_count,
      trend_direction: trend.direction,
      trend_delta: trend.delta,
      trend_pct: trend.pct,
    };
  });

  return { window: raw.window, generated_at: raw.generated_at, items };
}
