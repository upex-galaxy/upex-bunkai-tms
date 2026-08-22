import { cn } from '@lib/utils';

// BK-202 — the Open / Closed status chip, shared by the list and the detail
// header. Dot + TEXT label, never colour alone — the standing
// colour-is-never-the-sole-signal rule from the design brief. Tone classes
// come from the live signal token set the Bug Reports list already uses
// (`TONE_CLASSES` in BugsListView), so no new colour is picked here.
//
// Only 'open' is reachable in this story: nothing BK-202 ships can close a
// plan. 'closed' is rendered correctly anyway because the column's value
// domain already admits it and Close (BK-207) should inherit a chip, not
// invent one.

export type TestPlanStatus = 'open' | 'closed';

const STATUS_CLASSES: Record<TestPlanStatus, { chip: string, dot: string }> = {
  open: { chip: 'border-signal-running-bg bg-signal-running-bg text-signal-running', dot: 'bg-signal-running' },
  closed: { chip: 'border-signal-skipped-bg bg-signal-skipped-bg text-signal-skipped', dot: 'bg-signal-skipped' },
};

const STATUS_LABEL: Record<TestPlanStatus, string> = {
  open: 'Open',
  closed: 'Closed',
};

export function TestPlanStatusChip({ status, testId }: { status: TestPlanStatus, testId?: string }) {
  const tone = STATUS_CLASSES[status];

  return (
    <span
      data-testid={testId}
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-1 border px-2 py-0.5 text-xs font-medium tracking-[0.02em]',
        tone.chip,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}
