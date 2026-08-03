'use client';

import type { DefectHeatmapReport, DefectHeatmapReportItem, HeatBucket } from '@lib/metrics/defect-heatmap';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { cn } from '@lib/utils';
import { AlertTriangle, ArrowDown, ArrowUp, Minus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// BK-42 — the Heatmap view of `bug-reports-index.html` (second selectable
// view on the existing `/projects/[projectSlug]/bugs` screen — the List
// half is BugsListView.tsx, BK-41). One cell per ACTIVE module: full path
// (disambiguates identically-named nested modules, AC-9), defect count for
// the chosen window, a Clean/Low/Elevated/Hotspot heat tag (never
// color-only — always paired with text, AC-6), and a week-over-week trend
// row (word + absolute delta, never a raw percentage — mirrors the frozen
// mockup's own "Rising +N" / "Falling -N" / "Flat +-0" grammar,
// master-design-plan §4.6). Window switch (7d/30d/90d, default 30d, AC-3)
// and a freshness ("as of") stamp from the response's own generated_at
// (AC-10) sit in the toolbar above the grid.

export type HeatmapWindow = '7d' | '30d' | '90d';

const WINDOW_OPTIONS: HeatmapWindow[] = ['7d', '30d', '90d'];

const HEAT_LABEL: Record<HeatBucket, string> = {
  clean: 'Clean',
  low: 'Low',
  elevated: 'Elevated',
  hotspot: 'Hotspot',
};

// Clean/Low are neutral (no signal tone, mirrors the mockup's own
// `--bg-2`/`--bg-4` swatches — never a "good/bad" color for an absence of
// data); Elevated/Hotspot reuse this codebase's established blocked/fail
// signal tokens (same family BugsListView.tsx's local TONE_CLASSES map
// already establishes for severity/status chips — duplicated here per that
// same file-local convention, not re-exported).
interface HeatCellClasses { border: string, bg: string, text: string, tagBorder: string, tagBg: string, tagText: string }
const HEAT_CLASSES: Record<HeatBucket, HeatCellClasses> = {
  clean: { border: 'border-stroke-2 border-dashed', bg: 'bg-surface-2', text: 'text-fg-2', tagBorder: 'border-stroke-2', tagBg: 'bg-surface-2', tagText: 'text-fg-2' },
  low: { border: 'border-stroke-2', bg: 'bg-surface-3', text: 'text-fg-0', tagBorder: 'border-stroke-2', tagBg: 'bg-surface-3', tagText: 'text-fg-2' },
  elevated: { border: 'border-stroke-3', bg: 'bg-signal-blocked-bg', text: 'text-fg-0', tagBorder: 'border-signal-blocked', tagBg: 'bg-signal-blocked-bg', tagText: 'text-signal-blocked' },
  hotspot: { border: 'border-stroke-strong', bg: 'bg-signal-fail-bg', text: 'text-fg-0', tagBorder: 'border-signal-fail', tagBg: 'bg-signal-fail-bg', tagText: 'text-signal-fail' },
};

const TREND_TEXT: Record<DefectHeatmapReportItem['trend_direction'], { word: string, className: string, Icon: typeof ArrowUp }> = {
  rising: { word: 'Rising', className: 'text-signal-fail', Icon: ArrowUp },
  falling: { word: 'Falling', className: 'text-signal-pass', Icon: ArrowDown },
  flat: { word: 'Flat', className: 'text-signal-skipped', Icon: Minus },
};

function formatDelta(delta: number): string {
  if (delta === 0) { return '±0'; }
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function splitPath(path: string): { prefix: string, leaf: string } {
  const parts = path.split('/');
  const leaf = parts.pop() ?? path;
  return { prefix: parts.length > 0 ? `${parts.join(' / ')} / ` : '', leaf };
}

function formatAsOf(generatedAt: string): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) { return generatedAt; }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

interface ApiErrorBody { error?: { message?: string } }
const FALLBACK_ERROR_MESSAGE = 'Could not load the defect heatmap.';

async function fetchHeatmap(
  projectId: string,
  window: HeatmapWindow,
  signal: AbortSignal,
): Promise<{ ok: true, report: DefectHeatmapReport } | { ok: false, message: string }> {
  const response = await fetch(`/api/v1/projects/${projectId}/bugs/heatmap?window=${window}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, report: (await response.json()) as DefectHeatmapReport };
}

export function BugsHeatmapView({ projectId }: { projectId: string }) {
  const [window, setWindow] = useState<HeatmapWindow>('30d');
  const [report, setReport] = useState<DefectHeatmapReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const load = (nextWindow: HeatmapWindow) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    void fetchHeatmap(projectId, nextWindow, controller.signal).then((result) => {
      if (controller.signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      setReport(result.report);
      setLoading(false);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
      setLoading(false);
    });
  };

  // `load` intentionally omitted from the dependency list — it closes over
  // `projectId`, which IS listed, and is redefined every render; only a
  // `window`/`projectId` change should ever re-trigger the fetch (same
  // pattern as BugsListView.tsx's own `runQuery`, invoked directly from
  // handlers rather than tracked as an effect dependency).
  useEffect(() => {
    load(window);
  }, [window, projectId]);

  return (
    <div data-testid="bugs-heatmap-view" className="flex flex-col gap-3">
      <div
        data-testid="bugs-heatmap-toolbar"
        className="flex flex-wrap items-end gap-4 rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card"
      >
        <label className="flex flex-col gap-1.5">
          <span id="heatmap-window-label" className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Window</span>
          <div role="group" aria-labelledby="heatmap-window-label" className="flex overflow-hidden rounded-2 border border-stroke-2">
            {WINDOW_OPTIONS.map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={window === option}
                data-testid={`bugs-heatmap-window-${option}`}
                onClick={() => setWindow(option)}
                className={cn(
                  'h-8 min-w-[44px] px-2.5 font-mono text-sm transition-colors duration-token ease-token',
                  window === option ? 'bg-accent text-white' : 'bg-surface-2 text-fg-2 hover:bg-surface-4',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Density · defects in window</span>
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
            {(['clean', 'low', 'elevated', 'hotspot'] as HeatBucket[]).map(bucket => (
              <span key={bucket} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn('size-2.5 rounded-1 border', HEAT_CLASSES[bucket].border, HEAT_CLASSES[bucket].bg)} />
                {HEAT_LABEL[bucket]}
              </span>
            ))}
            <span className="text-fg-3">Trend compares the latest 7 days vs. the prior 7 days</span>
          </div>
        </div>

        {report !== null && (
          <span data-testid="bugs-heatmap-asof" className="ml-auto font-mono text-sm text-fg-2">
            as of
            {' '}
            {formatAsOf(report.generated_at)}
          </span>
        )}
      </div>

      {error !== null && (
        <Card>
          <div data-testid="bugs-heatmap-error" className="flex flex-col items-start gap-3 p-4">
            <p className="flex items-center gap-2 text-sm text-fg-2">
              <AlertTriangle size={14} className="text-signal-fail" />
              {error}
            </p>
            <Button type="button" size="sm" data-testid="bugs-heatmap-retry" disabled={loading} onClick={() => load(window)}>
              <RefreshCw size={13} />
              {loading ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </Card>
      )}

      {error === null && loading && report === null && (
        <div data-testid="bugs-heatmap-skeleton" aria-hidden="true" className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-28 animate-status-pulse rounded-3 bg-surface-3" />
          ))}
        </div>
      )}

      {error === null && report !== null && (
        report.items.length === 0
          ? (
              <Card>
                <div data-testid="bugs-heatmap-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <span className="text-md font-semibold text-fg-1">No active modules in this Project</span>
                  <span className="max-w-[46ch] text-sm text-fg-3">Create a module before defects can be rolled up into a heatmap.</span>
                </div>
              </Card>
            )
          : (
              <div
                data-testid="bugs-heatmap-grid"
                className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 transition-opacity duration-token ease-token', loading && 'opacity-60')}
              >
                {report.items.map(item => <HeatmapCell key={item.module_id} item={item} window={report.window} />)}
              </div>
            )
      )}
    </div>
  );
}

function HeatmapCell({ item, window }: { item: DefectHeatmapReportItem, window: HeatmapWindow }) {
  const classes = HEAT_CLASSES[item.heat];
  const trend = TREND_TEXT[item.trend_direction];
  const { prefix, leaf } = splitPath(item.module_path);
  const TrendIcon = trend.Icon;

  return (
    <div
      data-testid={`bugs-heatmap-cell-${item.module_id}`}
      className={cn('flex flex-col gap-3 rounded-3 border px-4 py-3.5 shadow-card', classes.border, classes.bg)}
    >
      <div className="flex items-start gap-2">
        <span className="font-mono text-sm text-fg-2">
          {prefix}
          <span className="font-semibold text-fg-0">{leaf}</span>
        </span>
        <span
          data-testid={`bugs-heatmap-tag-${item.module_id}`}
          className={cn('ml-auto shrink-0 rounded-full border px-1.5 py-px text-2xs font-semibold uppercase tracking-[0.04em]', classes.tagBorder, classes.tagBg, classes.tagText)}
        >
          {HEAT_LABEL[item.heat]}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-mono text-4xl font-bold leading-none', classes.text)}>{item.defect_count}</span>
        <span className="text-sm text-fg-2">
          defects ·
          {' '}
          {window}
        </span>
      </div>
      <div className="mt-auto flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium tracking-[0.02em]', trend.className)}>
          <TrendIcon size={12} aria-hidden="true" />
          {trend.word}
          {' '}
          <span className="font-mono">{formatDelta(item.trend_delta)}</span>
        </span>
        <span className="ml-auto font-mono text-2xs text-fg-3" title={item.module_id}>{item.module_id.slice(0, 8)}</span>
      </div>
    </div>
  );
}
