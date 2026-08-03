// BK-209 (Slice 3: UI) — pure, framework-agnostic relative-time formatter for
// notification rows (mockup: "4m ago", "26m ago", "1h ago", "6d ago").
// NotificationsPanel fetches its rows client-side, after mount, and is never
// part of the server-rendered first paint (unlike RunnerView/ActivityView's
// deterministic-UTC timestamps, which exist specifically to dodge a
// hydration mismatch) — so a real relative computation is safe here.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// `now` is injectable so this stays unit-testable without faking the system
// clock (mirrors this repo's general "inject the clock, don't fake globals"
// posture — see lib/runs/realtime-run-channel.ts's RefetchSchedulerClock).
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const thenMs = new Date(iso).getTime();
  const diffMs = Math.max(0, now.getTime() - thenMs);

  if (diffMs < MINUTE_MS) {
    return 'just now';
  }
  if (diffMs < HOUR_MS) {
    return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  }
  if (diffMs < DAY_MS) {
    return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  }
  // Retention is 90 days (business-rules.md N1) — the row simply never
  // exists past that, so "Nd ago" is never shown much past "89d ago".
  return `${Math.floor(diffMs / DAY_MS)}d ago`;
}
