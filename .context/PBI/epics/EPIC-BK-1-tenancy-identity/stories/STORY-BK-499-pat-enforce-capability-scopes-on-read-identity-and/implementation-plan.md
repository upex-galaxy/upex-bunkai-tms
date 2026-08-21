# BK-499 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

## Goal

Resolve the last 24 placeholder capability postures BK-497 left behind (`why: 'BK-499 pending — ...'`), so every handler under `app/api/v1` carries a real, justified posture. Third and final slice of the BK-262 split; BK-497 (machinery) and BK-498 (authoring domain) are merged.

Application layer only. No migration, no UI, no new scope value — the four-value `scopes` CHECK in `0008*access*tokens.sql` is untouched and no minted token is invalidated.

## Authoritative scope

The 2026-08-21 AI Product Owner & AI Tech Lead ruling on this Story supersedes the original DoD bullets and `scope.md`'s "28 handlers (27 receive a capability posture)". The implementation checklist is the grep-verified set:

```
grep -rn "BK-499 pending" app/api/v1
```

24 handlers across 22 files. The ruling says 21 files; the grep returns 22 because `workspaces/route.ts` and `notification-preferences/route.ts` each carry two handlers. Handler count (24) matches exactly and is the load-bearing number.

## Posture map (24 handlers)

### `auth: 'required', requires: ['atc:read']` — 14 handlers

Workspace-shared data any member can read. Q5 of the ruling confirms the two `workspaces` reads take the same treatment as every other read, with no special case.

| Handler | Method |
| --- | --- |
| `app/api/v1/activity/route.ts` | GET |
| `app/api/v1/bugs/route.ts` | GET |
| `app/api/v1/bugs/[id]/route.ts` | GET |
| `app/api/v1/projects/[id]/bugs/route.ts` | GET |
| `app/api/v1/projects/[id]/bugs/heatmap/route.ts` | GET |
| `app/api/v1/projects/[id]/coverage/route.ts` | GET |
| `app/api/v1/projects/[id]/metrics/recovery-cycles/route.ts` | GET |
| `app/api/v1/projects/[id]/runs/report/route.ts` | GET |
| `app/api/v1/projects/[id]/traceability/route.ts` | GET |
| `app/api/v1/runs/[id]/route.ts` | GET |
| `app/api/v1/tests/[id]/route.ts` | GET |
| `app/api/v1/tests/[id]/runs/route.ts` | GET |
| `app/api/v1/workspaces/route.ts` | GET |
| `app/api/v1/workspaces/[id]/route.ts` | GET |

### `auth: 'required', requires: ['atc:write']` — 1 handler

| Handler | Method |
| --- | --- |
| `app/api/v1/workspaces/[id]/projects/route.ts` | POST |

Ruling Q2: routine content creation inside an existing workspace, same shape as `POST /bugs`. Reuse `atc:write`; do not mint a new scope. Ruling Q6: the gateway evaluates the capability before the handler body, so a PAT without `atc:write` never reaches the RLS-gated INSERT; a PAT that holds it but whose caller is not a member still fails afterwards on the existing 42501 path.

### `auth: 'cookie-only'` — 2 handlers

| Handler | Method |
| --- | --- |
| `app/api/v1/me/active-workspace/route.ts` | POST |
| `app/api/v1/workspaces/[id]/membership/route.ts` | DELETE |

Ruling Q3: these are session-only, not capability-free — every Bearer PAT is rejected outright regardless of scope. Both already enforce that in the handler body via a local `assertSessionOnly`. `cookie-only` is the posture BK-497 minted for exactly this case, so the guard moves to the gateway following the precedent BK-497 itself set on `POST /tokens` and `DELETE /tokens/{id}` (commit `cc6a123`): lift the body check into the posture and carry the existing 403 message VERBATIM in `why`, so the observable behaviour is unchanged. The now-dead `assertSessionOnly` helper and its unit tests are removed with the call; the gateway path they duplicated is already covered by `app/api/v1/tokens/cookie-only-posture.test.ts` and gains BK-499 coverage below.

### `auth: 'authenticated'` with a real justification — 7 handlers

| Handler | Method | Justification shape |
| --- | --- | --- |
| `app/api/v1/me/route.ts` | GET | identity probe — a token must be able to identify itself |
| `app/api/v1/notification-preferences/route.ts` | GET | caller's own preferences |
| `app/api/v1/notification-preferences/route.ts` | PATCH | caller's own preferences |
| `app/api/v1/notifications/[id]/read/route.ts` | POST | caller's own notification copy |
| `app/api/v1/workspaces/[id]/notifications/route.ts` | GET | caller's own notification copies |
| `app/api/v1/workspaces/[id]/notifications/read-all/route.ts` | POST | caller's own notification copies |
| `app/api/v1/workspaces/route.ts` | POST | sole bootstrap exception |

Ruling Q1 draws the category boundary at "the caller's OWN data" versus "workspace-shared data", not at read versus write — which is why `GET /activity` (whole-workspace feed) takes `atc:read` while `GET /workspaces/{id}/notifications` (the caller's own copies) does not. Ruling Q7 confirms the category applies uniformly to its 3 reads AND its 4 writes. `POST /workspaces` is the one genuine capability-free posture: any PAT with at least one scope passes, because it is the only action a brand-new token can take before any workspace context exists.

## Additional deliverables

1. ***Doc-comment correction*** (ruling Q1, explicit action for Dev): remove the misleading "mirrors `GET /api/v1/activity`" line from `app/api/v1/workspaces/[id]/notifications/route.ts:9-16`. The analogy is stale documentation, not a statement of intended posture.
2. ***Five superseded in-code comments*** (`scope.md`): `app/api/v1/bugs/route.ts:213`, `app/api/v1/activity/route.ts:13`, `app/api/v1/tests/[id]/runs/route.ts:11`, `app/api/v1/projects/[id]/coverage/route.ts:10`, `app/api/v1/projects/[id]/runs/report/route.ts:14` each assert "no scope requirement". This Story's enforcement decision supersedes them; left alone they become false documentation next to a contradicting posture.
3. ***Fixture widening*** (DoD): the PAT at `app/api/v1/projects/[id]/traceability/route.test.ts:132` moves from `['atc:write']` to `['atc:read','atc:write']` — it drives the traceability GET, which is now `atc:read`-gated.
4. ***Coverage scan widened to all of ***`app/`: `lib/api/route-capability-coverage.test.ts` currently walks `app/api` only and records, in its own header, that widening the walk to `app/` "is a real improvement and is recorded for BK-499". The two handlers outside `app/api` — `app/auth/callback/route.ts` and `app/auth/oauth/[provider]/route.ts` — are passed to this Story by the 2026-08-18 split ruling.

## Technical Decisions

***TD-1 — How the two ****`app/auth`**** handlers get covered.*** Both are bare `export async function GET` browser redirect flows that never touch the gateway: the magic-link/OAuth callback and the OAuth initiation. Three candidates:

| Option | Product value | Precedent fit | Cost | Reversibility | Risk |
| --- | --- | --- | --- | --- | --- |
| A. Wrap both in `withApiHandler` with `auth: 'public'` | low — both are necessarily pre-authentication | poor — `withApiHandler` passes only `request`, and the OAuth route reads `provider` from a second `ctx.params` argument, so it would have to be rewritten to parse the pathname | medium | easy | ***high*** — a parsing rewrite on a CSRF-state-validating auth path, for zero security gain |
| B. Widen the scan to `app/` and enumerate both in `KNOWN*GATEWAY*BYPASSERS` with a justification | high — closes the actual fail-open (a THIRD ungated handler anywhere under `app/` becomes a failing test) | exact — `KNOWN*GATEWAY*BYPASSERS` exists for precisely this, and already holds the two legitimate `app/api` bypassers | low | easy | low |
| C. Leave the scan at `app/api` | none | n/a — contradicts the split ruling | zero | n/a | leaves the gap the ruling assigned here |

***Chosen******:****** B.*** It delivers the enumerable-coverage value the widening was recorded for, with none of Option A's rewrite risk on an auth path. `scanRoutePostures(apiRoot, repoRoot)` already takes the root as a parameter, so the widening is a one-line change plus two justification entries.

***TD-2 — Where the BK-499 correctness check lives.*** The snapshot is regenerated FROM the source it checks, so on its own it records a posture change rather than rejecting a wrong one. BK-498 solved this with a hard-coded verb-mapping invariant next to the snapshot assertion. BK-499 follows it: a table of all 24 handlers with their ratified posture, asserted per handler, plus a length guard so a rename cannot empty the set into a vacuous pass. The BK-499 mapping is not derivable from the verb (`POST /workspaces` and `POST /workspaces/{id}/projects` are both POSTs with different postures), so the table is explicit.

***TD-3 — Real-path proof, not a fixture-seeded one.*** `lib/api/capability-enforcement.test.ts` gains a BK-499 block that drives the REAL exported handlers with REAL minted PATs against the live database:

- AC-02 positive: `GET /api/v1/projects/{id}/bugs` with an `atc:read` PAT returns 200 and a body shaped like the handler's own contract.
- AC-03 negative: the same route with a `run:execute`-only PAT returns 403 AND the error names the missing capability, so a merely-broken route cannot pass for the right-looking reason.
- Write path: `POST /api/v1/workspaces/{id}/projects` with an `atc:write` PAT returns 201 and the row is read back through an independent service-role client; with an `atc:read`-only PAT it returns 403 AND the project count is unchanged. The negative and positive are paired deliberately — a 403 alone is also what a broken route produces, and an unmoved row count is also explained by a write that never worked for anyone.

Tokens are minted with a short expiry and every teardown delete throws, matching the credential-hygiene correction BK-498's review already applied to this file.

***RPC authorization gate******:****** not applicable.*** This Story writes and changes no Postgres function, so `references/rpc-authorization.md` §4 has nothing to answer. Verified by grep: the diff touches no `supabase/migrations/` file.

## Steps

1. Flip the 14 read handlers to `required: ['atc:read']`, each with the shared-data justification in its surrounding comment.
2. Flip `POST /workspaces/{id}/projects` to `required: ['atc:write']`.
3. Lift the two session-only guards into `cookie-only` postures, message verbatim; delete the dead helpers and their unit tests.
4. Give the 7 remaining `authenticated` handlers real `why` strings naming the actual reason (own-data or bootstrap), replacing the placeholders.
5. Correct the stale doc comment and the five superseded "no scope requirement" comments.
6. Widen the fixture PAT in the traceability route test.
7. Widen the coverage scan to `app/`; add the two auth routes to `KNOWN*GATEWAY*BYPASSERS`; update the file header (0 placeholders remain).
8. Add the BK-499 posture-mapping invariant test.
9. Add the BK-499 DB-integration block to `capability-enforcement.test.ts`.
10. Regenerate the snapshot with `UPDATE*ROUTE*POSTURE_SNAPSHOT=1` and READ the diff — an unreviewed regeneration turns the gate back into the fail-open it replaced.
11. Verify in order: tests, types, lint.

## Traceability — AC to step

| AC | Step |
| --- | --- |
| Any authenticated token can bootstrap a new workspace | Step 4 (`POST /workspaces` keeps a genuine capability-free posture), asserted in Step 8 |
| A properly read-scoped token succeeds reading a non-ATC resource (`GET /projects/{id}/bugs`) | Step 1, proven against the live database in Step 9 |
| A token missing the read scope is rejected reading a non-ATC resource | Step 1, proven against the live database in Step 9 |

## Risks

- ***R1 — a wrong posture on one route.*** The risk here is not architectural novelty, it is 24 mechanical edits where one could be misclassified. Mitigated by Step 8's explicit per-handler table, which is authored from the ruling rather than regenerated from the source.
- ***R2 — an existing test drives a now-gated route with a too-narrow PAT.*** The traceability fixture is the one the DoD names; the full test run in Step 11 is what proves there is no second one.
- ***R3 — snapshot regeneration hiding a mistake.*** Mitigated by reading the regenerated diff and by Step 8 asserting the mapping independently of the snapshot.

## Review Workload Forecast

Estimated: ~420 additions + ~150 deletions = ~570 total lines
400-line budget risk: High
Chain strategy: size-exception
Decision trace: Q1 "Can the work be split so each PR is independently mergeable and independently valuable?" -> NO. The change is a single ratified posture sweep; the coverage snapshot and the `route-capability-coverage.test.ts` invariant are regenerated from the whole set, so any split leaves the snapshot in the first PR disagreeing with the source in the second and both branches red until they land together. Q2 "Does the diff cross more than one architectural seam?" -> NO. One seam: the `withApiHandler` options object of 24 handlers, plus the two test files that check them. No schema, no UI, no new module. Q3 "Is the line count driven by novel logic or by mechanical repetition?" -> MECHANICAL. 22 route files receive a 2-to-4-line options-object edit each; the only authored logic is one invariant test and one DB-integration block. Resolved leaf: size-exception — a wide mechanical diff over one seam, reviewed as one unit, with the per-handler posture table making it readable in a single pass. This also honours the 2026-08-18 standing instruction on this cluster: do not re-defer a slice on diff size alone.
Decided by: /git-flow-master §Chained-PR decision tree
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
