import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, mock, test } from 'bun:test';

// The module under test imports `@lib/supabase/admin`, which pulls in
// `server-only`; shim it so the module graph loads under Bun. Same
// convention as `app/api/v1/runs/route.test.ts` / `lib/api/capability-
// enforcement.test.ts`.
void mock.module('server-only', () => ({}));
const { resolveSeatQuantityBounds, validateSeatQuantity, beginBillingCheckout } = await import('./checkout');

// BK-230 — pure-function coverage for the seat-quantity bounds (Scenario
// 2.4/2.5, the AI Product Owner decision published on the ticket: minimum =
// current active_seats, maximum = the Cloud tier's seatLimit, 25). No
// database — mirrors plan-tiers.test.ts's style.

describe('resolveSeatQuantityBounds', () => {
  test('min is the workspace\'s active_seats count; max is the Cloud seatLimit (25)', () => {
    expect(resolveSeatQuantityBounds(5)).toEqual({ min: 5, max: 25 });
  });

  test('min floors at 1 for a workspace with 0 active seats (should not happen, but never a 0 floor)', () => {
    expect(resolveSeatQuantityBounds(0)).toEqual({ min: 1, max: 25 });
  });

  test('a workspace already exceeding the Cloud cap yields an inverted bound (min > max)', () => {
    expect(resolveSeatQuantityBounds(30)).toEqual({ min: 30, max: 25 });
  });
});

describe('validateSeatQuantity', () => {
  const bounds = { min: 5, max: 25 };

  test('accepts a quantity inside the bounds', () => {
    expect(() => validateSeatQuantity(10, bounds)).not.toThrow();
  });

  test('accepts the exact min and max boundaries', () => {
    expect(() => validateSeatQuantity(5, bounds)).not.toThrow();
    expect(() => validateSeatQuantity(25, bounds)).not.toThrow();
  });

  test('rejects below min (Scenario 2.4 — cannot buy fewer seats than are already active)', () => {
    expect(() => validateSeatQuantity(4, bounds)).toThrow();
  });

  test('rejects 0 (Scenario 2.5)', () => {
    expect(() => validateSeatQuantity(0, { min: 1, max: 25 })).toThrow();
  });

  test('rejects above max', () => {
    expect(() => validateSeatQuantity(26, bounds)).toThrow();
  });

  test('rejects a non-integer', () => {
    expect(() => validateSeatQuantity(5.5, bounds)).toThrow();
  });

  test('an inverted bound (workspace already over the Cloud cap) rejects every quantity with a distinct reason', () => {
    const inverted = { min: 30, max: 25 };
    try {
      validateSeatQuantity(30, inverted);
      throw new Error('expected validateSeatQuantity to throw');
    }
    catch (err) {
      expect((err as { details?: { reason?: string } }).details?.reason).toBe('active_seats_exceed_cloud_cap');
    }
  });
});

// Conductor review (PR #208) item 6 — "beginBillingCheckout's owner gate
// (checkout.ts:66-74, the server half of AC 5.2) is equally untested." A
// fake `db` whose `rpc` never resolves `true` proves the gate fires, and
// fires BEFORE anything else — the fake throws on any OTHER rpc/table call,
// so a test that reached Stripe or the billing-overview RPC would fail loudly
// here instead of silently passing for the wrong reason.
describe('beginBillingCheckout — owner gate (AC 5.2, server half)', () => {
  function nonOwnerDb(): SupabaseClient<Database> {
    return {
      rpc: async (fn: string) => {
        if (fn === 'bunkai_is_workspace_owner') {
          return { data: false, error: null };
        }
        throw new Error(`unexpected rpc call in owner-gate test: ${fn}`);
      },
      from: () => { throw new Error('unexpected table access in owner-gate test — the gate must reject before any other read'); },
    } as unknown as SupabaseClient<Database>;
  }

  test('a non-owner is rejected with `forbidden`/`not_workspace_owner`, before any other DB read or Stripe call', async () => {
    const db = nonOwnerDb();

    // `.rejects.toMatchObject` does not deep-compare an `ApiError` instance's
    // own properties reliably in bun:test (see lib/api/idempotency.test.ts's
    // `expectApiError` helper) — assert on the caught error directly.
    try {
      await beginBillingCheckout({
        db,
        workspaceId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        seatQuantity: 5,
        idempotencyKey: 'test-key-owner-gate-00000000',
      });
      throw new Error('expected beginBillingCheckout to reject');
    }
    catch (err) {
      expect((err as { code?: string }).code).toBe('forbidden');
      expect((err as { details?: { reason?: string } }).details?.reason).toBe('not_workspace_owner');
    }
  });
});
