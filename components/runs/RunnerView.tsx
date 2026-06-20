'use client';

import { useWorkbench } from '@app/(app)/projects/[projectSlug]/workbench-context';
import { ChevronLeft, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

// BK-34 — the manual runner view. A read-only projection of the composed Run
// payload (`bunkai_get_run_expanded`): the snapshot chain rendered as a PENDING
// checklist at 0%. Mark-pass / mark-fail interactions are BK-35 — this build
// renders statuses read-only. Shape mirrors the GET /api/v1/runs/[id] contract.
// CLIENT component because it registers its `test_title` as the run tab's label
// via the workbench provider once the payload loads.

export type RunStatus = 'running' | 'passed' | 'failed' | 'aborted';
export type StepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';

export interface RunStep {
  id: string
  atc_step_id: string | null
  position: number
  content: string
  input_data: string | null
  expected: string | null
  status: StepStatus
  note: string | null
  evidence_url: string | null
  executed_at: string | null
}

export interface RunAtc {
  id: string
  atc_id: string
  position: number
  atc_title: string
  status: StepStatus
  steps: RunStep[]
}

export interface RunDetail {
  id: string
  workspace_id: string
  project_id: string
  test_id: string
  environment_id: string
  environment_name: string | null
  status: RunStatus
  executor_mode: string
  executor_user_id: string | null
  test_title: string
  version: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  atc_count: number
  step_count: number
  atcs: RunAtc[]
}

interface RunnerViewProps {
  run: RunDetail
  projectSlug: string
}

export function RunnerView({ run, projectSlug }: RunnerViewProps) {
  const { registerRunLabel } = useWorkbench();

  // Refine the run tab's placeholder label ('Run') to the test title once the
  // composed payload is in hand. `registerRunLabel` is stable + a no-op when the
  // label is unchanged, so this settles after first paint.
  useEffect(() => {
    registerRunLabel(run.id, run.test_title);
  }, [registerRunLabel, run.id, run.test_title]);

  // Progress: every snapshot step starts 'pending'; a step counts as done once
  // its status moves off 'pending'. At creation this renders 0%.
  const total = run.step_count;
  const done = run.atcs.reduce(
    (acc, atc) => acc + atc.steps.filter(s => s.status !== 'pending').length,
    0,
  );
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div
      data-testid="runner-view"
      className="flex flex-1 flex-col overflow-hidden bg-surface-1"
    >
      {/* header: full-width bar, content in the same centered reading column as
          the body — mirrors TestDetailView chrome (back link + breadcrumb), with
          a status chip + environment name on the right. */}
      <div className="flex h-9 flex-shrink-0 items-center border-b border-stroke-1 px-4">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            data-testid="runner-back"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
            title="Back to project"
          >
            <ChevronLeft size={13} />
          </Link>
          <Play size={13} className="shrink-0 text-fg-3" />
          <Link
            href={`/projects/${projectSlug}`}
            className="shrink-0 text-xs text-fg-3 hover:text-fg-1 hover:underline"
          >
            Runs
          </Link>
          <span className="shrink-0 text-xs text-fg-4">/</span>
          <h1
            data-testid="runner-title"
            className="min-w-0 truncate text-sm font-semibold text-fg-0"
          >
            {run.test_title}
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              data-testid="runner-status"
              className="status-chip"
              data-status={run.status === 'running' ? 'running' : undefined}
            >
              {run.status}
            </span>
            <span
              data-testid="runner-env"
              className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3"
            >
              {run.environment_name ?? 'unknown env'}
            </span>
          </div>
        </div>
      </div>

      {/* progress bar: a track + accent fill, with a mono "{pct}% complete" label
          and "{done}/{total} steps" count. At creation this reads 0%. */}
      <div className="flex flex-shrink-0 items-center border-b border-stroke-1 px-4 py-2">
        <div
          data-testid="runner-progress"
          data-pct={pct}
          className="mx-auto flex w-full max-w-[820px] items-center gap-3"
        >
          <div className="h-2 flex-1 overflow-hidden rounded-2 border border-stroke-2 bg-surface-2">
            <div
              className="h-full rounded-2 bg-accent transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-2xs font-medium text-fg-2">
            {pct}
            % complete
          </span>
          <span className="shrink-0 font-mono text-2xs text-fg-4">
            {done}
            /
            {total}
            {' '}
            steps
          </span>
        </div>
      </div>

      {/* ordered snapshot chain — a pending checklist. Centered max-width column,
          aligned with the header content. */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          {run.atcs.map(atc => (
            <div
              key={atc.id}
              data-testid={`runner-atc-${atc.position}`}
              className="card flex flex-col gap-3 p-3"
            >
              {/* ATC header — position chip + title + status dot */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 font-mono text-2xs font-medium text-fg-3">
                  {String(atc.position).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-1">
                  {atc.atc_title}
                </span>
                <span className="dot shrink-0" data-status={atc.status} />
              </div>

              {/* step checklist — ChainedAtcCard <ol> anatomy + a per-step status
                  dot so the pending state is visible. */}
              <ol
                data-testid={`runner-steps-${atc.position}`}
                className="m-0 flex list-none flex-col overflow-hidden rounded-2 border border-stroke-2 bg-surface-2 p-0"
              >
                {atc.steps.map((s, i) => (
                  <li
                    key={s.id}
                    data-testid={`runner-step-${atc.position}-${s.position}`}
                    className={`grid grid-cols-[28px_1fr] items-stretch ${i === 0 ? '' : 'border-t border-stroke-1'}`}
                  >
                    <span className="inline-flex items-center justify-center border-r border-stroke-1 font-mono text-xs font-medium text-fg-3">
                      {String(s.position).padStart(2, '0')}
                    </span>
                    <div className="flex items-start gap-2 px-3 py-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="break-words text-[13px] text-fg-1">{s.content}</span>
                        {s.input_data != null && s.input_data !== '' && (
                          <span className="break-words font-mono text-2xs text-fg-3">
                            input:
                            {' '}
                            {s.input_data}
                          </span>
                        )}
                        {s.expected != null && s.expected !== '' && (
                          <span className="break-words font-mono text-2xs text-fg-3">
                            expected:
                            {' '}
                            {s.expected}
                          </span>
                        )}
                      </div>
                      <span className="dot mt-1 shrink-0" data-status={s.status} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
