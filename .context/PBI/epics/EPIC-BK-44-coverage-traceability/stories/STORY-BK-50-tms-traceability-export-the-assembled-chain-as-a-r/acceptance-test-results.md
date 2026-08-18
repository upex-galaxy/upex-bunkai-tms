# BK-50 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-50)

# Acceptance Test Results — BK-50

***Environment****: staging (`https://staging-upexbunkai.vercel.app`) · ****Build****: PR #145, merge `7b16c0c` · ****Date****: 2026-08-09 · ****QA***: Benjamin Segovia

## Summary

 — ***21 of 23 executed, 0 FAILED, 2 BLOCKED***. Two non-blocking findings filed. Sign-off is not gated on either.

Smoke: ***GO***. Export control present on the traceability screen, chain rendered, download fired on first click.

Every fidelity verdict below was made by opening the downloaded document, not by observing that a download occurred. One assertion was made with all network traffic aborted at the browser context, to prove self-containment rather than assume it.

## Test cases

| TC | Title | Status |
| --- | --- | --- |
| TC-BK50-01 | Populated story exports every AC/ATC/Test/Run/Defect visible on screen | PASSED |
| TC-BK50-02 | Header carries workspace, project, story identity + export timestamp | PASSED |
| TC-BK50-03 | All six run states render as readable labels | PASSED (5 of 6 states available in seed data — see Observations) |
| TC-BK50-04 | ATC bound to two ACs repeats under each, no dedup | PASSED |
| TC-BK50-05 | Multiple defects listed with title and status | PASSED (with finding — see Observations) |
| TC-BK50-06 | "Awaiting data" placeholder carried into the file, not a blank cell | PASSED |
| TC-BK50-07 | Uncovered AC carries its indicator, distinct from the placeholder | PASSED |
| TC-BK50-08 | File is self-contained — renders offline, zero external requests | ********PASSED — priority item, clean**** |
| TC-BK50-09 | Foreign-workspace story rejected, no file produced | BLOCKED — coverage gap |
| TC-BK50-10 | Nonexistent story returns the same response as TC-09 | ********PASSED — priority item, clean**** |
| TC-BK50-11 | Export at T0 survives a later mutation of the live chain | ********PASSED — Critical, clean**** |
| TC-BK50-12 | Printed timestamp matches the export moment | PASSED |
| TC-BK50-13 | Two exports in quick succession produce two independent files | PASSED |
| TC-BK50-14 | Same-minute exports — filename granularity boundary | PASSED WITH FINDING (BK-330 filed) |
| TC-BK50-15 | Zero-AC story exports prose, not an empty table | PASSED |
| TC-BK50-16 | Zero-coverage story is distinct from the zero-AC case | PASSED |
| TC-BK50-17 | No-coverage prose carries the export timestamp | PASSED |
| TC-BK50-18 | Downloaded file survives loss of the source story | PASSED (by construction — see Observations) |
| TC-BK50-19 | Signed-out browser redirects to login, no data rendered first | ********PASSED — priority item, clean**** |
| TC-BK50-20 | Unauthenticated API caller receives 401 | ********PASSED — priority item, clean**** |
| TC-BK50-21 | No hosted artifact, public link, signed URL or share control | ********PASSED — scope guard**** |
| TC-BK50-22 | Chain-assembly failure surfaces a clear error, no partial file | BLOCKED — pre-declared at planning |
| TC-BK50-23 | Filename matches the D26 pattern | PASSED |

## Test data

Reused the fixtures seeded during the BK-45 session rather than re-seeding, per the ATP. Project `BK-23 Test Project` (`129cbc2a-…`), module `bk-45-fixtures`.

| Fixture | Story | Used for |
| --- | --- | --- |
| Fully covered, 2 ACs / 5 ATCs / 4 tests / 3 runs | `d57804e8-…` | TC-01..04, 06, 08, 11..14, 23 |
| Zero-coverage banner (1 AC, 0 ATCs) | `d6e3c9f4-…` | TC-16 |
| Zero-AC authoring gap | `b977a5b9-…` | TC-15, TC-17 |
| Mixed coverage + 3 defects + fail/pass/running runs | `27223d20-…` | TC-03, 05, 07 |

***Mutation performed and reverted.*** TC-11 required the live chain to change between two exports. The story title of `d57804e8-…` was amended via `PATCH /api/v1/user-stories/{id}`, the second export taken, and the title restored to its exact original value in the same session. The fixture is intact; no run, ATC, Test or defect was touched.

## Findings filed

- ********BK-329 (Defect, Menor)**** — the traceability route ignores its `{projectId}` path segment: any well-formed UUID returns the requested story's chain with `200 OK`. Not a proven leak (the story stays RLS-scoped to the caller, and BK-45's isolation suite covers the cross-workspace case), but the project segment enforces nothing, so an authorization bug in the story-scoping layer would have no second gate behind it. The UI route is unaffected — it correctly 404s on a bogus slug. Originates in BK-45's route, found here because BK-50 reuses it verbatim.
- ********BK-330 (Mejora, Trivial)**** — the snapshot filename is minute-granular, so two exports of one story inside the same clock minute collide and their contents are byte-identical. Not an AC violation: AC2.2 asks only that two independent files exist, and browser download de-duplication delivers that. It is filed because the dev handoff's own suggested check asks QA to confirm "different timestamps in the name", which cannot hold at this granularity. Recommended fix is seconds precision — a one-line change that preserves everything D26 ratified.

## Observations — no ticket filed

- ***Defect IDs are absent from the export.*** The Defects column renders title + status, no identifier. This is faithful to the live screen, which omits the ID too, so BK-50's AC1.1 ("every field visible on screen") holds and this is not a BK-50 defect. It is worth noting because BK-45's AC-01 says defects render with "their ID, title, and current status". If an auditor is expected to trace a defect back to Jira from the exported file, today they cannot. Raised for BK-45's owner to judge, not re-opened from here.
- `skipped`*** was the one run state no fixture could produce.*** Five of six derived states were exercised end to end — `pass`, `fail`, `blocked`, `aborted`, `running` — across two documents. No seeded chain resolves to `skipped` at the run grain, which is consistent with the grain split recorded under BK-317: `skipped` is a position-grain value. The mapping is covered at unit level by the green `chain-view.test.ts` guard.
- ***"1 ACs" reads ungrammatically*** in the meta line of a single-criterion story. Present on the live screen as well as in the export, so it is inherited, not introduced here. Cosmetic; not filed.
- ***TC-18 was proven by construction, not by deletion.*** The document issues zero network requests — verified with every non-`file:` request aborted at the browser context — so its readability cannot depend on the source story existing. A literal delete-then-open was not performed: the only candidate stories are load-bearing BK-45 regression fixtures, and no archive affordance is exposed through the API. The stronger property (no dependency on Bunkai at all) was demonstrated directly.

## Coverage gaps carried to regression (BLOCKED — not failures)

- ********TC-09***** (foreign-workspace story rejected) — no second workspace can be constructed. Settings → Members still reads "Coming soon", so there is no invite mechanism and no way to create an actor outside the current workspace. This is the same blocker BK-45 recorded against its TC-15. The case is covered by **`lib/traceability/story-traceability-isolation.test.ts`** at DB-integration level (11/11 green), so it is not unverified — it is unverified **end to end**. ******Re-attempt once the Members/invite feature ships.***
- ********TC-22**** (chain-assembly failure) — pre-declared BLOCKED at planning time. The traceability fetch executes server-side under SSR on Vercel, outside the browser context where request interception operates, and no fault-injection flag exists. Identical to BK-45's TC-21. Tooling gap, not a product gap.

## Verdict

***PASSED.*** All six Critical-priority cases are clean, including the immutability guarantee that is the story's central promise and the two non-disclosure paths. The two findings are non-blocking and neither contradicts an acceptance criterion. BK-50 is recommended for QA sign-off.

---
_Synced from Jira by sync-jira-issues_
