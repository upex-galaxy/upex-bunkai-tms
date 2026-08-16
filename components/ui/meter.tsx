import type { MeterState } from '@lib/billing/plan-tiers';
import { cn } from '@lib/utils';

interface MeterProps {
  label: string
  countLabel: string
  used: number
  limit: number | null
  fillPercent: number
  state: MeterState
  note?: string
  testId?: string
}

// A single usage meter — label, count, bar, optional note (BK-229). Frozen
// §2 tokens only, matches the mockup's `.meter`/`.bar`/`.fill` anatomy
// exactly: neutral fill below 80% (signal-skipped), amber warning fill at
// 80-99% (signal-blocked), red fill at 100%+ (signal-fail) — color is never
// the only signal, the warning state also carries a text chip via
// `MeterWarningChip` rendered by the caller.
export function Meter({ label, countLabel, used, limit, fillPercent, state, note, testId }: MeterProps) {
  const fillColor = state === 'limit-reached'
    ? 'bg-signal-fail'
    : state === 'warning'
      ? 'bg-signal-blocked'
      : 'bg-signal-skipped';

  return (
    <div className="border-t border-stroke-1 py-4 first:border-t-0 first:pt-0" data-testid={testId} data-state={state}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[12.5px] font-medium text-fg-1">{label}</span>
        <span className="ml-auto font-mono text-[12.5px] text-fg-0">{countLabel}</span>
      </div>
      {limit !== null && (
        <div
          role="meter"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`${label}: ${countLabel}`}
          className="h-1 overflow-hidden rounded-full bg-surface-4"
        >
          <span
            className={cn('block h-full rounded-full transition-[width]', fillColor)}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      )}
      {note && <p className="mt-2 text-[11.5px] text-fg-3">{note}</p>}
    </div>
  );
}

// Text-plus-icon warning chip — the non-color half of the "never color-only"
// signal for a meter at 80%+ (matches the mockup's `.chip-warn`).
export function MeterWarningChip({ label = 'Near limit' }: { label?: string }) {
  return (
    <span
      data-testid="meter-warning-chip"
      className="inline-flex items-center gap-1 rounded-1 border border-stroke-2 bg-signal-blocked-bg px-2 py-0 text-[11.5px] font-medium leading-[1.7] text-signal-blocked"
    >
      {label}
    </span>
  );
}
