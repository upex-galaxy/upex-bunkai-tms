# BK-497 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

## Goal

Make every API route handler declare its auth/capability posture explicitly, so a handler that omits one ***fails to compile***. Behaviour-neutral: no gate changes, no migration.

## Measured baseline (read from code on this branch, not inherited)

| Metric | Count |
| --- | --- |
| Route files under `app/api` | 68 |
| Exported HTTP handlers | 87 |
| Routed through `withApiHandler` | 85 |
| Bypassing the gateway by design | 2 |

The 2 bypassers are `app/api/openapi/route.ts:18` (bare `export function GET`, `force-static`) and `app/api/v1/route.ts:21` (bare `export function OPTIONS`, static 204 CORS preflight). Both counts match the AI Tech Lead's 2026-08-17 measurement exactly.

Test baseline before any edit: ***1546 pass / 1 fail***. The single failure is pre-existing and unrelated — `lib/runs/start-run.test.ts:129` (BK-34 run-steps chain order, `Expected: 1 / Received: 2`, shared-database seed state). It fails identically on the untouched `staging` tip.

## Design

### 1. The type union (`lib/api/handler.ts`) — the durable part

```ts
export type WithApiHandlerOptions =
  | { auth: 'public' }
  | { auth: 'cookie-only', why: string }
  | { auth: 'authenticated', why: string }
  | { auth: 'required', requires: NonEmpty<Capability> };
```

`options` loses its `= {}` default, so `auth` becomes mandatory and a new route cannot compile without stating a posture. `NonEmpty<Capability>` makes `requires: []` a type error, closing the "declare an empty array to satisfy the compiler" escape. `Capability` replaces `string[]`, so `'atc:writ'` fails to compile.

Runtime mapping, chosen so every existing gate stays byte-identical:

| Posture | Runtime |
| --- | --- |
| `public` | no identity resolution (unchanged) |
| `cookie-only` | resolve identity, then reject `principal.via === 'bearer'` with 403 `forbidden` |
| `authenticated` | resolve identity, no capability check |
| `required` | resolve identity + `requireCapability` per entry (unchanged) |

### 2. Vocabulary consolidation

`AccessTokenScope` (`lib/api/pat.ts:12`) collapses into the single `ALL*CAPABILITIES` vocabulary. Also removes a ***fourth*** duplicate the rulings did not name: a local `ALLOWED*SCOPES` literal at `app/api/v1/tokens/route.ts:23`.

### 3. `cookie-only` lift

The hand-rolled `principal.via === 'bearer'` rejections at `app/api/v1/tokens/route.ts:36` and `app/api/v1/tokens/[id]/route.ts:21` move out of the handler bodies into the gateway. `GET /api/v1/tokens` (`:111`) does ***not*** get the lift — it gets `{ auth: 'authenticated', why: 'Listing is read-only and RLS-scoped to the caller's own tokens.' }`, carrying its existing justification.

### 4. Coverage check

`lib/api/route-capability-coverage.test.ts` walks `app/api/***/route.ts` on disk with a paren-matching parser (a regex mis-parses handlers whose only brace-comma-brace pair is a `jsonResponse(body, { status })` inside the body — verified during measurement), extracts every exported handler + posture, and diffs against a committed snapshot. The snapshot enumerates all 87 handlers ****including the 2 bypassers under an explicit ****`bypass`**** posture***, so it cannot claim a completeness it does not have.

The 50 currently-ungated handlers get `{ auth: 'authenticated', why: 'BK-498 pending — ...' }` / `'BK-499 pending — ...'` placeholders naming the successor Story that resolves each one. Assigning their real capabilities is explicitly out of scope here.

## Technical decisions

***D1 — the consolidated vocabulary cannot live in ****`principal.ts`****.**** `components/settings/IssueTokenModal.tsx` is a `'use client'` component and imports the **value* `ALLOWED*PAT*SCOPES` plus the type `AccessTokenScope` from `@lib/api/pat`. `lib/api/principal.ts:10` imports `server-only`. Having `pat.ts` import a value from `principal.ts` would pull `server-only` into the client bundle and break the build. Scored:

| # | Candidate | Correctness | Story fidelity | Client-safety | Cycle risk | Cost | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | `pat.ts` imports `ALL_CAPABILITIES` from `principal.ts` | 1 (breaks build) | 5 | 1 | 3 | 4 | 14 |
| B | Define in `pat.ts`, re-export from `principal.ts` | 5 | 4 | 5 | 4 | 5 | 23 |
| ***C**** | ****Neutral ****`lib/api/capabilities.ts`****, re-exported from both**** | ****5**** | ****4**** | ****5**** | ****5**** | ****4**** | ****24*** |
| D | Leave both, assert equality in a test | 3 | 1 | 5 | 5 | 5 | 19 |

***C chosen.**** B and C both work; C wins the tiebreak on ownership. `ALL*CAPABILITIES` means "the capability vocabulary", consumed by the cookie rail, the PAT rail **and** the gateway union — under B the type every one of the 87 routes depends on would be owned by the token-**minting* module, and `handler.ts` would import its core type from `pat.ts`. `principal.ts` keeps exporting `ALL*CAPABILITIES` (re-export), so every existing import site is untouched. A is not a real option: it does not build.

***D2 — ****`cookie-only`**** carries a ****`why`****.**** Ruling `12195`'s sketch wrote `{ auth: 'cookie-only' }` with no field. The two lifted routes today throw **different** messages ("cannot issue tokens" vs "cannot revoke tokens"); a bare posture collapses both into one generic string, which is a small but real behaviour change on a Story whose DoD says there is none. Adding `why: string` and using it as the 403 detail preserves both messages verbatim, and makes a cookie-only route state its reason in the snapshot exactly as `authenticated` does. This is an extension of an illustrative code sketch, not a reversal of the decision it illustrates — the ruled decision is **"lift the hand-rolled bearer rejection into the gateway as a first-class **`cookie-only`** posture"*, which is unchanged.

***Migration******:****** NONE.**** Re-confirmed against the code, not inherited: the sweep introduces no fifth scope value, so the CHECK at `supabase/migrations/0008*access*tokens.sql:34-36` is untouched and no minted token is invalidated. ****RPC-authorization gate******:****** assessed, NOT engaged*** — this Story writes no Postgres function and adds no function taking a caller-supplied identity or scope parameter. The entire change is read-time, in `requireCapability`.

## Steps

1. `lib/api/capabilities.ts` — single `ALL_CAPABILITIES` + `Capability`, zero deps, client-safe.
2. `lib/api/handler.ts` — the discriminated union, mandatory `options`, `cookie-only` enforcement.
3. `lib/api/principal.ts` / `lib/api/pat.ts` / `IssueTokenModal.tsx` — collapse the duplicated vocabularies.
4. `cookie-only` lift on the two token routes; declared no-capability posture on `GET /tokens`.
5. Migrate all 85 gateway call sites to the posture-declaring shape.
6. `route-capability-coverage.test.ts` + committed snapshot incl. the 2 bypassers.
7. Verify: tests -> types -> lint, and diff against the recorded baseline.

## Test strategy

The coverage test is pure-filesystem, so it runs without credentials — unlike `rls-parity` / `auth-coexistence` / `traceability`, which `describe.skip` without live Supabase. ***All four Supabase variables are present in this run's ****`.env`****, so the credential-gated suites genuinely execute here*** and AC-04 / AC-05 / AC-06 are really exercised rather than skipped.

AC-04 / AC-05 / AC-06 already pass against today's code. They are ***non-regression guards*** on the all-call-site migration, not new behaviour. This is the only Story that touches all 87 call sites, so it is the only one that can break them — they are not removed as "already green". Success is the full suite returning to exactly the recorded baseline (1546 pass / the same 1 pre-existing failure), which is what "no behaviour change" means operationally.

## Review Workload Forecast

Estimated: ~720 additions + ~85 deletions = ~805 total lines
400-line budget risk: High
Chain strategy: size-exception
Decision trace: Q1=Yes (the diff is dominated by 85 one-line mechanical posture annotations plus a generated 87-row coverage snapshot; the designed surface — the union, the vocabulary module, the parser and the cookie-only lift — is ~330 lines) · Q2=n/a · Q3=n/a -> size-exception
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md)

Size-exception override: this Story ***is already the product of a size split***. The AI Product Owner's 2026-08-17 ruling scored splitting BK-262 five ways (candidate D, 20) against three ways (candidate C, 29) and ruled three, isolating this Foundation precisely because it is "the only slice touching all 68 route files" and must stay "independently revertible". Splitting it again would contradict a published ruling, and the type change cannot be partially applied — `options` becomes mandatory in one commit or the intermediate state does not compile.

---
_Synced from Jira by sync-jira-issues_
