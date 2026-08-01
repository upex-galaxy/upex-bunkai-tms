// BK-47 — pure TS layer for the recovery-cycle report. The RPC
// (bunkai_report_project_recovery_cycles, 0049_recovery_cycle_report.sql)
// returns only raw per-story timestamps + state (Decision 3: no median, no
// formatted durations, no per-row seconds — that's this file's job, kept out
// of SQL so every edge case is unit-testable without a live Postgres
// connection). The API route (Step 4) is the only caller.

export interface RecoveryCycleRawItem {
  user_story_id: string
  title: string
  external_id: string | null
  module_id: string
  module_path: string
  first_fail_at: string | null
  first_green_at: string | null
  state: 'recovered' | 'in_progress' | 'no_cycle'
}

export interface RecoveryCycleRawPayload {
  items: RecoveryCycleRawItem[]
}

export interface RecoveryCycleReportItem extends RecoveryCycleRawItem {
  // `recovered`: seconds from first_fail_at to first_green_at (a fixed,
  // resolved duration). `in_progress`: seconds from first_fail_at to `now`
  // (the "so far" reading, computed once at render/response time per
  // Decision 6 — not live-ticking). `no_cycle`: null, there is no clock.
  cycle_seconds: number | null
}

export interface RecoveryCycleReport {
  items: RecoveryCycleReportItem[]
  median_recovery_seconds: number | null
  resolved_cycle_count: number
  story_count: number
}

// Elapsed seconds from `firstFailAt` to `now` (both epoch ms or ISO-parsable).
// Returns null when `firstFailAt` is unparseable — a formatting helper must
// never throw and break a report response (silent-fail is the repo's utility
// contract, matches lib/runs/duration.ts). Floors at zero: a `now` earlier
// than `firstFailAt` (clock skew, or a test fixture passing a stale `now`)
// must not render a nonsense negative duration.
export function computeElapsedSoFarSeconds(firstFailAt: string, now: number): number | null {
  const failedAt = Date.parse(firstFailAt);
  if (Number.isNaN(failedAt)) {
    return null;
  }
  return Math.max(0, Math.floor((now - failedAt) / 1000));
}

// Elapsed seconds between two ISO timestamps (the `recovered` case: first
// fail -> first green). Null when either bound is unparseable. Same
// floor-at-zero reasoning as computeElapsedSoFarSeconds.
function cycleSecondsBetween(startAt: string, endAt: string): number | null {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, Math.floor((end - start) / 1000));
}

// Standard median: middle value for an odd count, average of the two middle
// values for an even count. Null for an empty input (no resolved cycles to
// summarize) rather than 0 — a KPI of "0s" would misleadingly read as
// "instant recovery," not "no data" (the route/UI render a distinct
// zero-resolved-cycles empty state instead, per the plan's KPI card design).
export function computeMedianRecoverySeconds(cycleSecondsValues: number[]): number | null {
  if (cycleSecondsValues.length === 0) {
    return null;
  }
  const sorted = [...cycleSecondsValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Assembles the full API response from the RPC's raw payload. `now` is
// injected (not `Date.now()` internally) so every `in_progress` "so far"
// reading is deterministic and testable — the caller (the route) supplies
// the actual request-time clock.
export function buildRecoveryCycleReport(raw: RecoveryCycleRawPayload, now: number): RecoveryCycleReport {
  const items: RecoveryCycleReportItem[] = raw.items.map((item) => {
    let cycleSeconds: number | null = null;
    if (item.state === 'recovered' && item.first_fail_at !== null && item.first_green_at !== null) {
      cycleSeconds = cycleSecondsBetween(item.first_fail_at, item.first_green_at);
    }
    else if (item.state === 'in_progress' && item.first_fail_at !== null) {
      cycleSeconds = computeElapsedSoFarSeconds(item.first_fail_at, now);
    }
    return { ...item, cycle_seconds: cycleSeconds };
  });

  const resolvedCycleSeconds = items
    .filter(i => i.state === 'recovered' && i.cycle_seconds !== null)
    .map(i => i.cycle_seconds as number);

  return {
    items,
    median_recovery_seconds: computeMedianRecoverySeconds(resolvedCycleSeconds),
    resolved_cycle_count: resolvedCycleSeconds.length,
    story_count: items.length,
  };
}

// Format seconds as the mockup's grammar (`3d 4h 51m`, `15h 35m`) — a coarse,
// human-scanned reading for a reporting screen, not a live countdown, so
// seconds are dropped once minutes are shown and no component is
// zero-padded (matches the mockup's own literal examples). Null input (no
// cycle, e.g. `no_cycle` rows or a missing KPI) returns null, never a
// placeholder string — the caller renders its own empty-state copy.
export function formatCycleDuration(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return `${totalHours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return `${days}d ${remainingHours}h ${remainingMinutes}m`;
}
