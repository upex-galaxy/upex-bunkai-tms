# BK-21 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-21)

# BK-21 — Acceptance Test Report

## Summary

- Date: 2026-06-16
- Environment: staging
- Mode: learning-mode sprint testing with user-approved `Ready For Dev` override
- Final QA verdict: CAUTION
- Release recommendation: do not treat this as formal Ready For QA approval until BK-21 is moved/deployed through the normal gate and the contract gaps below are accepted or fixed.

## Scope Executed

- API edit contract for `PATCH /api/v1/atcs/{id}`.
- DB verification for ATC versioning, steps/assertions replacement, AC links, and Test chain references.
- UI magic-link login.
- UI story/AC/ATC creation.
- UI ATC edit.
- UI Test Builder chain creation.
- Post-chain ATC edit visibility through live `test*steps.atc*id` linkage.

## Overall Results

| Area | Result | Notes |
| --- | --- | --- |
| API valid ATC edit | PASS PARTIAL | Version increments, but response only returns `{ atc }`; no affected Test count. |
| API optimistic conflict | PASS | Stale `X-If-Match` rejected with 409. |
| API malformed version header | PASS | Malformed `X-If-Match` rejected with 400. |
| API missing version header | FAIL / CONTRACT GAP | Missing `X-If-Match` accepted and increments version. |
| API anchor validation | PASS | AC outside story rejected with 422. Module/story reanchor payload ignored; stored anchors remain immutable. |
| UI auth | PASS PARTIAL | Magic-link works in same browser session; password signin returns 401 for configured UI user. |
| UI ATC create | PASS | ATC create uses `POST /api/v1/atcs` and enforces story + AC selection. |
| UI ATC edit | PASS PARTIAL | DB version increments, but UI uses Next Server Action `POST /projects/.../atcs/{id}`, not target `PATCH /api/v1/atcs/{id}`. |
| Test Builder chain | PASS PARTIAL | Test can chain ATC through `test*steps.atc*id`; no ATC version/snapshot field exists. |
| Propagation to chained Test | PASS PARTIAL | Chained Test sees updated live ATC title/version because it references ATC by ID. No affected count or version-specific snapshot behavior is present. |
| Historical Run snapshot preservation | NOT VALIDATED | Run snapshot path/field was not available in this test path. |

## Key Evidence

- API-created ATC: `6ca40721-7ae8-4076-a0ba-a1775d5d7635`, final version `4`.
- UI-created ATC: `a622398b-c4fe-4247-bdb4-198958af199a`, edited to version `3`.
- UI-created Test: `3476bacd-76e2-4168-9630-9e3ba1196321` / `BK21 propagation chain smoke`.
- UI-created Test step: `748dc0ee-695e-4032-ae05-b1333afb10ef`, `position = 1`, `atc_id = a622398b-c4fe-4247-bdb4-198958af199a`.
- UI Test Builder create request: `POST /api/v1/tests` returned 201.
- UI ATC edit request: `POST /projects/bk21-ui-20260615223920/atcs/a622398b-c4fe-4247-bdb4-198958af199a` returned 200 with `next-action` header.
- DB confirmed chained Test references current ATC title `Edit ATC propagates to linked tests v3` and current ATC version `3`.

## Scenario Verdicts

| ATP ID | Verdict | Evidence Summary |
| --- | --- | --- |
| BK21-T01 | PASS PARTIAL | Chained Test references live ATC by `test*steps.atc*id` and sees updated ATC title/version. Multiple-Test affected count not validated. |
| BK21-T02 | PASS PARTIAL | `test_steps` stores ATC references instead of copied step/assertion content, but stores no ATC version/snapshot reference. |
| BK21-T03 | PASS PARTIAL | API and UI edits increment version. API response shape lacks explicit top-level `version` / affected count. |
| BK21-T04 | PASS | Stale version rejected with 409. |
| BK21-T05 | FAIL / CONTRACT GAP | Malformed header rejected, but missing `X-If-Match` accepted. |
| BK21-T06 | FAIL / CONTRACT GAP | No affected Test count returned. |
| BK21-T07 | FAIL / CONTRACT GAP | Unused ATC save succeeds, but no `affected*test*count = 0` returned. |
| BK21-T08 | NOT EXECUTED | Forced transactional failure was not injected in staging. |
| BK21-T09 | PASS | Invalid AC outside selected story rejected. |
| BK21-T10 | PASS PARTIAL | Module/story reanchor payload ignored and anchors stayed immutable. Final mutability decision still needs documentation. |
| BK21-T11 | NOT EXECUTED | Incompatible layer/reference scenario not exercised. |
| BK21-T12 | NOT EXECUTED | Viewer/read-only user unavailable in this run. |
| BK21-T13 | NOT EXECUTED | Cross-workspace user unavailable in this run. |
| BK21-T14 | FAIL / CONTRACT GAP | API path has empty affected IDs in MVP; no affected Test event payload validated. |
| BK21-T15 | NOT VALIDATED | Historical Run snapshot domain/path was not available. |
| BK21-T16 | FAIL / CONTRACT GAP | Implemented behavior uses `X-If-Match`; missing header is accepted; response shape lacks affected count. |
| BK21-T17 | FAIL / CONTRACT GAP | UI did not show affected Test count after ATC edit. |
| BK21-T18 | NOT EXECUTED | UI stale-version conflict scenario not exercised. |

## Defects / Gaps To Raise

| Severity | Finding | Impact |
| --- | --- | --- |
| High | Missing `X-If-Match` accepted by API edit path | Allows edits without optimistic-lock protection unless intentional and documented. |
| High | No affected Test count in API/UI save response | BK-21 requires user-visible impacted Test count; UI cannot confirm scope of propagation. |
| High | UI edit bypasses `PATCH /api/v1/atcs/{id}` and uses Next Server Action | API contract and UI behavior can diverge; API automation may pass while UI uses a different code path. |
| Medium | `test_steps` lacks ATC version/snapshot reference | Live propagation works, but version-specific/historical snapshot behavior cannot be validated at Test chain level. |
| Medium | Historical Run snapshot preservation not available for validation | Critical acceptance risk remains unproven. |
| Low | Magic-link PKCE fails if opened in a different browser/session | Expected Supabase behavior, but relevant for QA setup and documentation. |

## Final Recommendation

CAUTION. BK-21 has a working core live-link chain path: Tests can reference an ATC through `test*steps.atc*id`, and edits to the ATC are reflected through that live reference. However, the story should not be considered fully accepted because required user-facing/API contract items are missing: affected Test count, documented/version-safe missing-header behavior, UI alignment with the target PATCH endpoint, and historical Run snapshot validation.

## Next Actions

- Confirm with Dev/PO whether missing `X-If-Match` should be rejected or officially supported.
- Add affected Test count to API response and UI confirmation.
- Align UI edit flow with `PATCH /api/v1/atcs/{id}` or explicitly document why Server Action is the intended path.
- Define historical Run snapshot model and expose a validation path.
- Re-run BK-21 formally when Jira status is `Ready For QA`.

---
_Synced from Jira by sync-jira-issues_
