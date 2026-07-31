// BK-35 / ADR-0010 — pure, testable core of the Run detail page's Realtime
// wiring (AC4: a second viewer watching the same Run sees verdict and
// progress move live, without refreshing). Per ADR-0010's own "Consequences"
// section this is the FIRST real-time primitive in the codebase — "no
// existing test/mocking pattern for it" — so this module establishes the
// pattern the rest of the product reuses: every DECISION the realtime wiring
// makes (what to subscribe to, what to do with a burst of incoming events,
// whether a connection-state transition needs a reconciliation fetch) lives
// here as plain data in / plain data out, with zero Supabase import and zero
// side effect. The actual `supabase.channel(...)` call and its
// `.on('postgres_changes', ...)` binding belong to the UI slice
// (RunnerView.tsx wiring, BK-35 child 4) — that code calls INTO this module,
// this module never calls OUT to a live socket, so it stays testable with no
// live connection (mirrors lib/runs/duration.ts's co-located-test,
// side-effect-free shape — the established pattern for this repo's pure
// `lib/runs/**` helpers).

// ---------------------------------------------------------------------------
// Channel config
// ---------------------------------------------------------------------------

// Minimal duck-typed shape this module needs from a Run — deliberately NOT
// imported from components/runs/RunnerView.tsx. `lib/**` never imports from
// `components/**` (that dependency only ever runs the other way); RunDetail
// already structurally satisfies this (`{ id, atcs: [{ id, ... }] }`), so the
// UI slice can pass its `view` state straight in with no adapter.
export interface RunChannelSource {
  id: string
  atcs: Array<{ id: string }>
}

export interface PostgresChangesBinding {
  event: 'UPDATE'
  schema: 'public'
  table: 'run_atcs' | 'run_steps'
  filter: string
}

export interface RunChannelConfig {
  // One channel per Run; mirrors ADR-0010's run_id-scoped subscription.
  channelName: string
  bindings: PostgresChangesBinding[]
}

// D8 (implementation-plan.md) — corrects ADR-0010's illustrative single-table
// filter: `run_steps` has no `run_id` column (schema audit finding 3), only
// `run_atc_id` (FK to `run_atcs`, which DOES have `run_id`). Postgres Changes
// filters are single-column predicates on the subscribed table, so one
// channel binds TWO tables instead: `run_atcs` on its real `run_id` column,
// and `run_steps` on the full set of this Run's `run_atc` ids via an `in.()`
// filter. That id set is fixed for a Run's lifetime (run_atcs rows are only
// ever created once, at run start, per the plan's schema audit) so the
// caller resolves it once from data it already has (the same payload that
// renders the checklist) — this function takes it as an argument rather than
// fetching it itself. Both bindings listen for UPDATE only: marking a step
// and recomputing its parent ATC verdict (D9) are both in-place UPDATEs on
// this data model (D5, D7), never an INSERT or DELETE.
export function buildRunChannelConfig(run: RunChannelSource): RunChannelConfig {
  const runAtcIds = run.atcs.map(atc => atc.id);

  return {
    channelName: `run-${run.id}`,
    bindings: [
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'run_atcs',
        filter: `run_id=eq.${run.id}`,
      },
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'run_steps',
        filter: `run_atc_id=in.(${runAtcIds.join(',')})`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Refetch coalescing
// ---------------------------------------------------------------------------

// RT-1's specified default (implementation-plan.md): one mark can touch both
// `run_atcs` and `run_steps` in a single transaction, firing two Postgres
// Changes events within milliseconds of each other. Without coalescing, a
// second viewer's tab would issue two near-simultaneous GET /runs/{id}
// refetches per mark. 250ms is comfortably above realistic same-transaction
// event skew and short enough that the live update still reads as instant.
export const DEFAULT_REFETCH_DEBOUNCE_MS = 250;

// Injectable so tests never wait on a real timer. A grep of this repo found
// no existing fake-timer test pattern to mirror (this is the first
// time-sensitive `lib/runs/**` unit), so the scheduler defines its own seam
// here: real `setTimeout`/`clearTimeout` by default (the UI slice gets this
// for free by omitting the arg), a synchronous fake clock in the test file.
// `ReturnType<typeof setTimeout>` mirrors this codebase's own existing timer
// handle typing (components/settings/IssueTokenModal.tsx).
export interface RefetchSchedulerClock {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void
}

const REAL_CLOCK: RefetchSchedulerClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle),
};

export interface RefetchScheduler {
  // Call once per incoming Postgres Changes event (and once per SUBSCRIBED
  // transition that needs reconciliation, see shouldReconcileOnStatusChange
  // below). Coalesces any calls within `debounceMs` of each other into
  // exactly one `refetch()` call, timed from the LAST call in the burst
  // (trailing-edge debounce) — a fresh mark always restarts the window
  // rather than firing a refetch mid-burst that a moment later goes stale.
  trigger: () => void
  // Drops a pending, not-yet-fired refetch. Exposed for the UI slice's
  // effect-cleanup on unmount / Run change, mirroring the cleanup contract
  // the plan's RT-2 wiring needs.
  cancel: () => void
}

// A pure state machine: the only state is "is a refetch currently pending",
// held in a closure and never read back out — trigger()/cancel() are the
// whole interface, so behavior is verified by observing calls to the
// injected `refetch`, not by inspecting internals.
export function createRefetchScheduler(
  refetch: () => void,
  debounceMs: number = DEFAULT_REFETCH_DEBOUNCE_MS,
  clock: RefetchSchedulerClock = REAL_CLOCK,
): RefetchScheduler {
  let pending: ReturnType<typeof setTimeout> | null = null;

  return {
    trigger() {
      if (pending !== null) {
        clock.clearTimeout(pending);
      }
      pending = clock.setTimeout(() => {
        pending = null;
        refetch();
      }, debounceMs);
    },
    cancel() {
      if (pending !== null) {
        clock.clearTimeout(pending);
        pending = null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Reconnection / reconciliation policy
// ---------------------------------------------------------------------------

// The four states `realtime-js` ever reports to a channel's `.subscribe()`
// callback (Supabase Realtime — Postgres Changes guide).
export type RealtimeConnectionStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

// ADR-0010's "Negative / trade-offs" section requires this explicitly: "If
// the client disconnects/reconnects, the UI needs a reconciliation fetch on
// reconnect — this is a real implementation detail Stage 1 planning must
// account for explicitly, not assume away." Events fired while disconnected
// are silently lost (Postgres Changes has no replay/catch-up buffer), so the
// only correct recovery is a full refetch, never a partial merge.
//
// Reconciliation is needed on any transition INTO `SUBSCRIBED` from a
// non-`SUBSCRIBED` previous state — this covers both the very first connect
// (closes any race between the page's initial fetch and the channel opening)
// and every genuine reconnect (`realtime-js` re-fires `SUBSCRIBED` each time
// it recovers from `CLOSED` / `TIMED_OUT` / `CHANNEL_ERROR`) through the same
// one code path, per the plan's own reasoning for RT-2's wiring. A repeated
// `SUBSCRIBED` callback for an already-connected channel, or a transition
// into any non-`SUBSCRIBED` status, never needs one — there is nothing new
// to reconcile until the connection is back up.
export function shouldReconcileOnStatusChange(
  previousStatus: RealtimeConnectionStatus | null,
  nextStatus: RealtimeConnectionStatus,
): boolean {
  return nextStatus === 'SUBSCRIBED' && previousStatus !== 'SUBSCRIBED';
}
