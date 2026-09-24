import type { Principal } from '@lib/api/principal';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { NextRequest } from 'next/server';

// Route-level coverage for POST /api/v1/workspaces/{id}/billing/checkout.
//
// Drives the REAL exported handler (capability gate, workspace-context match,
// owner gate, error serialisation). Only the edges that would otherwise need
// a live session or database are substituted, and they are substituted with
// `spyOn` on the module namespace, NOT `mock.module`: a spy is restored after
// every test, whereas `mock.module` is process-wide and would leak into every
// other suite `bun test` runs in this process (see lib/billing/checkout.test.ts
// for the cost of that).
//
//   - `resolveIdentity`        -> a fixed principal (cookie or bearer PAT)
//   - `beginIdempotentRequest` -> a fresh token, no database row
//   - `recordIdempotencyResult` / `discardIdempotencyResult` -> no-ops
//
// `requireCapability` and `assertWorkspaceContext` stay REAL: they are the
// gates under test.

void mock.module('server-only', () => ({}));

const principalModule = await import('@lib/api/principal');
const idempotencyModule = await import('@lib/api/idempotency');
const checkoutModule = await import('@lib/billing/checkout');
const { POST } = await import('./route');

const OWN_WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

interface ErrorBody {
  error: { code: string, message: string, details?: { reason?: string, required_capability?: string } }
}

// A caller-client double answering only the owner RPC. Any other access
// throws, so a test that got further than the owner gate fails loudly.
function dbWithOwnership(isOwner: boolean): Principal['db'] {
  return {
    rpc: async (fn: string) => {
      if (fn === 'bunkai_is_workspace_owner') {
        return { data: isOwner, error: null };
      }
      throw new Error(`unexpected rpc call: ${fn}`);
    },
    from: () => { throw new Error('unexpected table access through the caller client'); },
  } as unknown as Principal['db'];
}

function bearer(args: { scopes: string[], workspaceId: string | null, isOwner: boolean }): Principal {
  return {
    userId: USER_ID,
    workspaceId: args.workspaceId,
    capabilities: args.scopes,
    via: 'bearer',
    tokenId: 'tok_test',
    db: dbWithOwnership(args.isOwner),
  };
}

function checkoutRequest(workspaceId: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/workspaces/${workspaceId}/billing/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer bk_pat_test',
      'idempotency-key': 'route-test-key-000000000001',
    },
    body: JSON.stringify({ seat_quantity: 1 }),
  });
}

let spies: Mock<(...args: never[]) => unknown>[] = [];
let beginIdempotentSpy: Mock<(...args: never[]) => unknown>;

function asPrincipal(principal: Principal): void {
  spies.push(spyOn(principalModule, 'resolveIdentity').mockImplementation(async () => principal) as never);
}

beforeEach(() => {
  spies = [];
  beginIdempotentSpy = spyOn(idempotencyModule, 'beginIdempotentRequest').mockImplementation(async () => ({
    isReplay: false as const,
    token: { key: 'route-test-key-000000000001', userId: USER_ID, endpoint: 'POST /api/v1/workspaces/:id/billing/checkout', rowId: 'row' },
  })) as never;
  spies.push(beginIdempotentSpy);
  spies.push(spyOn(idempotencyModule, 'recordIdempotencyResult').mockImplementation(async () => {}) as never);
  spies.push(spyOn(idempotencyModule, 'discardIdempotencyResult').mockImplementation(async () => {}) as never);
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

// ---------------------------------------------------------------------------
// BK-828 — PAT access. AI Tech Lead decision (Jira BK-828): the route keeps
// `workspace:admin` + the workspace-context match (ADR-0006). An owner's PAT
// works when it was minted for THIS workspace with `workspace:admin`; the
// default headless-sign-in token (ADR-0005, no `workspace:admin`) is rejected
// with a machine-readable `missing_capability`, distinct from the owner gate.
// ---------------------------------------------------------------------------

describe('POST billing/checkout — PAT access (BK-828)', () => {
  test('an owner PAT scoped to this workspace with workspace:admin reaches checkout and gets the URL', async () => {
    asPrincipal(bearer({ scopes: ['atc:read', 'workspace:admin'], workspaceId: OWN_WORKSPACE, isOwner: true }));
    const beginSpy = spyOn(checkoutModule, 'beginBillingCheckout').mockImplementation(async () => ({ url: 'https://checkout.stripe.test/bk828' }));
    spies.push(beginSpy as never);

    const response = await POST(checkoutRequest(OWN_WORKSPACE));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.test/bk828' });
    expect(beginSpy).toHaveBeenCalledTimes(1);
  });

  test('a default headless-sign-in PAT (no workspace:admin) is rejected with details.reason `missing_capability`', async () => {
    asPrincipal(bearer({ scopes: ['atc:read', 'atc:write', 'run:execute'], workspaceId: null, isOwner: true }));

    const response = await POST(checkoutRequest(OWN_WORKSPACE));

    expect(response.status).toBe(403);
    const body = await response.json() as ErrorBody;
    expect(body.error.code).toBe('forbidden');
    expect(body.error.details).toEqual({ reason: 'missing_capability', required_capability: 'workspace:admin' });
    expect(beginIdempotentSpy).not.toHaveBeenCalled();
  });

  test('a workspace:admin PAT scoped to a DIFFERENT workspace is rejected before any idempotency or owner work', async () => {
    asPrincipal(bearer({ scopes: ['workspace:admin'], workspaceId: OTHER_WORKSPACE, isOwner: true }));

    const response = await POST(checkoutRequest(OWN_WORKSPACE));

    expect(response.status).toBe(403);
    const body = await response.json() as ErrorBody;
    expect(body.error.message).toBe('This token is scoped to a different workspace.');
    expect(beginIdempotentSpy).not.toHaveBeenCalled();
  });

  test('a workspace:admin PAT held by a NON-owner (admin role) gets the owner-only rejection, not a capability error', async () => {
    asPrincipal(bearer({ scopes: ['workspace:admin'], workspaceId: OWN_WORKSPACE, isOwner: false }));

    const response = await POST(checkoutRequest(OWN_WORKSPACE));

    expect(response.status).toBe(403);
    const body = await response.json() as ErrorBody;
    expect(body.error.code).toBe('forbidden');
    expect(body.error.details?.reason).toBe('not_workspace_owner');
  });
});
