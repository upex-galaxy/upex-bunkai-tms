'use client';

import type { CoverageModule, CoverageNoCoverageItem, CoverageSegment } from '@lib/coverage/coverage-view';
import { Card } from '@components/ui/card';
import {
  buildNoCoverageDisplayList,
  coverageBarFractions,
  coverageFractionLabel,
  COVERAGE_EMPTY_NO_ACS_DESCRIPTION,
  COVERAGE_EMPTY_NO_ACS_TITLE,
  filterModulesBySegment,
  moduleFilterMetaText,
  percentLabel,
  resolveCoverageEmptyState,
  resolveModuleStatusChip,
} from '@lib/coverage/coverage-view';
import { CheckCircle2, Inbox } from 'lucide-react';
import { useState } from 'react';

// BK-46 — the project-wide Coverage view: renders the mockup
// (`bk-44-metrics-coverage/metrics-dashboard.html`) with the LIVE design
// system's tokens and atoms (Critical Rule #14) — `.status-chip[data-status]`
// / `.dot[data-status]`, `Card`, the segmented-toggle-group pattern
// `ProjectRunsReportView` already established for its own filter row.
//
// Unlike the Runs Report, the WHOLE project payload is fetched ONCE
// server-side (`metrics/page.tsx`) and handed down as `initialPayload` — the
// segment filter here is a pure client-side re-render over already-fetched
// data (Technical Decision, 0048_project_coverage_report.sql: the rollup is
// small and bounded, so there is no server round-trip per filter change).
//
// Scope trim vs. the mockup (Critical Rule #15 — logged here as the ratified
// departure, not a silent omission): omits the "Open Traceability" header
// button, per-module "Trace" links, the "Last 30 days" chip, the "Median
// recovery cycle" KPI tile, and the Recovery-cycle/Defect-density sections
// below the fold. All of those belong to BK-45/47/48 or an unbuilt
// `traceability-chain.html` route — a dead link into a route that does not
// exist yet is worse than omitting it for this story.

export interface CoveragePayload {
  kpis: {
    ac_total: number
    ac_bound: number
    ac_executed: number
    modules_total: number
    modules_fully_covered: number
  }
  modules: CoverageModule[]
  no_coverage: CoverageNoCoverageItem[]
}

interface ProjectCoverageViewProps {
  initialPayload: CoveragePayload | null
  // Set when the SERVER-side read failed; there is no client-side retry path
  // (no API route round-trip on this screen) — a hard reload is the only
  // recovery, same shape as any other server-rendered-and-done page in this
  // app when its first read fails.
  initialError?: string | null
}

const SEGMENT_LABEL: Record<CoverageSegment, string> = {
  all: 'All',
  gaps: 'Coverage gaps',
  notrun: 'Never run',
};

export function ProjectCoverageView({ initialPayload, initialError }: ProjectCoverageViewProps) {
  const [segment, setSegment] = useState<CoverageSegment>('all');

  if (initialError !== null && initialError !== undefined) {
    return (
      <div data-testid="coverage-error" className="flex flex-1 flex-col items-start gap-3 overflow-hidden p-4">
        <p className="text-sm text-fg-2">{initialError}</p>
      </div>
    );
  }

  const payload = initialPayload;
  if (!payload) {
    return (
      <div data-testid="coverage-error" className="flex flex-1 flex-col items-start gap-3 overflow-hidden p-4">
        <p className="text-sm text-fg-2">Could not load the coverage report.</p>
      </div>
    );
  }

  const emptyState = resolveCoverageEmptyState(payload.kpis);
  if (emptyState === 'empty-no-acs') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <Card>
          <div data-testid="coverage-empty-no-acs" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Inbox size={18} className="text-fg-3" />
            <span className="text-md font-semibold text-fg-1">{COVERAGE_EMPTY_NO_ACS_TITLE}</span>
            <span className="max-w-[46ch] text-sm text-fg-3">{COVERAGE_EMPTY_NO_ACS_DESCRIPTION}</span>
          </div>
        </Card>
      </div>
    );
  }

  const visibleModules = filterModulesBySegment(payload.modules, segment);
  const filterMeta = moduleFilterMetaText(visibleModules.length, payload.modules.length);
  const noCoverageEntries = buildNoCoverageDisplayList(payload.no_coverage, payload.modules);

  return (
    <div data-testid="project-coverage-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">

          {/* KPI row */}
          <div data-testid="coverage-kpis" className="flex flex-wrap items-center gap-3">
            <KpiTile
              label="AC coverage"
              value={percentLabel(payload.kpis.ac_bound, payload.kpis.ac_total)}
              testId="coverage-kpi-ac-coverage"
            />
            <KpiTile
              label="Executed coverage"
              value={percentLabel(payload.kpis.ac_executed, payload.kpis.ac_total)}
              testId="coverage-kpi-executed-coverage"
            />
            <KpiTile
              label="Fully covered modules"
              value={`${payload.kpis.modules_fully_covered} / ${payload.kpis.modules_total}`}
              testId="coverage-kpi-fully-covered"
            />
          </div>

          <div className="cov-grid grid grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
            {/* Coverage by module */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-fg-0">Coverage by module</div>
                  <div className="text-xs text-fg-3">Executed vs. bound-but-never-run vs. unbound acceptance criteria</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-fg-3" data-testid="coverage-filter-meta" aria-live="polite">{filterMeta}</span>
                  <div
                    role="group"
                    aria-label="Filter modules"
                    data-testid="coverage-module-filter"
                    className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
                  >
                    {(['all', 'gaps', 'notrun'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        data-testid={`coverage-filter-${s}`}
                        aria-pressed={segment === s}
                        onClick={() => setSegment(s)}
                        className={`inline-flex h-6.5 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-xs font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 ${
                          segment === s
                            ? 'bg-surface-5 text-fg-0'
                            : 'text-fg-2 hover:bg-surface-4 hover:text-fg-1'
                        }`}
                      >
                        {SEGMENT_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {visibleModules.length === 0
                ? (
                    <div data-testid="coverage-modules-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <CheckCircle2 size={18} className="text-fg-3" />
                      <span className="text-sm text-fg-3">No modules match this filter.</span>
                    </div>
                  )
                : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            {['Module', 'ACs bound', 'Coverage', 'Never run', 'Status'].map(column => (
                              <th
                                key={column}
                                scope="col"
                                className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody data-testid="coverage-module-rows">
                          {visibleModules.map(mod => <ModuleRow key={mod.module_id} mod={mod} />)}
                        </tbody>
                      </table>
                    </div>
                  )}
            </Card>

            {/* No coverage panel */}
            <Card className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-fg-0">No coverage</div>
                  <div className="text-xs text-fg-3">Zero linked ATCs: nothing bound at all</div>
                </div>
                <span className="status-chip" data-status="fail">{payload.no_coverage.length} ACs</span>
              </div>

              {noCoverageEntries.length === 0
                ? (
                    <div data-testid="coverage-no-gaps" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <CheckCircle2 size={18} className="text-fg-3" />
                      <span className="text-sm text-fg-3">No coverage gaps.</span>
                    </div>
                  )
                : (
                    <ul data-testid="coverage-no-gaps-list" className="flex flex-1 flex-col divide-y divide-stroke-1 overflow-auto">
                      {noCoverageEntries.map(entry => (
                        <li key={entry.kind === 'module' ? entry.moduleId : entry.acId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          {entry.kind === 'module'
                            ? (
                                <div className="min-w-0">
                                  <div className="text-xs text-fg-3">{entry.moduleName} · module</div>
                                  <div className="truncate text-sm text-fg-1">Entire module unbound · {entry.acCount} ACs exposed</div>
                                </div>
                              )
                            : (
                                <div className="min-w-0">
                                  <div className="text-xs text-fg-3">{entry.userStoryTitle}</div>
                                  <div className="truncate text-sm text-fg-1">{entry.acTitle}</div>
                                </div>
                              )}
                          <span className="status-chip shrink-0" data-status="fail">0 ATCs</span>
                        </li>
                      ))}
                    </ul>
                  )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, testId }: { label: string, value: string, testId: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1 text-sm text-fg-1"
    >
      {label}
      {' '}
      <span className="font-mono font-semibold text-fg-0">{value}</span>
    </span>
  );
}

function ModuleRow({ mod }: { mod: CoverageModule }) {
  const chip = resolveModuleStatusChip(mod);
  const fractions = coverageBarFractions(mod);

  return (
    <tr data-testid={`coverage-module-row-${mod.module_id}`} className="transition-colors duration-token ease-token hover:bg-surface-3">
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-sm font-medium text-fg-1">{mod.module_name}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2">{coverageFractionLabel(mod)}</span>
      </td>
      <td className="border-t border-stroke-1 px-3 py-1.5">
        <div
          role="img"
          aria-label={`${mod.ac_executed} executed, ${mod.ac_not_run} never run, ${mod.ac_uncovered} unbound of ${mod.ac_total}`}
          className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-4"
        >
          <span className="bg-signal-pass" style={{ width: `${fractions.executed * 100}%` }} />
          <span className="bg-signal-skipped" style={{ width: `${fractions.notRun * 100}%` }} />
        </div>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5 text-right">
        <span className="font-mono text-xs text-fg-2">{mod.ac_not_run === 0 ? '—' : mod.ac_not_run}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="status-chip" data-status={chip.tone === 'neutral' ? 'skipped' : chip.tone}>
          {chip.label}
        </span>
      </td>
    </tr>
  );
}

export function ProjectCoverageSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          {[0, 1, 2].map(i => (
            <span key={i} className="h-7 w-40 animate-status-pulse rounded-2 bg-surface-3" />
          ))}
        </div>
        <Card className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3, 4].map(row => (
            <span key={row} className="h-4 animate-status-pulse rounded-1 bg-surface-3" style={{ width: `${80 - row * 8}%` }} />
          ))}
        </Card>
      </div>
    </div>
  );
}
