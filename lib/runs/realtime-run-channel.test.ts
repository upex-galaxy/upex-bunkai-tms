import type { RefetchSchedulerClock } from '@lib/runs/realtime-run-channel';
import {
  buildRunChannelConfig,
  createRefetchScheduler,
  DEFAULT_REFETCH_DEBOUNCE_MS,
  shouldReconcileOnStatusChange,
} from '@lib/runs/realtime-run-channel';
import { describe, expect, test } from 'bun:test';

// BK-35 / ADR-0010 — this codebase's first unit test for real-time logic (no
// existing pattern to mirror, per ADR-0010's own "Consequences" section).
// Covers the three pure primitives realtime-run-channel.ts exports: the
// channel config builder (D8's two-binding shape), the refetch-coalescing
// scheduler (a manually-injected fake clock stands in for real timers, since
// no fake-timer helper exists elsewhere in this repo to mirror), and the
// reconnect/reconciliation decision function ADR-0010's "Negative/trade-offs"
// section explicitly requires.

// ---------------------------------------------------------------------------
// buildRunChannelConfig
// ---------------------------------------------------------------------------

describe('buildRunChannelConfig', () => {
  test('names the channel after the run id', () => {
    const config = buildRunChannelConfig({ id: 'run-1', atcs: [{ id: 'atc-1' }] });
    expect(config.channelName).toBe('run-run-1');
  });

  test('binds run_atcs on its real run_id column', () => {
    const config = buildRunChannelConfig({ id: 'run-1', atcs: [{ id: 'atc-1' }] });
    const binding = config.bindings.find(b => b.table === 'run_atcs');

    expect(binding).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'run_atcs',
      filter: 'run_id=eq.run-1',
    });
  });

  test('binds run_steps on the in.() set of this run\'s run_atc ids', () => {
    const config = buildRunChannelConfig({
      id: 'run-1',
      atcs: [{ id: 'atc-1' }, { id: 'atc-2' }, { id: 'atc-3' }],
    });
    const binding = config.bindings.find(b => b.table === 'run_steps');

    expect(binding).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'run_steps',
      filter: 'run_atc_id=in.(atc-1,atc-2,atc-3)',
    });
  });

  test('handles the single-ATC edge case without a trailing comma', () => {
    const config = buildRunChannelConfig({ id: 'run-1', atcs: [{ id: 'only-atc' }] });
    const binding = config.bindings.find(b => b.table === 'run_steps');

    expect(binding?.filter).toBe('run_atc_id=in.(only-atc)');
  });

  test('returns exactly two bindings, both UPDATE-only on the public schema', () => {
    const config = buildRunChannelConfig({ id: 'run-1', atcs: [{ id: 'atc-1' }] });

    expect(config.bindings).toHaveLength(2);
    for (const binding of config.bindings) {
      expect(binding.event).toBe('UPDATE');
      expect(binding.schema).toBe('public');
    }
  });
});

// ---------------------------------------------------------------------------
// createRefetchScheduler
// ---------------------------------------------------------------------------

// A synchronous fake clock: setTimeout records a pending callback instead of
// scheduling a real one; advance(ms) fires every callback whose delay has
// elapsed. Deterministic and instant — no real waiting in the test suite.
function createFakeClock(): RefetchSchedulerClock & { advance: (ms: number) => void } {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { fireAt: number, callback: () => void }>();

  return {
    setTimeout(callback: () => void, delayMs: number) {
      const handle = nextHandle++;
      timers.set(handle, { fireAt: now + delayMs, callback });
      return handle as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(handle: ReturnType<typeof setTimeout>) {
      timers.delete(handle as unknown as number);
    },
    advance(ms: number) {
      now += ms;
      // Snapshot entries first: a fired callback may itself schedule a new
      // timer (trigger() re-arms), which must not be visited in this pass.
      for (const [handle, timer] of [...timers.entries()]) {
        if (timer.fireAt <= now) {
          timers.delete(handle);
          timer.callback();
        }
      }
    },
  };
}

describe('createRefetchScheduler', () => {
  test('does not refetch before the debounce window elapses', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS - 1);

    expect(refetchCount).toBe(0);
  });

  test('refetches exactly once after a single trigger, once the window elapses', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);

    expect(refetchCount).toBe(1);
  });

  test('coalesces a burst of near-simultaneous triggers into one refetch', () => {
    // Simulates one mark touching both run_atcs and run_steps in the same
    // transaction — two Postgres Changes events, milliseconds apart.
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    clock.advance(5);
    scheduler.trigger();
    clock.advance(5);
    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);

    expect(refetchCount).toBe(1);
  });

  test('restarts the window from the LAST trigger in a burst (trailing-edge)', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS - 1);
    scheduler.trigger(); // restarts the window just before it would have fired
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS - 1);

    expect(refetchCount).toBe(0); // still pending — the restart moved the deadline

    clock.advance(1);
    expect(refetchCount).toBe(1);
  });

  test('cancel() drops a pending refetch', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    scheduler.cancel();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);

    expect(refetchCount).toBe(0);
  });

  test('a later trigger after a completed refetch schedules an independent one', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(1);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(2);
  });

  test('defaults debounceMs to 250 when not supplied', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, undefined, clock);

    scheduler.trigger();
    clock.advance(249);
    expect(refetchCount).toBe(0);

    clock.advance(1);
    expect(refetchCount).toBe(1);
  });

  // BK-718 — the optional maxWaitMs ceiling.
  test('without a ceiling, a stream faster than the debounce holds the refetch until it stops', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock);

    // One event every 200 ms for 8 s: each restarts the 250 ms window.
    for (let elapsed = 0; elapsed < 8000; elapsed += 200) {
      scheduler.trigger();
      clock.advance(200);
    }
    expect(refetchCount).toBe(0);

    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(1);
  });

  test('with a ceiling, a stream faster than the debounce still refetches at least every maxWaitMs', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock, 2000);

    for (let elapsed = 0; elapsed < 8000; elapsed += 200) {
      scheduler.trigger();
      clock.advance(200);
    }
    // 8 s of stream with a 2 s ceiling: refetches at 2, 4, 6 and 8 s, never a
    // gap past 2 s. The one at 8 s already follows the last event (7.8 s), so
    // nothing is left pending once the stream stops.
    expect(refetchCount).toBe(4);

    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(4);
  });

  test('with a ceiling, an event after a ceiling refetch still gets its own trailing refetch', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock, 2000);

    for (let elapsed = 0; elapsed < 2000; elapsed += 200) {
      scheduler.trigger();
      clock.advance(200);
    }
    expect(refetchCount).toBe(1);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(2);
  });

  test('with a ceiling, an isolated trigger still fires once on the trailing edge, not again at the ceiling', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock, 2000);

    scheduler.trigger();
    clock.advance(DEFAULT_REFETCH_DEBOUNCE_MS);
    expect(refetchCount).toBe(1);

    clock.advance(5000);
    expect(refetchCount).toBe(1);
  });

  test('cancel drops both the trailing refetch and the ceiling', () => {
    let refetchCount = 0;
    const clock = createFakeClock();
    const scheduler = createRefetchScheduler(() => { refetchCount++; }, DEFAULT_REFETCH_DEBOUNCE_MS, clock, 2000);

    scheduler.trigger();
    clock.advance(100);
    scheduler.cancel();
    clock.advance(5000);

    expect(refetchCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// shouldReconcileOnStatusChange
// ---------------------------------------------------------------------------

describe('shouldReconcileOnStatusChange', () => {
  test('the very first connect (no previous status) needs reconciliation', () => {
    expect(shouldReconcileOnStatusChange(null, 'SUBSCRIBED')).toBe(true);
  });

  test('a disconnect -> reconnect transition needs reconciliation', () => {
    expect(shouldReconcileOnStatusChange('CLOSED', 'SUBSCRIBED')).toBe(true);
    expect(shouldReconcileOnStatusChange('TIMED_OUT', 'SUBSCRIBED')).toBe(true);
    expect(shouldReconcileOnStatusChange('CHANNEL_ERROR', 'SUBSCRIBED')).toBe(true);
  });

  test('a stable, already-connected state does not need reconciliation', () => {
    expect(shouldReconcileOnStatusChange('SUBSCRIBED', 'SUBSCRIBED')).toBe(false);
  });

  test('transitioning away from SUBSCRIBED does not need reconciliation', () => {
    expect(shouldReconcileOnStatusChange('SUBSCRIBED', 'CLOSED')).toBe(false);
    expect(shouldReconcileOnStatusChange('SUBSCRIBED', 'TIMED_OUT')).toBe(false);
    expect(shouldReconcileOnStatusChange('SUBSCRIBED', 'CHANNEL_ERROR')).toBe(false);
  });

  test('a still-disconnected transition does not need reconciliation', () => {
    expect(shouldReconcileOnStatusChange('CLOSED', 'TIMED_OUT')).toBe(false);
    expect(shouldReconcileOnStatusChange(null, 'CLOSED')).toBe(false);
  });
});
