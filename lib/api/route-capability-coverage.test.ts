import type { RouteHandlerPosture } from '@lib/api/route-posture-scan';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BYPASS_POSTURE, INDIRECT_EXPORT_POSTURE, scanRoutePostures } from '@lib/api/route-posture-scan';
import { describe, expect, it } from 'bun:test';

// BK-497 — the DETECT half of the capability-posture contract.
//
// The PREVENT half is the `WithApiHandlerOptions` union in `lib/api/handler.ts`:
// `auth` is mandatory and has no default, so a handler routed through the
// gateway cannot compile without declaring a posture. That closes the case this
// Story exists for.
//
// It does not close every case, and this file is the reason the pair is needed:
//
//   1. A handler can skip `withApiHandler` entirely (`export function GET`).
//      The union never sees it, so the compiler has nothing to object to. Two
//      such handlers exist today and are legitimate; a THIRD would be invisible
//      without this test.
//   2. A posture can be silently downgraded — `required` traded for
//      `authenticated` — which compiles fine and removes a real gate.
//   3. The 46 handlers currently carrying a BK-498 / BK-499 placeholder `why`
//      need to be enumerable so the two successor Stories can find them.
//
// SCOPE: `app/api` only, which is what BK-497 ratified. Route handlers exist
// elsewhere under `app/` — `app/auth/callback/route.ts` and
// `app/auth/oauth/[provider]/route.ts` are bare `export async function GET`
// OAuth callbacks that never touch the gateway. They are NOT covered here and
// are NOT counted among the two bypassers below. Widening the walk to all of
// `app/` is a real improvement and is recorded for BK-499 rather than taken
// now, since it would pull handlers outside this Story's stated scope.
//
// The snapshot is also the single file a reviewer reads to see every handler and
// its posture at once, which is the one genuine advantage the rejected
// "centralized route to capability map" design had.
//
// This suite is a pure filesystem scan with no imports of the route modules, so
// unlike `rls-parity` / `auth-coexistence` / `workspace-context` it is NOT
// credential-gated and always runs.
//
// To regenerate after a deliberate posture change:
//   UPDATE_ROUTE_POSTURE_SNAPSHOT=1 bun test lib/api/route-capability-coverage.test.ts
// Then READ the diff — a regenerated snapshot is a record of a decision, and an
// unreviewed regeneration turns this gate back into the fail-open it replaced.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const API_ROOT = join(REPO_ROOT, 'app', 'api');
const SNAPSHOT_PATH = join(import.meta.dir, 'route-capability-coverage.snapshot.json');

// Handlers under `app/api` that deliberately never reach the gateway. Named
// here as well as in the snapshot: the snapshot proves the set did not change,
// and this constant says WHY each one is allowed to be in it. A coverage check
// that quietly skipped ungated handlers would claim a completeness it does not
// have — the same fail-open shape the posture union closes.
const KNOWN_GATEWAY_BYPASSERS: Record<string, string> = {
  'app/api/openapi/route.ts::GET': 'Serves the static public/openapi.json. `force-static` prerender '
    + 'invokes GET with a stub NextRequest, and the wrapper\'s access of request.url/headers/method '
    + 'trips a #state private-field error during build. The spec is public and cached.',
  'app/api/v1/route.ts::OPTIONS': 'Static 204 CORS preflight for the /api/v1 discovery route. '
    + 'No principal, no body, no data access.',
};

function loadSnapshot(): RouteHandlerPosture[] {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as RouteHandlerPosture[];
}

function key(row: RouteHandlerPosture): string {
  return `${row.file}::${row.method}`;
}

describe('BK-497 — every API route handler declares a capability posture', () => {
  const actual = scanRoutePostures(API_ROOT, REPO_ROOT);

  if (process.env.UPDATE_ROUTE_POSTURE_SNAPSHOT === '1') {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`);
  }

  it('matches the committed posture snapshot', () => {
    // Exact equality. A new route, a removed route, or a changed posture all
    // land here, and the diff names the handler.
    expect(actual).toEqual(loadSnapshot());
  });

  it('enumerates every gateway bypasser explicitly', () => {
    const bypassers = actual.filter(r => r.posture === BYPASS_POSTURE).map(key).sort();
    // Not `toContain`: the assertion is that the set is EXACTLY the known two.
    // A new bare `export function GET` is invisible to the type union, so this
    // is the only thing standing between it and an unreviewed ungated route.
    expect(bypassers).toEqual(Object.keys(KNOWN_GATEWAY_BYPASSERS).sort());
  });

  it('leaves no handler without a posture', () => {
    const undeclared = actual.filter(r => !r.posture);
    expect(undeclared).toEqual([]);
  });

  it('resolves no handler through an indirect export', () => {
    // `export { impl as GET }` is invisible to BOTH halves of the contract: the
    // type union never sees a call site, and the scan cannot follow the binding
    // to find one. It is reported rather than resolved, so it lands here.
    const indirect = actual.filter(r => r.posture === INDIRECT_EXPORT_POSTURE);
    expect(indirect).toEqual([]);
  });

  it('records a per-handler justification for every no-capability posture', () => {
    // `authenticated` and `cookie-only` both carry a mandatory `why` in the
    // type. Asserted per handler off the parsed options object — a file-level
    // substring check would pass on a multi-handler file where only one sibling
    // carries a justification.
    const noCapability = actual.filter(
      r => r.posture === 'authenticated' || r.posture === 'cookie-only',
    );
    expect(noCapability.length).toBeGreaterThan(0);
    for (const row of noCapability) {
      expect(row.why ?? '').not.toBe('');
    }
  });

  it('declares at least one capability wherever the posture is `required`', () => {
    const required = actual.filter(r => r.posture.startsWith('required:'));
    for (const row of required) {
      const caps = row.posture.slice('required:'.length).split(',').filter(Boolean);
      // `NonEmpty<Capability>` makes this a compile error, so this asserts the
      // scanner agrees with the compiler rather than re-proving the type.
      expect(caps.length).toBeGreaterThan(0);
    }
  });
});
