# BUG: BK-20: bunkai_search_atcs does not return a member's own ATC — 2 isolation assertions fail on staging

**Jira Key:** [BK-401](https://jira.upexgalaxy.com/browse/BK-401)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Summary

Two assertions in `lib/atcs/search-isolation.test.ts` (BK-20) fail against the current shared Supabase project: an active workspace member searching a word taken from ***their own ATC*** does not get that ATC back from `bunkai*search*atcs`.

Found incidentally while running the full suite during BK-400. ***Not caused by BK-400*** — confirmed below.

## Steps to Reproduce

1. Check out `staging`.
2. `bun test lib/atcs/search-isolation.test.ts`

## Actual Result

```
(fail) BK-20 — bunkai*search*atcs workspace + project isolation
       > an active member searching a word from their own ATC finds it (AC S6.1)
(fail) BK-20 — bunkai*search*atcs workspace + project isolation
       > a different project_id never returns the first project's ATCs (project scope)

3 pass, 2 fail
```

Both fail on the same shape — `lib/atcs/search-isolation.test.ts:100` and `:197`:

```
expect(((own.data ?? []) as SearchItem[]).some(i => i.id === seed.atcId)).toBe(true);
Expected: true
Received: false
```

`own.error` is null, so the RPC succeeds and simply returns no row for the seeded ATC.

## Expected Result

A member searching a token drawn from an ATC in their own workspace and project gets that ATC back. That is the positive half of the isolation contract — the negative half (other workspaces / other projects return nothing) still passes, which is why this reads as a false-negative rather than a leak.

## Not a BK-400 regression — evidence

Confirmed pre-existing, not introduced by the auth work:

- The failing file and the `bunkai*search*atcs` RPC are untouched by BK-400, which only changes `app/auth/***`, `lib/auth/***` and `package.json`.
- Re-ran the file with the BK-400 changes ***stashed*** (base branch code): the same two assertions still fail, 3 pass / 2 fail, identical output.

## Impact

- No data leak. The isolation assertions that guard cross-workspace and cross-project exposure still pass; only the "you can find your own thing" direction fails.
- If it reflects real runtime behaviour rather than a test-seeding issue, ***ATC full-text search returns nothing for legitimately matching ATCs***, which would make the Projects toolbar search look broken to a user.
- The suite has been red for these two for some time and nothing surfaced it, because there is no `test` script wired into `repo:check` — BK-400 added `"test": "bun test"`, so this is now runnable by name.

## First thing to check

Whether the seeded ATC is actually indexed at the moment the RPC runs — i.e. whether the search vector is populated synchronously on insert or by a trigger the test does not wait for. If indexing is asynchronous, the test is racing and the fix is in the test; if it is synchronous, the RPC's filter is wrong and the fix is in the migration that defines `bunkai*search*atcs`.

---

## Metadata

- **Created:** 8/12/2026
- **Updated:** 8/12/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** atc, search, test-failure

---

_Synced from Jira by sync-jira-issues_
