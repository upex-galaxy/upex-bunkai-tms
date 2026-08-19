# BK-498 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-498)

## Goal

Close the enforcement gap BK-497 deliberately left open: its 22 authoring-domain handlers declare `auth: 'authenticated'`, a posture that performs zero capability checks. A PAT minted for read-only work can currently create, rename and delete modules, user stories, acceptance criteria, environments, milestones and imports.

## Approach

Flip all 22 handlers from the BK-497 placeholder posture to a real requirement. The mapping is derived from the HTTP verb, per the contract already published to QA at `app/qa/qa-config.ts:625`:

| Verb | Requires | Handlers |
| --- | --- | --- |
| GET | `atc:read` | 7 |
| POST / PATCH / DELETE | `atc:write` | 15 |

Writes require `atc:write` ***alone***, not both scopes. AC-01 specifies a token "scoped exactly atc:write" must succeed, so requiring both would fail the criterion. This also matches the existing precedent at `app/api/v1/atcs/[id]/route.ts:126`.

No handler bodies change. The gate is the one BK-497 already shipped in `lib/api/handler.ts`, which calls `requireCapability` ***before*** the handler body executes — that ordering is what satisfies the "rejected before any change happens" clause of the Definition of Done.

## Technical decisions

> ***NOTE:**** ****No migration.*** The four-scope vocabulary is reused unchanged, so the CHECK at `supabase/migrations/0008*access*tokens.sql:34-36` is untouched and no already-minted token is invalidated. Nothing was applied to any database.

***No RPC authorization work is engaged.*** This Story writes and changes no Postgres function and adds no `SECURITY DEFINER` surface. The authoring writes already route through existing DEFINER RPCs (`bunkai*create*module`, `bunkai*update*module`, `bunkai*archive*module*subtree`) which role-gate via `bunkai*can*write*workspace`. That is a ROLE gate; this Story adds the orthogonal CAPABILITY gate above it. The ADR-0012 invariant is not engaged because no function signature, actor parameter, or result scoping changes.

***Scope fence.**** The two ungated handlers outside `app/api` — `app/auth/callback/route.ts` and `app/auth/oauth/[provider]/route.ts` — were declined by BK-497 and belong to BK-499. Untouched here. BK-498 and BK-499 must merge ****sequentially***, because both rewrite `lib/api/route-capability-coverage.snapshot.json` and its test asserts exact array equality.

## Verification

New `lib/api/capability-enforcement.test.ts` — a DB-integration suite, not a mocked one. It drives the REAL exported handlers with REAL minted PATs against the live database and observes rows through an independent service-role client.

Negative and positive cases are deliberately paired. A 403 alone is also produced by a route that is simply broken, and an unchanged row count is also explained by a write that never worked for anyone. Only together do they isolate the capability gate as the thing under test.

| AC | Assertion |
| --- | --- |
| AC-03 | read-only PAT POSTs a module: 403 ***and*** an unchanged module row count |
| AC-01 | `atc:write`-only PAT POSTs a module: 201 ***and*** the created row is read back by id — the real production write path |
| AC-07 | asserts the minted tokens carry `workspace_id = null`, then that the write still succeeds |
| AC-08a | `atc:read` PAT GETs `/modules/{id}/user-stories`: 200 |
| mirror | `atc:write`-only PAT on the same GET: 403, proving the read gate is `atc:read` specifically rather than "any authenticated principal" |

## Review Workload Forecast

```
Estimated: 303 additions + 134 deletions = 437 total lines (MEASURED from the real diff)
400-line budget risk: High
Chain strategy: single-pr
Decision trace: Q1=No (not mostly mechanical - 257 of the 437 lines are a
                hand-written DB-integration test carrying the real review
                substance; only 180 are the scripted posture flip plus the
                generated snapshot) - Q2=No (both candidate cuts fail: a domain
                cut has each slice rewriting the same whole-repo coverage
                snapshot whose test asserts exact array equality, so slice 2
                conflicts by construction; an enforcement/test cut would land a
                live authorization change on staging with no assertion
                exercising a real production write path) - Q3=Yes (the coverage
                snapshot is shared scaffolding every slice must rewrite, and the
                test's fixture chain - member lookup, project, module, dual PAT
                mint, cascade teardown - is shared across all five assertions)
                -> feature-branch-chain
Decided by: /git-flow-master Chained-PR decision tree (branching-strategies.md)
Decision needed before apply: No - superseded, see below
```

***Why the tree's leaf is recorded but not executed.**** The decomposition question for exactly this body of work was already scored and ruled on by the AI Product Owner profile on BK-262 (2026-08-17): "split into three" won at 29 points, and "split into five per BK-97's chain" was explicitly rejected at 20 as over-decomposition. BK-498 ****is*** one of those three ratified slices. Splitting it again re-litigates a settled decision at a lower level of authority, which the decision protocol forbids — a decision already made is followed and cited, never re-derived. The generic 400-line heuristic yields to the specific ratified ruling here, and the overrun is 37 lines (9%), the majority of which is one cohesive new test file. Recorded rather than hidden; the tree walk above is the honest answer to the generic question.

---
_Synced from Jira by sync-jira-issues_
