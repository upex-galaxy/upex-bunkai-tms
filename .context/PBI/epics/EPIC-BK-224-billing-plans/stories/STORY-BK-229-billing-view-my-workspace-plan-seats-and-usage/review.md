# BK-229 — Stage 3 Code Review

Independent adversarial review dispatched against `feat/BK-229-billing-overview` vs `origin/staging` (PR #176). Reviewer had no prior context beyond the diff and a description of the ticket's intent.

## Adjudication summary

| Severity | Count | Disposition |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 1 | Fixed |
| MINOR | 3 | Fixed |
| NIT | 2 | Fixed |

All 6 findings were verified against the actual diff (file:line quoted by the reviewer) before being applied — none were auto-accepted, and none were dismissed.

## Findings and adjudication

1. **MAJOR — `app/api/v1/workspaces/[id]/billing/route.ts:62`**: the route omitted `requires: ['atc:read']`, unlike every sibling `workspaces/[id]/*` GET route (`open-bugs`, `coverage`, `active-runs`, `recent-projects`), all of which gate Bearer PATs behind that scope as the documented workspace-inventory floor. **Legitimate — the ticket's own binding contract (Jira comment `12414`) says the route follows "the `coverage` sibling", and the coverage sibling has this scope.** Fixed: added `requires: ['atc:read']`; cookie sessions are unaffected (they already hold the full capability set, verified in `lib/api/principal.ts`). Also added the `403` OpenAPI response documenting it, matching the sibling contract.

2. **MINOR — `components/billing/BillingOverviewView.tsx` fetch lifecycle**: no guard against a superseded/aborted request's `catch` block overwriting a newer request's state, unlike the precedent in `components/activity/ActivityView.tsx`. **Legitimate race-condition class, real precedent exists in this codebase.** Fixed: added `if (controller.signal.aborted) { return; }` before every `setState` call in the success and catch paths.

3. **MINOR — unchecked `Json` → typed-interface cast**, both `route.ts` and `BillingOverviewView.tsx`. **Legitimate on the server side** (Supabase's `data: Json` return has no static shape guarantee). Adjudicated the reviewer's suggested fix (importing the zod schema from `route.openapi.ts`) as introducing an untested new coupling — no other `route.ts` in this codebase imports its sibling `route.openapi.ts` (that file calls `registry.registerPath` at module scope, and no runtime route currently pulls that in). Applied a narrower, precedent-free fix instead: a local structural type guard (`isBillingOverviewShape`) that validates the four fields before the route casts. The client-side cast is lower risk (same-origin JSON from a route whose shape is now server-validated) and was left as-is — a disclosed, deliberate partial fix, not an oversight.

4. **MINOR — `lib/billing/billing-overview-isolation.test.ts` `afterAll` swallowed delete errors.** Legitimate on a suite that runs against shared live infra. Fixed: each cleanup step now captures and `console.error`s its own failure (not `throw` — the suite's assertions have already run and passed/failed by that point, and throwing in `afterAll` would fail the whole run over a cleanup hiccup on shared infra, which is worse than a loud, visible warning).

5. **NIT — `components/ui/meter.tsx:37`**: `aria-valuenow` was not clamped to `aria-valuemax` for an over-limit meter (e.g. "11 of 10 seats"), which is invalid per the ARIA `meter` role spec. Fixed: `aria-valuenow={Math.min(used, limit)}`; the visible `countLabel` still shows the true, unclamped count.

6. **NIT — `lib/billing/plan-tiers.ts`**: `meterState`'s `limit <= 0` branch returns `'limit-reached'` when used, but `meterFillPercent`'s matching branch returned `0` (empty bar) for the same input — a latent inconsistency, currently unreachable (no `PLAN_TIERS` entry sets a limit to `0`) but a real landmine for a future tier. Fixed: `meterFillPercent` now returns `100` for `limit <= 0 && used > 0`, agreeing with `meterState`. Added two unit tests (`plan-tiers.test.ts`) covering the previously-untested branch on both functions.

## Not raised, checked anyway

The reviewer confirmed (and this review independently re-verified) that both cookie and Bearer-PAT callers resolve a real `auth.uid()` on this route (`impersonatingClient()` in `lib/api/principal.ts` mints a per-request JWT for PAT callers), so `bunkai_is_workspace_admin`'s step-0 gate is load-bearing for both auth modes, and `createAdminClient()` is never called on this path.
