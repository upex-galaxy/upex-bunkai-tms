# BUG: PATCH /modules/{id} combining rename+move is not atomic across the two rpc calls

**Jira Key:** [BK-57](https://jira.upexgalaxy.com/browse/BK-57)
**Priority:** Medium
**Status:** Closed
**Components:** Project & Module Hierarchy
**Severity:** Moderada
**Error Type:** Data
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

PATCH /api/v1/modules/{id} can carry name/description AND parent*module*id in one request; the handler runs two separate rpc() calls (bunkai*update*module + bunkai*move*module) that are not atomic across each other -- a failure in the second half-applies the first. The UI performs the operations separately so it is not currently triggered, but the API allows it. Either wrap both in one transaction/function or reject the combined request. Origin: BK-10/BK-11.

---

## 🔍 Root Cause

**Category:** Code Error

---

## Metadata

- **Created:** 6/4/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
