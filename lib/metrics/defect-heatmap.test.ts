import type { DefectHeatmapRawItem } from '@lib/metrics/defect-heatmap';
import {
  buildDefectHeatmapReport,
  computeDefectTrend,
  heatBucketForCount,
} from '@lib/metrics/defect-heatmap';
import { describe, expect, test } from 'bun:test';

// BK-42 — pure TS layer for the defect-heatmap report
// (0052_defect_heatmap_report.sql, Decision 3 — "RPC returns raw, TS
// derives", mirrors lib/metrics/recovery-cycle.test.ts's own structure).
// Covers: the frozen Clean/Low/Elevated/Hotspot tier boundaries
// (master-design-plan §4.6), the AC-4 rising/falling/flat trend directions,
// the AC boundary zero-previous-week case (null pct, never Infinity), the
// AC boundary flat-zero case (pct 0, not null), and full report assembly.

function item(overrides: Partial<DefectHeatmapRawItem>): DefectHeatmapRawItem {
  return {
    module_id: 'module-1',
    module_name: 'Checkout',
    module_path: 'Checkout',
    defect_count: 0,
    current_week_count: 0,
    previous_week_count: 0,
    ...overrides,
  };
}

describe('heatBucketForCount', () => {
  test('0 defects is clean', () => {
    expect(heatBucketForCount(0)).toBe('clean');
  });

  test('1-2 defects is low', () => {
    expect(heatBucketForCount(1)).toBe('low');
    expect(heatBucketForCount(2)).toBe('low');
  });

  test('3-4 defects is elevated', () => {
    expect(heatBucketForCount(3)).toBe('elevated');
    expect(heatBucketForCount(4)).toBe('elevated');
  });

  test('5+ defects is hotspot', () => {
    expect(heatBucketForCount(5)).toBe('hotspot');
    expect(heatBucketForCount(42)).toBe('hotspot');
  });
});

describe('computeDefectTrend', () => {
  // AC-4: "Checkout" has 9 defects in the latest 7-day bucket vs 4 in the
  // previous — trend "rising", ~125% increase.
  test('AC-4 — rising with a non-zero baseline computes the expected percent', () => {
    const result = computeDefectTrend(9, 4);
    expect(result.direction).toBe('rising');
    expect(result.delta).toBe(5);
    expect(result.pct).toBe(125);
  });

  test('falling direction with a non-zero baseline', () => {
    const result = computeDefectTrend(4, 9);
    expect(result.direction).toBe('falling');
    expect(result.delta).toBe(-5);
    expect(result.pct).toBe(-56);
  });

  // AC boundary: "Search" had 0 defects previous week, 2 this week — rising,
  // but the percent must be null (not Infinity).
  test('AC boundary — zero previous-week baseline with a positive current count is rising with a null percent', () => {
    const result = computeDefectTrend(2, 0);
    expect(result.direction).toBe('rising');
    expect(result.delta).toBe(2);
    expect(result.pct).toBeNull();
  });

  // AC boundary: "Settings" had 0 defects both weeks — flat, percent is 0
  // (not null — a genuine, known "no change" reading).
  test('AC boundary — zero current and previous-week counts is flat with percent 0', () => {
    const result = computeDefectTrend(0, 0);
    expect(result.direction).toBe('flat');
    expect(result.delta).toBe(0);
    expect(result.pct).toBe(0);
  });

  test('equal non-zero counts is flat', () => {
    const result = computeDefectTrend(3, 3);
    expect(result.direction).toBe('flat');
    expect(result.delta).toBe(0);
    expect(result.pct).toBe(0);
  });

  test('never returns Infinity or NaN for any zero-baseline input', () => {
    const result = computeDefectTrend(100, 0);
    expect(Number.isFinite(result.pct ?? 0)).toBe(true);
    expect(result.pct).toBeNull();
  });
});

describe('buildDefectHeatmapReport', () => {
  test('assembles heat bucket + trend for every item, preserving window/generated_at', () => {
    const report = buildDefectHeatmapReport({
      window: '30d',
      generated_at: '2026-07-30T14:32:00.000Z',
      items: [
        item({ module_id: 'checkout', module_path: 'Checkout', defect_count: 9, current_week_count: 9, previous_week_count: 4 }),
        item({ module_id: 'search', module_path: 'Search', defect_count: 2, current_week_count: 2, previous_week_count: 0 }),
        item({ module_id: 'settings', module_path: 'Settings', defect_count: 0, current_week_count: 0, previous_week_count: 0 }),
      ],
    });

    expect(report.window).toBe('30d');
    expect(report.generated_at).toBe('2026-07-30T14:32:00.000Z');
    expect(report.items).toHaveLength(3);

    const checkout = report.items.find(i => i.module_id === 'checkout')!;
    expect(checkout.heat).toBe('hotspot');
    expect(checkout.trend_direction).toBe('rising');
    expect(checkout.trend_pct).toBe(125);

    const search = report.items.find(i => i.module_id === 'search')!;
    expect(search.heat).toBe('low');
    expect(search.trend_direction).toBe('rising');
    expect(search.trend_pct).toBeNull();
    expect(search.trend_delta).toBe(2);

    const settings = report.items.find(i => i.module_id === 'settings')!;
    expect(settings.heat).toBe('clean');
    expect(settings.trend_direction).toBe('flat');
    expect(settings.trend_pct).toBe(0);
  });

  test('an empty items array produces an empty report, not an error', () => {
    const report = buildDefectHeatmapReport({ window: '7d', generated_at: '2026-07-30T00:00:00.000Z', items: [] });
    expect(report.items).toEqual([]);
  });
});
