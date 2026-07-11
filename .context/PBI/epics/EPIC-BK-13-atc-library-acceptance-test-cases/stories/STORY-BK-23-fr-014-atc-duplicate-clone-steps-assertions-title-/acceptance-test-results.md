# BK-23 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-23)

BK-23 TEST RESULTS
Tested: 2026-06-28
Environment: Staging
Tester: Benjamin Segovia
Result: FAILED (14/18 TCs — 1 FAILED, 2 BLOCKED)

SUMMARY
  ATC Duplicate feature (FR-014) tested on staging.
  API endpoint POST /atcs/{id}/duplicate is fully functional.
  Two defects prevent DoD sign-off:

- BUG-2 (MAJOR): No UI Duplicate action exists in ATC detail or explorer.
- BUG-1 (MEDIUM): API body field mismatch — spec says new_title, impl reads title.

TEST CASES
  TC01: Happy path — POST no body, steps + assertions copied ... PASSED
  TC02: 0-step ATC duplicate ... BLOCKED (UI enforces min 1 step; test data unavailable)
  TC03: 0-assertion ATC duplicate ... BLOCKED (same constraint as TC02)
  TC04: Step content preserved (same text, new IDs) ... PASSED
  TC05: Assertion content preserved (same text, new IDs) ... PASSED
  TC06: Source title 198 chars, default title 204 chars, expect 422 ... PASSED
  TC07: No body — default title = source + (copy) ... PASSED
  TC08: Empty body — default title applied ... PASSED
  TC09: Slug freshly computed on copy (not cloned) ... PASSED
  TC10: Custom title via title field ... PASSED
  TC11: Custom title via new_title field (per spec FR-014) ... FAILED — BUG-1
  TC12: Title 3 chars min boundary ... PASSED
  TC13: Title 2 chars below min, expect 422 ... PASSED
  TC14: Title 200 chars max boundary ... PASSED
  TC15: Title 201 chars above max, expect 422 ... PASSED
  TC16: No auth header, expect 401 ... PASSED
  TC17: Non-existent source_id, expect 404 ... PASSED
  TC18: Edit copy step, original step unchanged ... PASSED

TEST DATA
  ATC: Login happy path (created via API during session)
  Workspace/Project/Module/UserStory/AC hierarchy built via API on staging

BUGS FOUND
  BUG-1 (MEDIUM): ATC Library: Duplicate: API field name mismatch — new_title silently ignored
  BUG-2 (MAJOR): ATC Library: Duplicate: No UI Duplicate action — feature has no UI entry point

OBSERVATIONS
  DB leg BLOCKED: staging-dhhub MCP not configured (DBHUB_* vars empty in .env).
  DB integrity verified indirectly via API response payloads and UI navigation.
  TC02/TC03 BLOCKED: 0-step test data cannot be created via UI; needs dedicated setup.
  TC06: 204-char default title correctly rejected with 422 validation_failed.

RECOMMENDATIONS

1. Implement UI Duplicate action (BUG-2) — DoD blocker, Priority 1.
2. Align API field name: new_title vs title (BUG-1) — Priority 2.
3. Configure staging-dhhub MCP (DBHUB_* env vars) to enable DB leg.
4. Stage 5 automation candidates: TC01 (happy path), TC06 (boundary), TC16 (auth), TC18 (isolation).

---
_Synced from Jira by sync-jira-issues_
