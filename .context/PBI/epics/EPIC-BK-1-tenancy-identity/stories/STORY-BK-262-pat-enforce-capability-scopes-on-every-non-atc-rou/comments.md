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

### Ely - 8/17/2026, 3:43:56 PM

## AI Product Owner — Decision: split BK-262 into smaller Stories, or keep it as one 21-point Story?

> ***Attribution.**** Produced by the ****AI Product Owner / Business Analyst*** profile under CLAUDE.md
Critical Rule #18, which makes product, scope and boundary calls on this project an AI responsibility
rather than a blocker awaiting a human. This is ***not*** a human PO sign-off and must never be read as
one. The technical seam is decided separately by the AI Tech Lead profile in a companion comment on
this issue; this ruling governs product scope, boundaries, titles, acceptance-criteria allocation and
entry status only.

This answers the question the 2026-08-14 estimation comment left open: *"This Story is NOT auto-split by
this session — the number is recorded as-is, and the split-or-not call is left to PO."* This project has
no human PO by default (Critical Rule #18); the AI Product Owner profile holds that role, and the
reservation named the role rather than a specific person. So it is answered here rather than waited on.

### Decision

***SPLIT — into three sibling Stories***, along the domain seam the AI Tech Lead measured, and within the
"2-3 PRs" range the 2026-08-14 shift-left review ratified. BK-262 becomes `ABORTED` (split, not
abandoned), the same disposition BK-267 received on 2026-08-13.

| Successor | Title | Points | Entry status |
| --- | --- | --- | --- |
| 1 | PAT | Require every API route to declare its capability posture | 5 | `Ready For Dev` |
| 2 | PAT | Enforce capability scopes on the authoring domain | 8 | `Ready For Dev` |
| 3 | PAT | Enforce capability scopes on read, identity and notification routes | 8 | `Backlog` |

All three parent to ***BK-1 (Tenancy & Identity)***. 2 `depends on` 1; 3 `depends on` 1. All three
`Relates` to BK-262 (this instance has no `supersedes` link type). Points sum to 21 — the split does not
inflate the estimate, and every slice now sits well inside this project's 13-point ceiling.

### Why split

Three reasons, in order of weight.

***1. The ticket cannot represent its own ratified delivery plan.*** The shift-left review already decided
this ships as multiple PRs with **one Ready-for-QA / retest cycle per delivery group**. A single Jira Story
has one status. It cannot say "the first group is merged and QA-approved, the rest is in progress" — so
for most of delivery the ticket would describe a state the work is not in, and QA would run its first
retest cycle against a Story that cannot reach `QA Approved` without lying about the remainder. The split
makes the Story boundary, the PR boundary and the QA-cycle boundary the same boundary. That was already
decided; this only makes the tracker agree with it.

***2. The gap is actively growing.*** Re-measured live against the repo with a parser that catches every
export form: **68 route files, 87 exported handlers, 8 public, 27 declaring a capability, 50 with no
capability check at all, and 2 bypassing the gateway entirely.** Prior counts were 48 (2026-08-06) and 49
(2026-08-11). Roughly one new unguarded handler per week, every week this sits.

The sharpest single instance, and it is new to this review: `GET /api/v1/tokens`**
(***`app/api/v1/tokens/route.ts:111`****) has no capability check and no bearer guard***, while `POST /tokens` and
`DELETE /tokens/{id}` both hand-roll one. A PAT can therefore **enumerate** its owner's other Personal
Access Tokens — names, prefixes, scopes, workspace binding, expiry, last-used — while being unable to mint
or revoke one. Two thirds of that family is guarded and the enumeration path is not. Ruling `12195` named
only the two guarded handlers, so every count derived from it has been short by exactly this one. (Scope
note, so this is not over-read: the route is RLS-scoped to the caller's own tokens, so this is a
scope-enforcement gap, not cross-tenant exposure.)

***3. 21 is unique in this project's history.*** Confirmed against `epic-tree.md`: 65 estimated items,
distribution 1x8, 2x4, 3x14, 5x22, 8x12, 13x4, and exactly one 21 — this ticket. 5 + 8 + 8 returns every
slice to a size the team has actually delivered.

### Why three, and where the seam falls

***The seam is the domain, not the verb.*** An earlier draft of this ruling cut the first group at
"authoring **writes**" and pushed the matching reads into the second. That was wrong, and the AI Tech Lead's
measurement is what corrected it: six route files hold their GET and their write in the same file
(`acceptance-criteria/[id]`, `modules/[id]/user-stories`, `user-stories/[id]`,
`user-stories/[id]/acceptance-criteria`, `projects/[id]/environments`, `projects/[id]/milestones`), so a
verb cut has the second PR re-editing lines the first just finalized. The domain cut is clean: no file
receives a final capability posture from two different Stories. The settled BK-97 ruling `12195` already
meant this — its authoring slice is "~22 handlers", which is F1+F2 **including** their 7 reads. Only the
shift-left ***label*** ("Authoring writes") pointed at the verb cut, and a label is not a decision.

***Three rather than two, because the Foundation is a different kind of work.*** The shift-left review
ratified "2-3 PRs, not the full 5-slice chain" — three is inside that range, so nothing is overturned
here. Isolating the Foundation wins on five grounds:

- It is ***behaviour-neutral***. Every existing gate stays green and no functional behaviour changes, so its

  QA cycle is "all suites still green, coverage snapshot present", not a functional retest. The
  process-overhead cost normally charged against a longer chain does not apply to it.

- It is the ***only slice touching all 68 route files***, and isolating it makes that blast radius

  independently revertible: the type change can be rolled back without disturbing a single capability
  decision, and vice versa.

- Bundled into the authoring slice it would sit at ***exactly 13 — the ceiling, with zero headroom*** — on

  the widest-blast-radius work in the ticket. Reproducing the sizing failure this ruling exists to fix
  would be incoherent.

- It is ***independently valuable and independently releasable***. Once a route cannot compile without

  declaring a posture, the gap cannot grow again even if both sweeps stall.

- BK-267, the governing precedent, itself split three ways.

**One precision, so this is not overstated****:** the Foundation touches every route file by construction, so
"no file touched twice" is not literally true of the set. What holds, and what matters, is that **no file
receives a final capability posture from two different Stories.**

### Why the entry statuses differ

BK-262's refinement is complete — 9 refined criteria, 17 test outlines, zero open confirmation markers. A
split therefore ***partitions ratified refinement*** rather than requiring new refinement, which is
materially different from BK-267, whose successors genuinely needed authoring and were correctly created
in `Backlog`. That argues for all three entering at `Ready For Dev`.

**Except that verification against live code found every refinement defect in one place — the reads
Story.*** Its two read criteria (AC-08, AC-09) both illustrate with **"such as listing modules"*, and no
modules-listing endpoint exists. And five of its routes carry in-code ratified "no scope requirement"
decisions from BK-41/BK-46 that this Story's decision 1 overturns. The Foundation's and the authoring
Story's criteria verified clean.

So: ***Successors 1 and 2 enter at ***`Ready For Dev` — their refinement is complete and verified, they are
unblocked, and parking them would be the "wait for a human" failure Rule #18 exists to end. **Successor 3
enters at **`Backlog` so QA can pull it through its own shift-left pass and confirm the corrected examples
and the superseded postures. This costs ***nothing*** on the critical path: it cannot start before the
Foundation has merged regardless of its status.

***Stated plainly, because it is the honest tradeoff******:*** placing Successors 1 and 2 at `Ready For Dev`
bypasses the `Shift-Left QA` transition on newly created Stories, and that gate belongs to QA, not to this
profile. ***QA may pull either back with a single transition and no argument from this ruling.*** All three
successors carry the `shift-left-2026-08-14` and `shift-left-reviewed` labels and name BK-262 as the
source of their refinement, so the provenance is visible to whoever reviews them.

***One gap I will not paper over.*** Successor 1's headline property — that a new route cannot compile
without declaring a posture — has ***no acceptance criterion*** among BK-262's nine. The nine framed this
work as "every route family checks the scope", never as "no future route can omit one". The ATP already
carries the test outline for it, so it is tested but never stated as a criterion. Authoring one here would
be inventing refinement, so it is recorded for QA instead — and it is a legitimate reason QA may pull
Successor 1 back to `Shift-Left QA`.

### Corrections carried into the successors

Eight factual errors were found while verifying this ticket against live code. Each is corrected in the
Story that inherits it. None changes intent — they fix examples, instructions and counts that named things
which do not exist or no longer hold.

1. ***AC-08 / AC-09 name an endpoint that does not exist.*** Both illustrate the read case with "such as

   listing modules"; `app/api/v1/projects/[id]/modules/route.ts` exports ***POST only***. The replacements
   are specified in items 5 and 7, which place each corrected example in the Story that actually owns the
   route. The criteria's intent — a non-ATC read requires `atc:read` — is unchanged.

1. ***The ****`traceability/route.test.ts`**** instruction is wrong and would destroy coverage.*** Decision 5 of the

   shift-left review says lines 127-134 "assert 201" and must be "updated to assert 403". Those lines are
   a `mintPat` call inside `beforeAll`; the 201 is a fixture precondition and, because that PAT holds
   `atc:write` and the route is an authoring write, ***it will still return 201 after the fix***. What
   actually breaks is the suite's four real assertions (`:168`, `:179`, `:188`, `:199-202`), all driving
   `GET /projects/{id}/traceability` with an `atc:write`-only PAT — they become 403 the moment reads
   require `atc:read`. The correct fix is to widen that fixture PAT to `['atc:read','atc:write']` at
   `:132`. Rewriting the file to assert 403 would delete the BK-329 cross-project scoping regression test.
   Under-scoped-PAT coverage belongs in the new dedicated `lib/api/capability-enforcement.test.ts`, not in
   a degraded unrelated fixture. -> Successor 3, since the affected route is a read.

1. ***The Scope field is under-inclusive by roughly 17 handlers.*** It names seven route families; the

   ratified groups cover the full 50-handler gap, including `activity`, top-level `environments`, `tests`,
   `bugs`, `runs`, `me`, `notifications`, `notification-preferences` and `tokens` — none of which appear in
   the seven. This is stale field text, not a scope change. Each successor's Scope field is written to
   match what it actually delivers.

1. `shift-left-refinement.md`*** does not exist.*** It is referenced three times as holding the full

   analysis, edge cases, risks and testing strategy. It is not in the repo and is not gitignored — it was
   never committed. The durable refinement is exactly what is in Jira: the 9 criteria, the 17 test outline
   names, and the decisions comment, all of which are partitioned into the successors. Successors must not
   reference that file. **(Also noted****:**** **`story.md`* and the ATP say "7 refined scenarios"; the Jira field
   holds 9. The field is authoritative.)*

1. ***The read criteria's replacement example must land in the Story that owns it.*** AC-08/AC-09 now read

   "such as listing the Bugs in a project (`GET /api/v1/projects/{id}/bugs`)" — verified present, in the
   gap, and inside Successor 3's families. `GET /api/v1/bugs` was rejected as the example after checking
   it: `app/api/v1/bugs/route.ts:213` carries a ratified "no PAT scope requirement" decision, and naming a
   contested route in a criterion would bake that conflict into the AC.

1. ***Five gap reads carry ratified in-code postures that decision 1 overturns***, and the implementer must

   update those comments rather than silently contradict them: `GET /api/v1/bugs` (`:213`),
   `GET /api/v1/activity` (`:13`), `GET /api/v1/tests/{id}/runs` (`:11`),
   `GET /api/v1/projects/{id}/coverage` (`:10`), `GET /api/v1/projects/{id}/runs/report` (`:14`).
   ***Decision 1 supersedes all five.*** Each justifies itself by mirroring one of the others — a closed loop
   in which no link cites a product reason a narrow PAT **should** read reports — while decision 1 cites the
   contract documented to QA at `app/qa/qa-config.ts:625`. `runs/report` even says "no scope requirement
   **yet** ... the PAT catalog has no run-read scope"; decision 1 answers exactly that by mapping reads onto
   `atc:read` instead of minting a run-read scope. -> Successor 3.

1. ***The authoring Story gates 7 reads and BK-262's nine criteria leave them uncovered.*** Shift-left

   decision 1 ratified `atc:read` on GETs across these families, so the intent exists on both sides of the
   seam and needs an expression on each. AC-08's ratified intent is partitioned as ***AC-08a***, pointed at
   `GET /api/v1/modules/{id}/user-stories` (verified, in the gap, authoring domain). This is a partition of
   ratified intent, not a new criterion. -> Successor 2.

1. ***Two handlers bypass the gateway, not one***: `app/api/openapi/route.ts:18` and `app/api/v1/route.ts:21`

   (a static 204 CORS preflight). Both are bare `export function`, which is how every previous count missed
   them. Both are legitimately gateway-free — but the coverage snapshot must **enumerate them explicitly as
   bypassers**, or it claims a completeness it does not have, which is the same fail-open shape the type
   union exists to close. -> Successor 1.

### Acceptance-criteria allocation

| Story | Criteria |
| --- | --- |
| 1 — Foundation | AC-04, AC-05, AC-06 — the three non-regression guards. They already pass today, and this is the only Story that touches all 87 call sites, so it is the only one that can break them. ***They must not be dropped as "already green".*** |
| 2 — Authoring | AC-01, AC-03, AC-07, ***AC-08a*** (partition of AC-08's ratified intent, example `GET /api/v1/modules/{id}/user-stories`) |
| 3 — Reads + identity | AC-02, AC-08 **(example corrected)**, AC-09 **(example corrected)** |

All nine originals land in exactly one Story. None is dropped, none is duplicated, none was unallocatable.
AC-08a is the only addition, and it is a partition of ratified intent forced by the seam moving, not new
refinement. The 17 ATP outlines partition along the same seam.

### `invites/accept` — the debt survives the abort, but does not become a ticket today

The shift-left review put `POST /invites/accept` out of scope with a sound rationale (the caller is not yet
a workspace member, so no capability-in-that-workspace check can apply — the same bootstrap shape as
`POST /workspaces`) and recorded it as follow-up debt. Aborting BK-262 would erase the only place that debt
is written down, so ***it is carried verbatim into Successor 3's Out of scope field.***

It is deliberately ***not*** filed as a ticket now. Its posture question is genuinely open and has never been
through shift-left; filing it would create an unrefined ticket, which Rule #18 names as one of the only two
legitimate blockers. Recorded here for QA shift-left authoring instead.

### Disposition of BK-262

`ABORTED` — split, not abandoned. Its 21 points stay on the record as this project's largest recorded
estimate. All three successors `Relates` back to it; Successors 2 and 3 each `depends on` Successor 1.

### Alternatives scored

| # | Candidate | Value | Precedent | Cost | Reversibility | Risk | Traceability | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Keep one 21-SP Story | 3 | 1 | 4 | 2 | 2 | 2 | 14 |
| B | Split in two (13 + 8) | 4 | 4 | 5 | 3 | 2 | 4 | 22 |
| ***C**** | ****Split in three (5 + 8 + 8)**** | ****5**** | ****5**** | ****4**** | ****5**** | ****5**** | ****5**** | ****29*** |
| D | Split into five per BK-97's chain | 4 | 3 | 2 | 5 | 3 | 3 | 20 |
| E | Keep BK-262, add sub-tasks | 3 | 2 | 3 | 4 | 3 | 3 | 18 |

B was this ruling's own first answer and was revised: it rested on reading the shift-left review as having
"overruled the 5-slice chain in favour of two groups", but the review's literal words are **"2-3 PRs, not
the full 5-slice chain"** — three is inside the ratified range, so the precedent objection to it never
applied. D reopens a call the review closed and cannot partition (BK-97's slice 5 is documentation-only and
would carry zero criteria). E has no precedent here: every split to date used sibling Stories, and
`.agents/jira-required.yaml` gives sub-tasks no `work_types` entry, so the PBI sync has no folder shape for
them and points and QA cycles both live at Story grain.

---

Decided autonomously by the AI Product Owner / Business Analyst profile under CLAUDE.md Critical Rule #18,
after a scored comparison of five alternatives and a reconciliation pass against the AI Tech Lead's
measured seam analysis. No human sign-off is implied or claimed.

---

### Ely - 8/17/2026, 3:44:02 PM

## AI Tech Lead — Decision: the technical seam for splitting BK-262

> ***Attribution.**** Produced by the ****AI Tech Lead profile*** under CLAUDE.md Critical Rule #18, which grants
this profile authority over schema, API-contract, auth-enforcement and migration-shape calls. This is
***NOT a human sign-off*** and must not be read as one. The product and scope boundary is decided
separately by the AI Product Owner profile in its companion comment on this issue; this ruling governs
engineering only.

The two rulings already published on this issue — the capability vocabulary (BK-97 comment `12194`) and the
enforcement shape, "per-route + type-level default-deny + coverage snapshot" (BK-97 comment `12195`) — are
***settled and followed here, not revisited***. This ruling starts where they stop.

### Measured state, read from code rather than inherited from any comment

| Metric | Measured | Prior claim | Verdict |
| --- | --- | --- | --- |
| Route files under `app/api` | ***68*** | 64 | refuted |
| Exported handlers | ***87*** | 82 | refuted |
| `auth: 'public'` | ***8*** | 8 | confirmed |
| Declaring a non-empty `requires` | ***27*** | 25 | refuted |
| ***Authed with no capability check at all**** | ****50*** | 49 | refuted |
| Bypassing the gateway entirely | ***2*** | 1 | refuted |

8 + 27 + 50 + 2 = 87, exact. `lib/api/handler.ts:75-82` iterates `options.requires ?? []`, so an omitted
`requires` performs zero checks — that is the fail-open. `lib/api/principal.ts:66-73` gives a cookie caller
`ALL_CAPABILITIES` while `:49-58` gives a PAT caller only its token scopes, which is why this gap affects
tokens exclusively and never browser sessions.

> ***Reconciliation note.*** An earlier draft of this ruling published 85 handlers / 28 gated / 49 gaps / 1
bypasser, derived from a family table built on ruling `12195`. The numbers above supersede it. Two
distinct errors were found on re-measurement, both worth recording because both are systematic:
`GET /api/v1/tokens` (`app/api/v1/tokens/route.ts:111`) was counted as gated because `12195` named only
the two token handlers that hand-roll a bearer guard — it has ***no options object at all***; and a
`export const`-only scan misses both bare `export function` handlers (`app/api/openapi/route.ts:18` and
`app/api/v1/route.ts:21`). Any future count must match every export form, and must not inherit a family
table from a ruling that predates it.

Per route family, with the capability each needs:

| # | Family | Authed | Gated | Gaps | Capability |
| --- | --- | --- | --- | --- | --- |
| F0 | ATC library core (`atcs/*`, `search`) | 6 | 6 | 0 | `atc:read` / `atc:write` |
| F1 | Authoring hierarchy (modules, user-stories, AC) | 13 | 0 | 13 | `atc:write` / `atc:read` |
| F2 | Project sub-resources (environments, milestones, imports) | 9 | 0 | 9 | `atc:write` / `atc:read` |
| F3 | Reporting reads (`projects/[id]/*`, activity, bugs reads) | 12 | 3 | 9 | `atc:read` |
| F4 | Runs & tests reads | 11 | 8 | 3 | `atc:read` |
| F5 | Workspaces & membership | 15 | 11 | 4 | mixed — see below |
| F6 | Identity & notifications | 7 | 0 | 7 | ***none*** — see below |
| F7 | Credential bootstrap (tokens, `invites/accept`) | 5 | 0 | 5 | `cookie-only` / none / deferred |

***Two contract calls inside this profile's authority.***

- `POST /workspaces`*** (****`app/api/v1/workspaces/route.ts:53`****) must NOT require ****`workspace:admin`****.***

  `assertTokenIssuanceAuthorized` (`lib/api/pat.ts:54-61`) cannot mint an admin token without a
  pre-existing workspace where the caller is already admin, so gating creation on it is an unsatisfiable
  deadlock. The same reasoning keeps `DELETE /workspaces/[id]/membership` (`:22`) capability-free, so a
  plain member can leave.

- ***Identity and notification routes (F6) must NOT take ****`atc:read`****.*** `app/qa/qa-config.ts:625` publishes

  `atc:read` as covering "ATCs, steps, assertions, modules, user stories, AC". Identity and notifications
  sit outside that shipped contract, so F6 takes a justified no-capability posture. No conflict with the
  shift-left read-posture decision, which scoped `atc:read` to the 7 named families; F6 and F7 are not
  among them.

### TQ1 — Is the ratified delivery-group boundary the correct technical cut line?

| Candidate | No-rewrite | Security | Review balance | Reversibility | Consistency | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. Verb cut (authoring **writes** only) | 2 | 4 | 3 | 4 | 5 | 18 |
| ***B. Domain cut (all of F1+F2, reads included)**** | ****5**** | ****4**** | ****3**** | ****4**** | ****5**** | ****21*** |
| C. Layer cut (Foundation only, then all 50 gates) | 5 | 3 | 2 | 5 | 3 | 18 |
| D. Capability cut (`atc:write` set, then the rest) | 3 | 4 | 4 | 4 | 3 | 18 |

***B wins******:***** the boundary is a clean seam, but only under the domain reading — and the group label points at
the wrong one.*** Read literally as "Authoring **writes*", six route files hold their GET and their write in
the same file and would be edited by BOTH sweeps:

- `app/api/v1/acceptance-criteria/[id]/route.ts` — GET `:30` vs PATCH `:54` / DELETE `:149`
- `app/api/v1/modules/[id]/user-stories/route.ts` — GET `:96` vs POST `:27`
- `app/api/v1/user-stories/[id]/acceptance-criteria/route.ts` — GET `:95` vs POST `:30`
- `app/api/v1/user-stories/[id]/route.ts` — GET `:29` vs PATCH `:53` / DELETE `:200`
- `app/api/v1/projects/[id]/environments/route.ts` — GET `:19` vs POST `:42`
- `app/api/v1/projects/[id]/milestones/route.ts` — GET `:20` vs POST `:46`

Ruling `12195`'s own slice content already said "modules, user-stories, acceptance-criteria, milestones,
environments, imports (***~******22 handlers****)" — 22 is exactly F1+F2 **including* their 7 reads. The settled
ruling already meant the domain cut; only the shift-left label pointed elsewhere. **Merge the slices
sequentially, not in parallel*****:*** the coverage snapshot is the one artifact more than one slice edits.

### TQ2 — Is a partially-enforced authorization sweep a safe intermediate state?

| Candidate | Security delta | Contract stability | Test truth | Revert cost | Consistency | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. Unsafe — require all 50 in one merge | 3 | 4 | 3 | 1 | 1 | 12 |
| ***B. Acceptable and strictly better; sequential + named guards**** | ****5**** | ****4**** | ****5**** | ****5**** | ****5**** | ****24*** |
| C. Behind a feature flag / kill-switch | 4 | 3 | 3 | 4 | 2 | 16 |
| D. Ship the remaining routes provisionally on `atc:read` | 2 | 2 | 2 | 4 | 2 | 12 |

**B wins, and the honest phrasing is that the intermediate state is BETTER than today, not merely
tolerable. 50 -> 28 -> 0.*** The gate is ****purely subtractive***: `handler.ts:77-79` can only turn a 2xx into
a 403 for an under-scoped PAT; it can never grant access that did not exist. Cookie sessions are
structurally unaffected (`principal.ts:69`). So each merge strictly reduces the ungated count and nothing
regresses — "partial" here is a real fix of a real subset, not a euphemism for an unsafe halfway house.

Blast radius is narrower than it reads: `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts:24-28`) is
`['atc:read','atc:write','run:execute']` and the sweep adds ***zero*** new `workspace:admin` gates, so every
token minted through sign-in or sign-up passes every gate every slice adds. Only deliberately narrowed
tokens change behaviour.

C was rejected specifically: a runtime kill-switch is a second authorization surface beside `requires` —
the exact shape ADR-0001 rejected when it declined a parallel gateway. D was rejected hardest: stamping
`atc:read` on identity and notification routes ships a knowingly wrong posture as if it were final, against
the published contract at `app/qa/qa-config.ts:625`.

### TQ3 — Does either slice need a database migration?

| Candidate | Necessity | Token-invalidation risk | Reversibility | Consistency | Total |
| --- | --- | --- | --- | --- | --- |
| ***A. No migration**** | ****5**** | ****5**** | ****5**** | ****5**** | ****20*** |
| B. Additive CHECK widening | 1 | 4 | 3 | 3 | 11 |
| C. Backfill / re-mint tokens | 1 | 1 | 1 | 2 | 5 |
| D. Scopes into the impersonation JWT, enforce in RLS | 1 | 3 | 2 | 1 | 7 |

***No migration, in any slice. Re-derived against the code rather than inherited from the prior ruling.***
`supabase/migrations/0008*access*tokens.sql:34-36` admits exactly the four values declared at
`lib/api/principal.ts:31` and `lib/api/pat.ts:14-19`. The sweep introduces ***no fifth value***, so there is
nothing to widen. The only later migration touching `scopes`,
`supabase/migrations/0033*remediate*bk135*admin*scope.sql`, is a one-shot BK-135 remediation and does not
alter the constraint. No column added, no value renamed, no backfill. The entire change is read-time, in
`requireCapability` (`lib/api/principal.ts:79-83`).

Recorded so no later slice re-derives it: had a fifth scope been required, the correct shape is ***ADDITIVE***
— drop and re-add the CHECK over a strict superset. Removing or renaming any of the four existing values
would be ***DESTRUCTIVE*** and would invalidate every minted token carrying it. Neither applies here.

***RPC-authorization gate******:****** assessed and NOT engaged.*** No slice writes or modifies any Postgres function,
and no route introduces a function taking a caller-supplied identity or scope parameter, so the actor-bind
and result-scoping requirements do not bind this ticket. Stated explicitly so a later reviewer need not
re-check. ADR-0006 already rejected pushing scopes into the impersonation JWT, which is the change that
would have pulled RLS into scope.

### TQ4 — Sizing sanity

The estimator's proposed ***8 + 13 is inverted***. The Foundation half is the heavier one: it carries the
discriminated union, the migration of all 87 call sites, the `Capability` consolidation collapsing
`AccessTokenScope` (`lib/api/pat.ts:12`) into `ALL_CAPABILITIES` (`lib/api/principal.ts:31`), the
`cookie-only` lift for the two hand-rolled bearer guards, and two new test files. A two-way split therefore
reads 13 + 8, not 8 + 13 — and 13 sits ***exactly at the project ceiling with zero headroom***, on the slice
with the widest blast radius.

Extracting the Foundation as its own slice (5 + 8 + 8) scored higher on every axis except issue count,
because the Foundation is behaviour-neutral: every existing gate stays green and no functional behaviour
changes, so it needs ***no functional QA cycle at all***, which dissolves the process-overhead cost normally
charged against a longer chain. **The group count is the AI Product Owner's call, and that profile has
ruled three** — this ruling supports it and does not override it.

### Correction to the shift-left refinement — the named regression test is wrong in three ways

The refinement states that `app/api/v1/projects/[id]/traceability/route.test.ts:127-134` "currently asserts
the pre-fix `201` contract" and "will be updated to assert `403` in the same PR that fixes that route." All
three parts are incorrect, and following it literally destroys regression coverage:

1. ***It is not an assertion.*** Those lines are `beforeAll` fixture setup; the `201` is a precondition guard

   that throws to abort setup. It does not encode a contract.

1. ***It will not break in the authoring slice, and needs no change there.*** The token is scoped

   `['atc:write']` (`:132`) and `POST /modules/[id]/user-stories` will require exactly `atc:write`, so it
   keeps returning 201. Rewriting it into a `403` assertion would delete the fixture and with it **all
   four** BK-329 project/story-mismatch regression tests.

1. ***The real break is in the reads slice, and it is a different failure.*** That same `['atc:write']`-only

   token is stored as `fixture.token` (`:150`) and reused for all four GET assertions — `:168`, `:179`,
   `:188`, `:199-202`. Gating `GET /projects/[id]/traceability` on `atc:read` turns all four red with 403.

***Correct remedy******:*** widen `scopes: ['atc:write']` to `['atc:read', 'atc:write']` at `:132`, in the reads
slice. Coverage for an under-scoped PAT belongs in the new dedicated
`lib/api/capability-enforcement.test.ts`, where a purpose-built narrow token proves the 403 **and** the
absence of a side effect — not by degrading an unrelated fixture.

### Hazards for the implementer

1. ***The traceability fixture token spans two slices*** — detail above. Highest-value hazard on this ticket.
2. ***The coverage snapshot is the only file more than one slice edits.*** `lib/api/route-capability-coverage.test.ts`

   does not exist yet; the Foundation creates it with placeholder rows and each sweep rewrites its own. Merge
   sequentially — parallel branches conflict on this file and only this file.

1. ***The token routes are unrepresentable in the union until the ****`cookie-only`**** lift lands.***

   `app/api/v1/tokens/route.ts:36` and `app/api/v1/tokens/[id]/route.ts:21` hand-roll
   `principal.via === 'bearer'` rejection. The Foundation must ship that posture in the same commit as the
   union, or they cannot compile without an escape hatch that will then be forgotten. Note that their
   sibling `GET /tokens` (`:111`) needs a ***different*** posture — a declared no-capability one carrying its
   existing justification (**"Listing is read-only and RLS-scoped to the caller's own tokens"**), not the
   cookie-only lift.

1. `principal.via`*** branching inside handler bodies is workspace resolution, NOT authorization.***

   `tests/route.ts:60`, `runs/route.ts:39,66,82`, `me/route.ts:36,64`, `search/response.ts:37`,
   `activity/response.ts:46`, `me/active-workspace/response.ts:43`,
   `workspaces/[id]/membership/response.ts:18`. The capability gate runs at `handler.ts:77-79`, strictly
   before the handler body at `:83`. Adding `requires` does not interact with these branches, and they must
   not be "cleaned up" as part of the sweep.

1. ***The vocabulary collapse has a consumer outside the API layer*** — `lib/tokens/issue-form.test.ts` and

   the tokens route consume the `pat.ts` type. Foundation slice only, but it reaches beyond `app/api`.

1. `assertWorkspaceContext`*** stays at its five existing sites.*** Seven routes deliberately skip it with

   in-line justification; the shift-left decision explicitly declined to extend it. Do not add call sites
   while sweeping.

1. ***Verification is credential-gated.*** `lib/api/rls-parity.test.ts`, `lib/api/auth-coexistence.test.ts`

   and the traceability suite are `describe.skip` without live Supabase credentials. A session that cannot
   reach the database cannot verify any of these slices.

### Not escalation-worthy

This applies ADR-0006's already-ratified `requires` + `withApiHandler` gate at breadth. No new scope value,
no new enforcement mechanism, no RLS change, no trust-model change, no change to what any role may do.
`auth: 'cookie-only'` is a ***relocation*** of logic already shipping at `app/api/v1/tokens/route.ts:36` and
`app/api/v1/tokens/[id]/route.ts:21` into the gateway where ADR-0001 says it belongs — not a new rule. The
compile-time default-deny type is a durability mechanism already settled by ruling `12195`. Ordinary work,
settled here under Rule #18 rather than escalated: no escalation was manufactured, and none was found to
wave away.

---

Decided autonomously by the ***AI Tech Lead profile*** under CLAUDE.md Critical Rule #18. Alternatives were
enumerated and scored for each question; every count above was measured against `staging` and reconciled
with the AI Product Owner's independent measurement before publication. **No human sign-off is implied or
claimed.**

---


_Synced from Jira by sync-jira-issues_
