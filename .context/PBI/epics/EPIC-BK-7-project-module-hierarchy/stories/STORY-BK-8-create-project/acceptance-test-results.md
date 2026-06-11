# BK-8 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

## Acceptance Test Results (ATR) — BK-8

***Verdict: FAILED — NO-GO.*** Date: 2026-06-04 · Env: staging · Modality: Jira-native · Tester: QA (automated session).

Core input validation, auth, membership, duplicate handling, description-size, slug derivation, DB integrity and the create UI all PASS against the as-built contract. Two Major defects + one Minor block sign-off.

### Coverage

| Area | Result |
|------|--------|
| Happy path 201 + slug | PASS |
| Name validation (min 3 / max 80 / alphanumeric / boundaries) | PASS (422 validation_failed) |
| Duplicate slug same workspace | PASS (409 conflict) |
| Same slug different workspace | PASS (201) |
| Non-member / ghost workspace | PASS (403 forbidden, enumeration-safe) |
| Unauthenticated / bad UUID / invalid JSON | PASS (401 / 400 / 400) |
| Description size (5120 ok / 5121 rejected) | PASS (byte-exact) |
| Slug derivation (accents, punctuation, emoji, 40-char truncation) | PASS |
| DB integrity (per-workspace uniqueness) | PASS |
| Create UI + live slug preview + list refresh | PASS |
| Reserved slugs (AC-11) | ***FAIL*** |
| Detail route workspace scoping (Workflow AC step 9) | ***FAIL*** |
| i18n names | ***FAIL (minor)*** |
| Viewer role 403 | DEFERRED (no viewer user; verified by code + RLS) |

### Defects raised

- BK-54 — Reserved project slugs are not rejected (AC-11) — created with HTTP 201
- BK-55 — Project detail route /projects/{slug} is not workspace-scoped
- BK-56 — Non-Latin (CJK/Cyrillic) project names rejected as name*no*alphanumeric

### Notes

- As-built error model is `422 validation_failed` (the original ATP assumed `400`); test assertions updated accordingly. This is acceptable.
- Post-create UI stays on `/projects` instead of navigating to the project (Workflow step 9) — PO-acknowledged MVP, not a defect.
- Story intentionally left in ***In Test*** pending the fixes above (defects originate from this story, not a pre-existing blocker).

---
_Synced from Jira by sync-jira-issues_
