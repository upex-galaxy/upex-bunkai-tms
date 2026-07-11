# DEFECT: ATC Library: Duplicate: No UI Duplicate action — feature has no UI entry point on staging

**Jira Key:** [BK-185](https://jira.upexgalaxy.com/browse/BK-185)
**Related Story:** [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions
**Priority:** High
**Status:** Open
**Components:** None
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

_No description provided_

---

## 🐞 Actual Result

No Duplicate button, icon, context-menu entry, or any UI affordance exists in the ATC detail view or ATC explorer list. Full button scan via querySelectorAll returned no duplicate/clone/copy action. The API endpoint POST /api/v1/atcs/{id}/duplicate is fully implemented and functional.

---

## ✅ Expected Result

A 'Duplicate' action is available in one click in the ATC detail view or explorer list, as stated in User Story BK-23: 'duplicate an ATC with all its steps and assertions in one click'. The action calls POST /atcs/{id}/duplicate and redirects to the new ATC detail page.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🚩 Workaround

Call API directly: POST /api/v1/atcs/{source\_id}/duplicate with a valid bearer token. Available to dev/QA only — not a user-facing workaround.

---

## Related Issues

- causes: [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions
- is blocked by: [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions

---

## Metadata

- **Created:** 6/28/2026
- **Updated:** 7/6/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** atc-library, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
