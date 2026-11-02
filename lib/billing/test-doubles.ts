import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// BK-231 — hand-rolled doubles for the billing services' unit tests. They stand
// in for the two edges that would otherwise need a live Stripe account or a
// database: a recording Supabase client and (in each test file) a Stripe object.
// Behaviour that depends on the real database (RLS, the RPCs, the effective
// plan) is covered by lib/billing/billing-details-isolation.test.ts instead.

export interface QueryCall {
  table: string
  op: 'select' | 'update' | 'upsert'
  filters: Array<[string, 'eq' | 'in', unknown]>
  payload?: unknown
  options?: unknown
}

export interface QueryResult {
  data: unknown
  error: { message: string, code?: string } | null
}

export type Resolver = (call: QueryCall) => QueryResult | undefined;
export type RpcHandler = (args: Record<string, unknown>) => QueryResult;

export function fakeSupabase(resolver: Resolver, rpcs: Record<string, RpcHandler> = {}) {
  const calls: QueryCall[] = [];
  const rpcCalls: Array<{ fn: string, args: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      const call: QueryCall = { table, op: 'select', filters: [] };
      const finish = async (): Promise<QueryResult> => {
        calls.push(call);
        return Promise.resolve(resolver(call) ?? { data: null, error: null });
      };
      const builder = {
        select: () => builder,
        update: (payload: unknown) => {
          call.op = 'update';
          call.payload = payload;
          return builder;
        },
        upsert: (payload: unknown, options?: unknown) => {
          call.op = 'upsert';
          call.payload = payload;
          call.options = options;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push([column, 'eq', value]);
          return builder;
        },
        in: (column: string, value: unknown) => {
          call.filters.push([column, 'in', value]);
          return builder;
        },
        maybeSingle: finish,
        single: finish,
        then: async (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => finish().then(resolve, reject),
      };
      return builder;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      const handler = rpcs[fn];
      return Promise.resolve(handler ? handler(args) : { data: null, error: null });
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls, rpcCalls };
}

export const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '33333333-3333-4333-8333-333333333333';
export const CUSTOMER_ID = 'cus_test_0001';

export function ownerRpc(isOwner: boolean): Record<string, RpcHandler> {
  return { bunkai_is_workspace_owner: () => ({ data: isOwner, error: null }) };
}

export function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: WORKSPACE_ID,
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: 'sub_test_0001',
    payment_method_brand: 'visa',
    payment_method_last4: '4242',
    payment_method_exp_month: 4,
    payment_method_exp_year: 2028,
    payment_method_updated_at: null,
    payment_state: 'paid',
    failed_invoice_id: null,
    last_payment_failed_at: null,
    recovered_at: null,
    retry_attempts: 0,
    retry_started_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

// `await expect(p).rejects` trips ts/await-thenable in this repo's lint config
// (see lib/api/auth-coexistence.test.ts), so assertions go through this instead.
export async function rejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
  }
  catch (error) {
    return error as Record<string, unknown>;
  }
  throw new Error('expected the promise to reject');
}
