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
//   3. A placeholder `why` naming a successor Story needs to be enumerable so
//      that Story can find its worklist. BK-497 left 46 such handlers; BK-498
//      resolved its 22 (authoring domain) and BK-499 the last 24, so ZERO
//      remain. The `it('carries no unresolved posture placeholder')` assertion
//      below is what keeps that true.
//
// SCOPE: all of `app/`, widened from `app/api` by BK-499. BK-497 recorded the
// widening as a real improvement it was deferring, because two route handlers
// live outside `app/api` — `app/auth/callback/route.ts` and
// `app/auth/oauth/[provider]/route.ts`, bare `export async function GET`
// browser-redirect flows that never touch the gateway. They are enumerated in
// `KNOWN_GATEWAY_BYPASSERS` below rather than wrapped: both run BEFORE any
// principal exists (they are how a session is obtained), so a posture would be
// `public` and buy nothing, while `withApiHandler` passes only `request` and
// the OAuth route reads `provider` from a second `ctx.params` argument — a
// rewrite of a CSRF-state-validating path for no security gain. Enumerating
// them is what the scan is for: a THIRD ungated handler anywhere under `app/`
// is now a failing test instead of an invisible addition.
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
const APP_ROOT = join(REPO_ROOT, 'app');
const SNAPSHOT_PATH = join(import.meta.dir, 'route-capability-coverage.snapshot.json');

// Handlers under `app/` that deliberately never reach the gateway. Named here
// as well as in the snapshot: the snapshot proves the set did not change, and
// this constant says WHY each one is allowed to be in it. A coverage check
// that quietly skipped ungated handlers would claim a completeness it does not
// have — the same fail-open shape the posture union closes.
const KNOWN_GATEWAY_BYPASSERS: Record<string, string> = {
  'app/api/openapi/route.ts::GET': 'Serves the static public/openapi.json. `force-static` prerender '
    + 'invokes GET with a stub NextRequest, and the wrapper\'s access of request.url/headers/method '
    + 'trips a #state private-field error during build. The spec is public and cached.',
  'app/api/v1/route.ts::OPTIONS': 'Static 204 CORS preflight for the /api/v1 discovery route. '
    + 'No principal, no body, no data access.',
  'app/auth/callback/route.ts::GET': 'Magic-link and OAuth callback (BK-400 / ADR-0008). Runs BEFORE '
    + 'a principal exists — it is how a session is obtained — so it resolves no identity and could '
    + 'only ever declare `public`. Redirect-only; every branch ends in a NextResponse.redirect to '
    + '/login or an internal path. Its own security gate is the `bkstate` CSRF check, not a capability.',
  'app/auth/oauth/[provider]/route.ts::GET': 'OAuth initiation (BK-3 / ADR-0008). Same pre-principal '
    + 'position as the callback above. Reads `provider` from Next\'s second `ctx.params` argument, '
    + 'which `withApiHandler` does not pass, so routing it through the gateway would mean re-parsing '
    + 'the pathname on a CSRF-state-issuing path for no authorization gain.',
};

function loadSnapshot(): RouteHandlerPosture[] {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as RouteHandlerPosture[];
}

function key(row: RouteHandlerPosture): string {
  return `${row.file}::${row.method}`;
}

describe('BK-497 — every API route handler declares a capability posture', () => {
  const actual = scanRoutePostures(APP_ROOT, REPO_ROOT);

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

  // BK-498 — the verb invariant for the authoring domain.
  //
  // The snapshot above is regenerated FROM the source it checks, so on its own
  // it is a change-detector, not a correctness check: flipping a PATCH to
  // `atc:read` and regenerating would be recorded, not rejected. This test is
  // the correctness half. It encodes the ratified mapping directly, so all 22
  // authoring handlers are held to it — not just the two that the DB-integration
  // suite (`capability-enforcement.test.ts`) can afford to execute for real.
  it('holds every authoring-domain handler to the ratified verb mapping', () => {
    const AUTHORING = [
      'app/api/v1/acceptance-criteria/[id]/route.ts',
      'app/api/v1/environments/[id]/route.ts',
      'app/api/v1/imports/route.ts',
      'app/api/v1/imports/[id]/route.ts',
      'app/api/v1/milestones/[id]/route.ts',
      'app/api/v1/modules/[id]/route.ts',
      'app/api/v1/modules/[id]/user-stories/route.ts',
      'app/api/v1/projects/[id]/environments/route.ts',
      'app/api/v1/projects/[id]/milestones/route.ts',
      'app/api/v1/projects/[id]/modules/route.ts',
      'app/api/v1/user-stories/[id]/route.ts',
      'app/api/v1/user-stories/[id]/acceptance-criteria/route.ts',
    ];

    const rows = actual.filter(r => AUTHORING.includes(r.file));
    // Guard the guard: a rename that silently emptied this set would otherwise
    // make every assertion below vacuously true.
    expect(rows).toHaveLength(22);

    for (const row of rows) {
      const expected = row.method === 'GET' ? 'required:atc:read' : 'required:atc:write';
      expect(`${row.file}::${row.method} -> ${row.posture}`)
        .toBe(`${row.file}::${row.method} -> ${expected}`);
    }
  });

  // BK-499 — the ratified mapping for the read, identity and notification
  // handlers, the last 24 the placeholder sweep left behind.
  //
  // Same reason the BK-498 invariant above exists: the snapshot is regenerated
  // from the source it checks, so it records a posture change rather than
  // rejecting a wrong one. Unlike BK-498's, this mapping is NOT derivable from
  // the verb — `POST /workspaces` and `POST /workspaces/{id}/projects` are both
  // POSTs with deliberately different postures, and the split between
  // `atc:read` and no-capability runs along "workspace-shared data" vs "the
  // caller's own data", not along read-vs-write. So the table is explicit, and
  // each row is the ruling written down where a future change has to walk past
  // it.
  it('holds every read, identity and notification handler to the ratified posture map', () => {
    const SESSION_ONLY_ACTIVE_WORKSPACE
      = 'Personal access tokens have no switchable active workspace. '
        + 'Pass workspace_id explicitly on each request instead.';
    const SESSION_ONLY_MEMBERSHIP
      = 'Personal access tokens cannot leave a workspace. Use a browser session.';

    // posture, and for the no-capability postures the EXACT `why` — the 403
    // message is a contract QA writes negative cases against, and on the two
    // session-only routes it is the only thing distinguishing "any PAT is
    // refused" from "this PAT lacked a scope".
    const RATIFIED: Record<string, { posture: string, why?: string }> = {
      // Workspace-shared reads.
      'app/api/v1/activity/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/bugs/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/bugs/[id]/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/bugs/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/bugs/heatmap/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/coverage/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/metrics/recovery-cycles/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/runs/report/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/projects/[id]/traceability/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/runs/[id]/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/tests/[id]/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/tests/[id]/runs/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/workspaces/route.ts::GET': { posture: 'required:atc:read' },
      'app/api/v1/workspaces/[id]/route.ts::GET': { posture: 'required:atc:read' },
      // Content creation inside an existing workspace.
      'app/api/v1/workspaces/[id]/projects/route.ts::POST': { posture: 'required:atc:write' },
      // Session-only: every Bearer PAT refused, regardless of scope.
      'app/api/v1/me/active-workspace/route.ts::POST': {
        posture: 'cookie-only',
        why: SESSION_ONLY_ACTIVE_WORKSPACE,
      },
      'app/api/v1/workspaces/[id]/membership/route.ts::DELETE': {
        posture: 'cookie-only',
        why: SESSION_ONLY_MEMBERSHIP,
      },
      // The caller's own account state — no capability, by ruling Q1/Q7.
      'app/api/v1/me/route.ts::GET': { posture: 'authenticated' },
      'app/api/v1/notification-preferences/route.ts::GET': { posture: 'authenticated' },
      'app/api/v1/notification-preferences/route.ts::PATCH': { posture: 'authenticated' },
      'app/api/v1/notifications/[id]/read/route.ts::POST': { posture: 'authenticated' },
      'app/api/v1/workspaces/[id]/notifications/route.ts::GET': { posture: 'authenticated' },
      'app/api/v1/workspaces/[id]/notifications/read-all/route.ts::POST': { posture: 'authenticated' },
      // The sole bootstrap exception.
      'app/api/v1/workspaces/route.ts::POST': { posture: 'authenticated' },
    };

    // Guard the guard, same as BK-498's: a rename that emptied the set would
    // make every assertion below vacuously true.
    expect(Object.keys(RATIFIED)).toHaveLength(24);

    const byKey = new Map(actual.map(row => [key(row), row]));
    for (const [handler, expected] of Object.entries(RATIFIED)) {
      const row = byKey.get(handler);
      // Compared as one string so a failure names the handler rather than
      // reporting an anonymous `undefined !== 'required:atc:read'`.
      expect(`${handler} -> ${row?.posture ?? '<handler not found>'}`)
        .toBe(`${handler} -> ${expected.posture}`);
      if (expected.why !== undefined) {
        expect(`${handler} why -> ${row?.why ?? ''}`)
          .toBe(`${handler} why -> ${expected.why}`);
      }
    }
  });

  // The placeholder sweep is finished, and this is what keeps it finished. A
  // `why` that defers the real posture to some later Story is how BK-497 parked
  // 46 handlers on a gate that performs zero capability checks; reintroducing
  // one silently would rebuild that backlog without anyone deciding to.
  it('carries no unresolved posture placeholder', () => {
    const deferred = actual
      .filter(r => /\bBK-\d+ pending\b/.test(r.why ?? ''))
      .map(r => `${key(r)}: ${r.why}`);
    expect(deferred).toEqual([]);
  });
});
