// BK-225 — execution mode: a DERIVED, read-only view of a Run's executor.
// Manual = executor `human`; Automated = executor `agent` or `ci`. Nothing is
// stored and nothing edits it (mode is fixed with `executor_mode` at Run
// creation). Zero imports so client components can use it freely.

export type RunMode = 'manual' | 'automated';

// The Mode filter control is a PRESET over the existing Executor filter (the
// single filter state): `all` = no executor selected, `custom` = a selection
// that matches no preset (e.g. Agent only, Human + CI).
export type RunModeFilter = 'all' | RunMode | 'custom';

export const MANUAL_EXECUTORS = ['human'] as const;
export const AUTOMATED_EXECUTORS = ['agent', 'ci'] as const;

export const RUN_MODE_LABEL: Record<RunMode, string> = {
  manual: 'Manual',
  automated: 'Automated',
};

export function deriveRunMode(executorMode: string): RunMode {
  return executorMode === 'human' ? 'manual' : 'automated';
}

// Executor selection -> Mode control state.
export function resolveModeFilter(executors: readonly string[]): RunModeFilter {
  const set = new Set(executors);
  if (set.size === 0) {
    return 'all';
  }
  if (set.size === 1 && set.has('human')) {
    return 'manual';
  }
  if (set.size === 2 && set.has('agent') && set.has('ci')) {
    return 'automated';
  }
  return 'custom';
}

// Mode control choice -> the executor selection the UI sends.
export function executorsForMode(mode: 'all' | RunMode): string[] {
  if (mode === 'manual') {
    return [...MANUAL_EXECUTORS];
  }
  if (mode === 'automated') {
    return [...AUTOMATED_EXECUTORS];
  }
  return [];
}
