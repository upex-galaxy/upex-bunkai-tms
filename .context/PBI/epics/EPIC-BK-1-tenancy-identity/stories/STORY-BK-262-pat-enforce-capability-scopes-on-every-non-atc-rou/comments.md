# Comments for BK-262

[View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

---

### Ely - 8/11/2026, 6:15:45 PM

## AI Tech Lead — Refinement input: the design questions on this story are already decided (on BK-97)

Posted by the autonomous `bug` delivery routine on 2026-08-11. This story carried ***no comments***, so the
two published rulings it depends on were invisible to whoever picks it up. Nothing here is a new decision —
this is a pointer plus a fresh measurement, so the refinement does not re-derive what is already settled.

### Where the decisions live

Both were decided under CLAUDE.md Critical Rule #18 and published on ***BK-97***, the Improvement this story
supersedes in scope:

| Question | Ruling | Where |
| --- | --- | --- |
| Which capability vocabulary? | ***Keep the existing four scopes**** (`atc:read`, `atc:write`, `run:execute`, `workspace:admin`) and redefine their reach. Zero DB — the CHECK at `0008*access*tokens.sql:33-36` is untouched and no minted token is invalidated. | BK-97 comment `12194` — **AI Product Owner — Decision***:**** PAT capability vocabulary** |
| How is enforcement shaped? | ***Enforce at each ****`withApiHandler`**** call site****, and make the declaration structurally unskippable by tightening `WithApiHandlerOptions` (`lib/api/handler.ts:40-49`) from `requires?: string[]` into a mandatory discriminated union over four auth postures, backed by a filesystem-driven coverage snapshot test. ****No migration.**** Ships as a ****five-slice chain****, not one PR. | BK-97 comment `12195` — **AI Tech Lead — Decision***:**** enforcement shape** |

> ***NOTE:**** The "Open product decision (do this first)" section in BK-97's description is ****stale*** — that question
was closed by ruling `12194`. Read the rulings before re-opening either question.

### Current-state measurement (2026-08-11, read from code, not from comments)

Ruling `12195` measured the surface on 2026-08-06 as 63 route files / 81 handlers / a 48-handler gap.
Re-measured today against `origin/staging`:

| Metric | Count |
| --- | --- |
| Exported handlers using `withApiHandler` | 82 (across 64 route files) |
| Declaring a non-empty `requires: [...]` | 25 |
| Omitting `requires` entirely — ***no capability check at all*** | 49 |
| `auth: 'public'` (no principal resolved) | 8 |
| Bypassing the gateway by design (`app/api/openapi/route.ts`) | 1 |

The gap is ***still open and has grown by one handler*** since the ruling was written. The mechanism, quoted:
`lib/api/handler.ts:75-82` iterates `options.requires ?? []`, so an omitted `requires` performs zero scope
checks. `lib/api/principal.ts:66-73` gives a cookie caller the full `ALL_CAPABILITIES` set while `:49-58`
gives a PAT caller exactly its token scopes — which is why the gap only affects tokens, never sessions.

### One thing the AC should account for

There is ***no regression test*** for an under-scoped PAT on a non-ATC route. The suite currently asserts the
opposite: `app/api/v1/projects/[id]/traceability/route.test.ts:127-134` mints a PAT scoped only
`['atc:write']`, POSTs to the non-ATC route `modules/[id]/user-stories`, and expects ***201***. That test
encodes today's gap as intended behaviour, so it has to be updated as part of this story rather than left
green — otherwise the fix lands and a passing suite still describes the old contract.

### Status note

This story is ***unassigned*** and has been in `Shift-Left QA` since 2026-08-02. The `bug` routine cannot take
it (story-shaped: five slices, 49 capability decisions, a type change touching all 82 call sites — see BK-97
comment `12203`), and it does not author shift-left refinement itself. It needs a QA owner assigned to
finish refinement before `/sprint-development` can pick it up.

---

Posted by the autonomous `bug` delivery routine. This is an AI Tech Lead pointer to existing rulings, not
human sign-off, and not a new decision.

---

### Ely - 8/13/2026, 7:11:48 PM

## Carried over from BK-97 (comment 12195)

BK-97 is being closed as a duplicate of this issue. The content below is the preserved design decision from BK-97, reproduced in full so it is not lost.

---

## AI Tech Lead — Decision: enforcement shape for per-route PAT capabilities (BK-97)

> ***Attribution.**** Produced by the AI Tech Lead profile under CLAUDE.md Critical Rule #18, which grants this profile authority over schema, API-contract, auth-enforcement and migration-shape calls. This is ****not*** a human sign-off. Run independently of the AI Product Owner decision above; the two converged.

### Decision

Enforce capabilities ***at each ****`withApiHandler`**** call site****, exactly as the ATC routes already do, and make the declaration ****structurally unskippable*** by tightening `WithApiHandlerOptions` (`lib/api/handler.ts:40-49`) from `requires?: string[]` into a mandatory discriminated union over four explicit auth postures, backed by a filesystem-driven coverage snapshot test.

***No migration is required****: the existing four-scope vocabulary is reused, so the CHECK at `0008*access*tokens.sql:34-36` is untouched and no already-minted token is invalidated. This is ****story-shaped, not bug-shaped**** — 48 handler entries need a capability decision and the type change touches all 81 call sites, so it ships as a ****five-slice chain***, not one PR.

This ***upholds and does not revisit**** ADR-0006, which already ratified TS-layer enforcement via `requires` + `assertWorkspaceContext` and explicitly names this ticket's scope as its follow-up. Only the **durability* question — how a new route is forced to declare — is decided fresh here.

### Route inventory (measured, not assumed)

The ticket's "~18 route files" is stale. Actual surface: ***63 route files, 81 exported handler entries***.

| Posture | Handlers | Notes |
| --- | --- | --- |
| `auth: 'public'` | 8 | health, `/v1` index, 6 auth endpoints |
| `auth: 'required'` ***with*** a capability | 25 | ATC (10), runs (4), workspace:admin (5), tests/reads (6) |
| `auth: 'required'` ***with no capability**** | ****48*** | the gap |

The 48-handler gap: ***20 reads****, ****21 writes****, ****7 identity/session-plumbing***. Two handlers — `tokens` POST (`app/api/v1/tokens/route.ts:36`) and `tokens/[id]` DELETE (`:21`) — hand-roll `principal.via === 'bearer'` rejection inside the handler body. That is a fourth posture the options type does not currently express.

### Alternatives considered and scored

| Candidate | Correctness / auditability | Precedent (ADR-0001/0006) | Migration risk | Impl cost | Reversibility | Failure mode | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Per-route sweep, `requires` stays optional | 2 | 5 | 5 (none) | 4 | 5 | 1 (***fail-open***) | 22 |
| B. Centralized route to capability map | 4 | 2 | 5 (none) | 3 | 3 | 3 | 20 |
| C. Middleware-level enforcement | 3 | 1 | 5 (none) | 2 | 4 | 2 (***fail-open***) | 17 |
| ***D. Per-route + type-level default-deny + coverage snapshot**** | 5 | 5 | 5 (none) | 3 | 4 | 5 (****fail-closed at compile time****) | ****27*** |

***A rejected.**** It is what the ticket literally asks for and it fixes today's 48 routes, but it is a one-time sweep with nothing holding it. `requires?: string[]` stays optional, so route number 82 ships with no capability and nothing goes red. That is the identical failure that produced this ticket: ADR-0001 shipped its migration correctly and the gap opened anyway ****because the declaration was optional***. Fixing the instances without fixing the optionality is a symptom fix, not a root-cause fix.

***B rejected.*** A map keyed on path strings is a second authorization surface beside `requires` — precisely the "do not run two wrappers" reasoning ADR-0001 used to reject a parallel gateway. It must also re-derive dynamic segments (`[id]`, `[stepId]`) from request URLs Next has already parsed, and a pattern that quietly stops matching after a rename degrades to whatever the default is. Its one real win (a single file to audit) is captured by D's committed snapshot without a runtime lookup that can miss.

***C rejected, hardest.*** Next middleware runs on the Edge runtime; `resolveIdentity` (`lib/api/principal.ts:45-74`) pulls `server-only`, the SSR cookie client, a DB lookup by token prefix, and `crypto.subtle` hashing. Middleware would have to duplicate PAT verification or resolve identity a second time, so the thing that authorized the request and the thing that executes it become two resolutions that can diverge. It also moves enforcement off `withApiHandler`, contradicting ADR-0001's central finding that the universal wrapper already exists and should be extended. Matcher gaps are invisible — same fail-open shape as A.

***D chosen.*** Keeps enforcement where ATC, runs and the ADR-0006 admin slice already put it (no new mechanism, no second surface), and moves the cost of forgetting from "permissive route in production" to "red `types:check` locally" — the same prevent / detect / verify posture ADR-0001 chose for authentication. It scores lowest of the four only on implementation cost, which is honest: the union change touches every call site.

### Rationale

***The "open product decision" the ticket says to do first is already closed by a published contract.**** `app/qa/qa-config.ts:625` documents `atc:read` to QA users as covering "ATCs, steps, assertions, ****modules, user stories, AC****", and `:626` documents `atc:write` as create/update/delete over the same domain. The authoring routes in the gap are exactly that set. Expanding the vocabulary would contradict shipped documentation, force a CHECK migration, and desynchronize four declaration sites that ADR-0006's follow-up asks to ****consolidate***, not multiply. Reuse wins on documentation grounds, not merely cost grounds — and that is what makes the whole ticket zero-DB.

***Two mapping calls fall out of a bootstrap constraint, and the obvious answer is wrong.**** `POST /workspaces` must ****not*** require `workspace:admin`: `assertTokenIssuanceAuthorized` (`lib/api/pat.ts:56-61`) refuses to mint an admin-scoped token without an existing workspace where the caller is already admin, so gating creation on that scope is an unsatisfiable deadlock. The same reasoning routes `POST /workspaces/[id]/projects` to `atc:write`, and `DELETE /workspaces/[id]/membership` to the no-capability posture, since a plain member must be able to leave.

***ADR-0006's ****`requires: ['workspace:admin']`**** + ****`assertWorkspaceContext`**** pairing needs no new call sites.*** The five existing sites are correct, and the four routes that deliberately skip it already carry in-line justification (`active-runs/route.ts:28`, `recent-projects/route.ts:23`, `open-bugs/route.ts:30`, `coverage/route.ts:33`). BK-97 adds no admin-scoped routes, so that invariant is untouched.

### Implementation shape

***1. The type change (****`lib/api/handler.ts:40-49`****) — the durable part******:***

```ts
export type Capability = typeof ALL_CAPABILITIES[number];   // single source of truth
type NonEmpty<T> = readonly [T, ...T[]];

export type WithApiHandlerOptions =
  | { auth: 'public' }
  | { auth: 'cookie-only' }                                  // PAT structurally rejected
  | { auth: 'authenticated', why: string }                   // no capability, must be justified
  | { auth: 'required', requires: NonEmpty<Capability> };
```

Four holes closed. `auth` becomes mandatory, so the `options: WithApiHandlerOptions = {}` default at `:63` disappears and a new route cannot compile without stating its posture — all 81 existing call sites already pass an explicit object (verified), so nothing relies on the default. `NonEmpty` makes `requires: []` a type error, closing the "declare an empty array to satisfy the compiler" escape. `Capability` replaces `string[]`, so a typo like `'atc:writ'` fails to compile, and `AccessTokenScope` (`lib/api/pat.ts:12`) collapses into `ALL_CAPABILITIES` (`lib/api/principal.ts:31`), removing one of the four duplicated vocabularies. `why: string` makes the escape hatch cost a sentence a reviewer reads, and is greppable, so the no-capability set is always enumerable.

`auth: 'cookie-only'` lifts the hand-rolled `via === 'bearer'` checks out of the two token routes into the gateway, where ADR-0001's "a PAT must not mint a PAT" exception belongs.

***2. Representative call site*** — `app/api/v1/projects/[id]/modules/route.ts:34`, currently uncovered:

```ts
}, { auth: 'required', requires: ['atc:write'] });
```

Identical in shape to `app/api/v1/atcs/route.ts:49`. ***No handler body changes anywhere in the sweep.***

***3. Anti-rot for new routes — three layers, prevent then detect******:***

- ***Compile time (primary)******:*** the union above. A new route with no posture is a build failure, not a permissive endpoint. This is the piece that makes it a root-cause fix.
- ***Test time (auditability)******:**** `lib/api/route-capability-coverage.test.ts` walks `app/api/v1/***/route.ts` on disk, extracts every exported handler and its posture, and diffs against a committed snapshot. A new route fails the suite until the snapshot is regenerated, and the snapshot is the single file a reviewer reads to see all 81 handlers at once — the one genuine advantage candidate B had.
- ***Lint (optional)******:*** extend the `no-restricted-syntax` block at `eslint.config.js:108-114` to flag `auth: 'authenticated'` without a non-placeholder `why`. Largely subsumed by the type.

***4. DDL******:****** none.**** The vocabulary is unchanged, so `access*tokens*scopes*allowed` stays as written. For the record: had the vocabulary expanded, the correct shape would have been ****ADDITIVE**** — `alter table ... drop constraint access*tokens*scopes*allowed, add constraint ... check (scopes <@ array[<old four>, <new>]::text[])`, widening the accepted set. Dropping-then-re-adding a CHECK on a live table is additive ****only**** when the new array is a strict superset; removing or renaming any of the four existing values would be ****DESTRUCTIVE***, invalidating every already-minted token carrying that value and requiring a backfill.

***5. Already-minted tokens******:****** nothing happens at the storage layer.**** No migration, no backfill, no re-mint, no revocation. Every `access*tokens.scopes` row is read as-is; the only change is at read time in `requireCapability` (`lib/api/principal.ts:79-83`). Blast radius is precisely bounded: because the sweep adds ****zero**** new `workspace:admin` gates, every token minted with `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts:24-28`) loses ****nothing at all***. Only deliberately narrowed tokens change behaviour. Cookie sessions are unaffected — they hold `ALL*CAPABILITIES` (`principal.ts:69`).

### Migration classification

***No migration.*** Classification is moot for this ticket; the numbers are recorded so a later slice need not re-derive them.

***Next available number******:****** ****`0066`, taken from the ****live ledger**** via Supabase MCP `list*migrations` on project ref `fmbpikzpkafptqximhxn` (66 rows). Highest by ****name**** is `0065*atc*tags*cap*guard` (`20260806060122`). Newest by ****timestamp**** is `20260806094556 / 0058*atc*title*min*length`, and the ledger holds several other out-of-order pairs (`0046*bugs` lands after `0050`; `0047` precedes `0046`; `0059/0060/0061` interleave). ****Sorting by timestamp would have produced ****`0059`**** and collided.*** A directory listing is not authoritative either — `0058` was historically applied twice under different numbers.

Applying nothing means `autonomous_delivery.migrations: autonomous` is not engaged. Had the CHECK needed widening, the shape above is ADDITIVE and would qualify as unattended-safe under that config. Per Critical Rules #4 / #5 / #13, nothing is applied by this decision.

### Test strategy

A 403 against a mocked principal proves the mock returned 403. The contract test must mint a real token and observe the database.

***Primary — real production write path with a real narrow-scoped PAT.*** New `lib/api/capability-enforcement.test.ts`, built on the harness in `lib/api/auth-coexistence.test.ts`, which already seeds a real user via the service client (`:81-94`), mints a genuine PAT through the real `mintPat` (`:112-118`), and drives the real `resolveIdentity` with a real `NextRequest` (`:56-60`, `:122`). Same env guard, same `afterAll` cleanup (`:96-106`).

Three assertions per protected write, using `POST /api/v1/projects/[id]/modules` as the reference case:

1. ***Negative with side-effect proof.**** Mint a PAT scoped `['atc:read']` only. Import the route module's real exported `POST` and invoke it with that Bearer. Assert `403`, ****and*** assert via an independent service-role client that the `modules` row count for the target project is unchanged. The row assertion is the part that survives refactoring — a 403 alone also passes when the route is simply broken.
2. ***Positive control.**** Mint `['atc:read','atc:write']`, call the identical handler with an identical body, assert `2xx` ****and*** that the row now exists. Without this, assertion 1 is satisfied by any failure whatsoever and proves nothing about the gate specifically.
3. ***Cookie non-regression.*** The same operation through a principal holding `ALL_CAPABILITIES` still succeeds, locking the AC that cookie sessions are unaffected.

***Secondary.*** `lib/api/route-capability-coverage.test.ts` — the filesystem walk plus committed snapshot. The regression alarm for route 82.

***Existing suites that must stay green***, per the ticket's AC: `lib/api/rls-parity.test.ts` (cross-tenant isolation, ADR-0001 Path B), `lib/api/auth-coexistence.test.ts` (BK-166), `lib/api/workspace-context.test.ts` (ADR-0006 pairing).

> Standing constraint: all three are `describe.skip` without live Supabase credentials, so a session that cannot reach the database cannot verify this ticket. Same limitation ADR-0012 records under Consequences.

### Sizing

***One PR is the wrong shape.*** 48 capability decisions, 40 route files edited, a type change touching all 81 call sites, and two new test files — comparable to the 1900-4200 line chains that set `autonomous_delivery.caps.story: 1`. Five slices, each independently mergeable and revertible:

| Slice | Content | Behaviour change |
| --- | --- | --- |
| ***1. Foundation**** | Union type, `Capability` consolidation, `cookie-only` lift for the two token routes, coverage test + snapshot. Migrate all 81 call sites mechanically; the 48 uncovered get `{ auth: 'authenticated', why: 'BK-97 slice N pending' }`. | ****None.*** Pure refactor, all gates green. Lands the anti-rot machinery first; the only slice touching every file. |
| ***2. Authoring domain*** | modules, user-stories, acceptance-criteria, milestones, environments, imports (~22 handlers) | Narrow PATs start getting 403 |
| ***3. Reporting reads*** | coverage, bugs heatmap, recovery-cycles, runs report, bugs GET, activity, tests reads, runs GET (~12) | 403 for PATs without `atc:read` |
| ***4. Identity + notifications*** | Resolve the remaining ~14 `authenticated` placeholders into final postures with real `why` strings; close `invites/accept` (ADR-0001 flagged it "verify" at `:101` and never did) | Mostly none; documents intent |
| ***5. Docs*** | ADR-0001 KNOWN LIMITATION to resolved; close ADR-0006's BK-168 follow-up; update `qa-config.ts` scope purposes; regenerate `public/openapi.json` security descriptions | None |

Slice 1 must land intact and is the slice that actually fixes the root cause. Slices 2-4 are the sweep, each revertible by reverting single lines. ***If the chain stalls after slice 1, the codebase is strictly better than today***: nothing new is enforced yet, but nothing new can be added without stating its posture.

***Note for the epic owner******:*** BK-97 is currently typed `Improvement` with severity `Moderada`. The five-slice shape and the 48-handler surface make it story-shaped. Recommend converting it to a Story with sub-tasks per slice, or splitting slices 2-4 into sibling tickets under the same parent.

Decided autonomously by the AI Tech Lead profile under CLAUDE.md Critical Rule #18. No human sign-off is implied.

---

### Luis Eduardo Flores Villarroel - 8/14/2026, 7:23:03 AM

## Shift-Left QA — Decisions from PO review (2026-08-14)

All open questions surfaced during shift-left refinement were reviewed with PO and resolved before estimation. Full analysis, refined ACs, and test outlines are in `shift-left-refinement.md` (linked from this Story's ATP DRAFT field).

### Critical decisions (scope-defining)

1. ***Read (GET) posture across the 7 named route families***: `atc:read` is now required. Rationale: consistent with the scope's documented intent at `app/qa/qa-config.ts:625` ("read ATCs, steps, assertions, modules, user stories, AC") — reuses existing vocabulary instead of introducing a new one.

1. ***AC3 (workspace-context rejection) scope***: narrowed explicitly to the `workspace:admin` family only — `assertWorkspaceContext()` is NOT extended to the other 44 gap routes. Rationale: RLS already protects those routes via real DB membership; a PAT's `workspace_id` binding is orthogonal to that and adding a redundant check there roughly doubles the Story's size for no additional security benefit.

1. ***Epic parenting****: reparented from BK-183 (QA Defect Management — a QA process epic) to ****BK-1 (Tenancy & Identity)*** — the epic that owns the auth model this Story extends. Root cause: BK-262 was split out of BK-97 (an Improvement, which correctly parents to the QA process epic) and inherited that parent by mistake.

### Delivery decisions

1. ***Delivery grouping***: 2-3 PRs, not the full 5-slice chain proposed in BK-97 nor a single PR — Group 1 (Foundation + Authoring writes), Group 2 (Reporting reads + Identity/notifications + Docs). Balances review size against process overhead. QA will run one Ready-for-QA / retest cycle per delivery group.

1. ***Regression test update***: `app/api/v1/projects/[id]/traceability/route.test.ts:127-134` (currently asserts `201` for an `atc:write`-only PAT posting to `modules/[id]/user-stories` — encodes the pre-fix gap as intended behavior) will be updated to assert `403`, in the same PR that implements enforcement on that route. It will not be left green describing the old contract.

1. `invites/accept`*** (POST) scope***: explicitly OUT OF SCOPE for this Story. Rationale: conceptually distinct from the other 48 gap routes — the caller is not yet a workspace member when accepting an invite, so no role/capability-in-that-workspace check can apply (same bootstrap shape as `POST /workspaces`). Documented as known follow-up debt, not designed or tested here.

---

Refined ACs now stand at 7 scenarios (0 remaining `NEEDS PO/DEV CONFIRMATION` markers — all resolved). ATP DRAFT: 17 outlines (5 Positive / 7 Negative / 2 Boundary / 3 Integration). Story is ready for estimation.

---

### Luis Eduardo Flores Villarroel - 8/14/2026, 7:36:19 AM

## Estimation decision (2026-08-14)

***Story Points******:****** 21.*** This is the largest estimate recorded in this project to date — every other estimated Story in BK caps at 13 (62 Stories sampled, max 13, e.g. BK-5 "Invite a teammate with a role" at 13, the largest in this same epic).

### Rationale

- Scope is wide but shallow: 49 handlers across 7 route families, well beyond BK-5's single-family scope.
- Mechanism risk is low: `requireCapability()`/`withApiHandler({ requires })` already exists and is proven on 25/82 handlers — this is not new invention, it's 48 repeated "which capability" decisions plus consistent wiring.
- Delivery is already grouped into 2 PRs (Foundation + Authoring writes, then Reporting reads + Identity/notifications + Docs) per the shift-left decision already recorded on this issue.
- 9 refined ACs, 17 test outlines (7 Negative-heavy — meaningful regression-test authoring effort on top of the implementation).

### Flag for PO

***21 exceeds this project's historical ceiling (13).*** PO should explicitly decide, before sprint commitment, whether to:

- (a) keep this as a single 21-point Story, or
- (b) split it into 2 Stories aligned 1:1 with the already-decided delivery groups (roughly 8 + 13, or similar), which would bring each half back within the team's normal range and give cleaner per-PR traceability.

This Story is NOT auto-split by this session — the number is recorded as-is, and the split-or-not call is left to PO.

---


_Synced from Jira by sync-jira-issues_
