# DEFECT: ATC Library: Duplicate: API field name mismatch — spec says new_title, implementation reads title

**Jira Key:** [BK-184](https://jira.upexgalaxy.com/browse/BK-184)
**Related Story:** [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions
**Priority:** Medium
**Status:** Closed
**Components:** None
**Severity:** Moderada
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

_No description provided_

---

## 🐞 Actual Result

POST /api/v1/atcs/{source*id}/duplicate with body {"new*title":"Custom Title"} returns HTTP 201 but the created ATC has the default title "{source} (copy)". The new_title field is silently ignored with no error signal.

---

## ✅ Expected Result

The new_title field is accepted and used as the title of the duplicated ATC, as documented in FR-014. The created ATC should have title "Custom Title" not "{source} (copy)".

---

## 🔍 Root Cause

**Category:** Requirement Error

---

## 🚩 Workaround

Use the field name `title` instead of `new_title` in the POST /atcs/{id}/duplicate request body.

---

## Related Issues

- causes: [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions

---

## Metadata

- **Created:** 6/28/2026
- **Updated:** 8/3/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** atc-library, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
