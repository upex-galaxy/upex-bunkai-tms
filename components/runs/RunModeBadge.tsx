import type { RunMode } from '@lib/runs/run-mode';
import { deriveRunMode, RUN_MODE_LABEL } from '@lib/runs/run-mode';
import { Bot, User } from 'lucide-react';

// BK-225 — derived, read-only execution-mode pill (mockup `.mode-badge`).
// Icon + text always, never color alone: neutral tone for Manual, a stronger
// stroke/ink for Automated.
const TONE: Record<RunMode, string> = {
  manual: 'border-stroke-2 text-fg-3',
  automated: 'border-stroke-3 text-fg-1',
};

export function RunModeBadge({ executorMode }: { executorMode: string }) {
  const mode = deriveRunMode(executorMode);
  const Icon = mode === 'manual' ? User : Bot;
  return (
    <span
      data-testid="run-mode-badge"
      data-mode={mode}
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-1 border bg-surface-3 px-2 text-sm font-medium ${TONE[mode]}`}
    >
      <Icon size={11} aria-hidden="true" className="shrink-0" />
      {RUN_MODE_LABEL[mode]}
    </span>
  );
}
