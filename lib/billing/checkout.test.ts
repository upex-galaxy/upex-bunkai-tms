import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// The module under test imports `@lib/supabase/admin`, which pulls in
// `server-only`; shim it so the module graph loads under Bun. Same
// convention as `app/api/v1/runs/route.test.ts` / `lib/api/capability-
// enforcement.test.ts`.
void mock.module('server-only', () => ({}));

// BK-638 — the cancel-path suites below need Stripe and the admin client to
// be steerable per test. Both substitutions live above the `await import`
// (mock.module only reaches modules resolved AFTER it registers) and are
// deliberately narrow: only the credential/client PROVIDERS are replaced, so
// every line of `cancelBillingCheckout`'s own logic runs unmocked. Same
// convention as `app/api/v1/billing/webhook/route.test.ts`.
//
// `mock.module` is PROCESS-wide, not file-scoped, and `bun test` does not
// guarantee file order. Without care, whichever of this file and the webhook
// route test registered its `@lib/billing/stripe` mock last would silently
// break the other (observed: the webhook's RPC-dispatch case answering 500
// instead of 502 because it got this file's admin double).
//
// Precisely what is safe, so nobody over-reads it: `createAdminClient` and
// `getStripeClient().checkout` fall through to real behaviour whenever this
// file's tests are not the ones steering them (`stripeRetrieve` /
// `adminFactory` are reset on BOTH `beforeEach` and `afterEach`), and
// `getStripeClient()`'s other properties always proxy to a real Stripe
// instance so `webhooks.constructEventAsync` keeps working. `getStripeCloudPriceId`
// and `getStripeWebhookSecret` are FIXED FAKES, and none of the three ever
// throws `payment_processor_unavailable` the way the real module does when
// STRIPE_* is unset. That is fine only while no other suite in this process
// asserts the unconfigured-Stripe 503 — today the sole other mocker is the
// webhook route test, using these same constants.

type StripeRetrieve = (sessionId: string) => Promise<{ status: string, url?: string }>;

// Same fixed non-secret as the webhook route test, so a Stripe client built
// from it verifies signatures identically no matter which mock wins.
const TEST_STRIPE_SECRET_KEY = 'sk_test_ci_only_not_a_real_key';
const TEST_WEBHOOK_SECRET = 'whsec_ci_only_not_a_real_secret';
const passthroughStripe = new Stripe(TEST_STRIPE_SECRET_KEY);

let stripeRetrieve: StripeRetrieve | null = null;
let stripeExpireCalls: string[] = [];
let adminFactory: (() => unknown) | null = null;
let adminBuildCount = 0;

// NOT `await import('@lib/supabase/admin')` for the passthrough: `mock.module`
// patches the EXISTING module record, so a namespace captured beforehand ends
// up pointing at this very mock and `createAdminClient()` recurses forever
// (observed as `bun test` hanging on the first webhook case, no output).
// Constructing the client here — the same two env vars and the same options
// `lib/supabase/admin.ts` uses — keeps the fallback a genuinely real client.
function passthroughAdminClient(): unknown {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Everything except `checkout` falls through to a real Stripe client (that is
// what keeps `webhooks.constructEventAsync` working for whichever other suite
// is sharing this process). `checkout` itself NEVER falls through: passing it
// to the real client would send an unsteered test's request to api.stripe.com
// over the network with a bogus key. Unsteered access throws instead.
const steerableStripe = new Proxy(passthroughStripe, {
  get(target, prop, receiver) {
    if (prop === 'checkout') {
      const impl = stripeRetrieve;
      if (!impl) {
        throw new Error('checkout.sessions was reached without a test configuring `stripeRetrieve` — refusing to fall through to the real Stripe API');
      }
      return {
        sessions: {
          retrieve: async (sessionId: string) => impl(sessionId),
          expire: async (sessionId: string) => {
            stripeExpireCalls.push(sessionId);
            return { id: sessionId, status: 'expired' };
          },
        },
      };
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

void mock.module('@lib/billing/stripe', () => ({
  getStripeClient: () => steerableStripe,
  getStripeCloudPriceId: () => 'price_ci_only_not_real',
  getStripeWebhookSecret: () => TEST_WEBHOOK_SECRET,
}));

void mock.module('@lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminBuildCount += 1;
    return adminFactory ? adminFactory() : passthroughAdminClient();
  },
}));

const { resolveSeatQuantityBounds, validateSeatQuantity, beginBillingCheckout, cancelBillingCheckout } = await import('./checkout');
const { withApiHandler } = await import('@lib/api/handler');

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

// ---------------------------------------------------------------------------
// BK-638 — cancelBillingCheckout. Three gaps the PR #208 round-2 review
// raised and the fix round did not close: the owner gate (item 4), the
// already-complete branch (item 5), and — defect 2 — an unguarded
// `stripe.checkout.sessions.retrieve()` whose failure reached the caller with
// Stripe's own upstream text inside the response body.
// ---------------------------------------------------------------------------

const WORKSPACE_ID = '33333333-3333-3333-3333-333333333333';
const OPEN_ROW_ID = '44444444-4444-4444-4444-444444444444';
const STRIPE_SESSION_ID = 'cs_test_bk638_cancel_path';

interface OpenRow {
  id: string
  stripe_checkout_session_id: string | null
}

interface RecordedUpdate {
  patch: Record<string, unknown>
  filters: [string, unknown][]
}

// Minimal PostgREST-shaped double covering exactly the two chains
// `cancelBillingCheckout` builds on the admin client:
//   read  — .from(t).select(cols).eq().eq().maybeSingle()
//   write — .from(t).update(patch).eq().eq()   (awaited directly)
//
// The FILTERS are recorded, not just the patch. `.eq('id', …).eq('status',
// 'open')` is the compare-and-swap that makes this write a lock release: it
// must not flip a row some other request already moved off `open`. A double
// that recorded only the patch would stay green if that second `.eq` were
// deleted — and because the chain is awaited directly, the awaited value
// would then be a non-thenable and `updateError` would silently be
// `undefined`.
function fakeAdmin(row: OpenRow | null, updates: RecordedUpdate[]): unknown {
  return {
    from: (table: string) => {
      if (table !== 'billing_checkout_sessions') {
        throw new Error(`unexpected admin table access: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          const recorded: RecordedUpdate = { patch, filters: [] };
          updates.push(recorded);
          // Every link is thenable, so a chain that ends one `.eq` early is
          // still awaitable — and is then caught by the filter assertion
          // rather than resolving to `undefined` and passing silently.
          const link = {
            eq: (column: string, value: unknown) => {
              recorded.filters.push([column, value]);
              return link;
            },
            then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
          };
          return link;
        },
      };
    },
  };
}

function ownerDb(): SupabaseClient<Database> {
  return {
    rpc: async (fn: string) => {
      if (fn === 'bunkai_is_workspace_owner') {
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc call: ${fn}`);
    },
    from: () => { throw new Error('cancelBillingCheckout must not read tables through the caller client'); },
  } as unknown as SupabaseClient<Database>;
}

function releaseModuleOverrides(): void {
  // `null` = fall through to the real module. Reset on BOTH edges: `beforeEach`
  // alone leaves the last test's doubles installed for whatever file `bun test`
  // runs next in this same process.
  stripeRetrieve = null;
  adminFactory = null;
}

beforeEach(() => {
  stripeExpireCalls = [];
  adminBuildCount = 0;
  releaseModuleOverrides();
});

afterEach(releaseModuleOverrides);

describe('cancelBillingCheckout — owner gate (PR #208 review item 4)', () => {
  test('a non-owner member is rejected with `forbidden`/`not_workspace_owner` before any admin client is built', async () => {
    // This gate is the ONLY thing between a non-owner member and cancelling
    // the owner's in-progress checkout: migration 0077 dropped the
    // billing_checkout_sessions write policies, and `workspace:admin` +
    // `assertWorkspaceContext` are both no-ops for a cookie session
    // (ADR-0006). `adminBuildCount` below is the part that matters: it proves
    // the gate rejected BEFORE the function reached for admin credentials,
    // not merely that it rejected eventually.
    const db = {
      rpc: async (fn: string) => {
        if (fn === 'bunkai_is_workspace_owner') {
          return { data: false, error: null };
        }
        throw new Error(`unexpected rpc call in cancel owner-gate test: ${fn}`);
      },
      from: () => { throw new Error('unexpected table access — the gate must reject before any read'); },
    } as unknown as SupabaseClient<Database>;

    try {
      await cancelBillingCheckout({ db, workspaceId: WORKSPACE_ID });
      throw new Error('expected cancelBillingCheckout to reject');
    }
    catch (err) {
      expect((err as { code?: string }).code).toBe('forbidden');
      expect((err as { details?: { reason?: string } }).details?.reason).toBe('not_workspace_owner');
    }

    expect(adminBuildCount).toBe(0);
  });
});

describe('cancelBillingCheckout — already-complete branch (PR #208 review item 5)', () => {
  test('a Stripe session in `complete` answers 409 and leaves the row OPEN for the webhook', async () => {
    // The round-2 fix: this used to call expire() first and swallow every
    // failure, flipping an already-PAID row to `canceled` — after which the
    // webhook's own paid event no-ops against it. The assertion that matters
    // is not the 409, it is that NOTHING was written and expire() was never
    // called, so the paid row survives for the webhook to apply.
    const updates: RecordedUpdate[] = [];
    adminFactory = () => fakeAdmin({ id: OPEN_ROW_ID, stripe_checkout_session_id: STRIPE_SESSION_ID }, updates);
    stripeRetrieve = async () => ({ status: 'complete' });

    try {
      await cancelBillingCheckout({ db: ownerDb(), workspaceId: WORKSPACE_ID });
      throw new Error('expected cancelBillingCheckout to reject');
    }
    catch (err) {
      expect((err as { code?: string }).code).toBe('checkout_in_progress');
      expect((err as { status?: number }).status).toBe(409);
      expect((err as { details?: { reason?: string } }).details?.reason).toBe('checkout_already_completed');
    }

    expect(updates).toEqual([]);
    expect(stripeExpireCalls).toEqual([]);
  });

  test('a Stripe session still `open` is expired and the row flips to `canceled`', async () => {
    // The paired positive case. A 409 on its own is also what a cancel path
    // that is simply broken would produce; only the two together isolate the
    // already-complete branch as the thing under test.
    const updates: RecordedUpdate[] = [];
    adminFactory = () => fakeAdmin({ id: OPEN_ROW_ID, stripe_checkout_session_id: STRIPE_SESSION_ID }, updates);
    stripeRetrieve = async () => ({ status: 'open', url: 'https://checkout.stripe.test/session' });

    await cancelBillingCheckout({ db: ownerDb(), workspaceId: WORKSPACE_ID });

    expect(stripeExpireCalls).toEqual([STRIPE_SESSION_ID]);
    // Both the patch AND its filters: `.eq('status', 'open')` is the
    // compare-and-swap that stops this write from flipping a row another
    // request already moved off `open`. Asserting the patch alone would stay
    // green if that filter were dropped.
    expect(updates).toEqual([{
      patch: { status: 'canceled' },
      filters: [['id', OPEN_ROW_ID], ['status', 'open']],
    }]);
  });
});

describe('cancelBillingCheckout — Stripe retrieve() failure (BK-638 defect 2)', () => {
  // The leak is only observable in the body the CALLER receives, so these
  // assertions drive the REAL response pipeline: `withApiHandler`'s own
  // `toApiError` + `errorResponse`, exactly as the cancel route does. Calling
  // the function and inspecting the thrown object would miss the defect —
  // `toApiError` is what copies a raw upstream `Error.message` into
  // `internal_error`, and `errorResponse` is what serialises it into the body.
  const UPSTREAM_TEXT = 'No such checkout.session: cs_live_other_account_9xQ; request-log req_bk638leak';

  function cancelHandler(): (request: NextRequest) => Promise<Response> {
    return withApiHandler(async () => {
      await cancelBillingCheckout({ db: ownerDb(), workspaceId: WORKSPACE_ID });
      return new Response(null, { status: 204 });
    }, { auth: 'public' });
  }

  function cancelRequest(): NextRequest {
    return new NextRequest(`https://app.test/api/v1/workspaces/${WORKSPACE_ID}/billing/checkout/cancel`, { method: 'POST' });
  }

  test('the caller never receives Stripe\'s upstream message in the response body', async () => {
    const updates: RecordedUpdate[] = [];
    adminFactory = () => fakeAdmin({ id: OPEN_ROW_ID, stripe_checkout_session_id: STRIPE_SESSION_ID }, updates);
    stripeRetrieve = async () => { throw new Error(UPSTREAM_TEXT); };

    const response = await cancelHandler()(cancelRequest());

    expect(response.status).toBe(500);
    const raw = await response.text();
    expect(raw).not.toContain(UPSTREAM_TEXT);
    expect(raw).not.toContain('cs_live_other_account_9xQ');
    expect(raw).not.toContain('req_bk638leak');

    const body = JSON.parse(raw) as { error: { code: string, message: string } };
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message.length).toBeGreaterThan(0);

    // The lock must NOT be released on an unknown Stripe state — refusing to
    // cancel beats cancelling a session that may already be paid.
    expect(updates).toEqual([]);
  });

  test('a payment processor that is not configured keeps its own 503 rather than collapsing to 500', async () => {
    // FORWARD guard, not evidence for this fix: it passes with OR without the
    // try/catch, because an ApiError left unguarded reaches `toApiError`
    // unchanged and produces the same 503. What it protects against is a
    // FUTURE over-broad catch here swallowing `getStripeClient()`'s own
    // `payment_processor_unavailable` into a generic 500 and costing the
    // operator the "Stripe is not configured" signal.
    const { ApiError } = await import('@lib/api/error-envelope');
    const updates: RecordedUpdate[] = [];
    adminFactory = () => fakeAdmin({ id: OPEN_ROW_ID, stripe_checkout_session_id: STRIPE_SESSION_ID }, updates);
    stripeRetrieve = async () => { throw new ApiError('payment_processor_unavailable', 'The payment processor is not configured for this environment.'); };

    const response = await cancelHandler()(cancelRequest());

    expect(response.status).toBe(503);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('payment_processor_unavailable');
    expect(updates).toEqual([]);
  });
});
