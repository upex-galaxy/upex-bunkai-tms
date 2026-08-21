# BUG: Add activity_log audit writes for module rename/move/soft-delete

**Jira Key:** [BK-59](https://jira.upexgalaxy.com/browse/BK-59)
**Priority:** Low
**Status:** Closed
**Components:** Bunkai Projects
**Severity:** Menor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

Structural module operations (rename, move, soft-delete cascade) do not write to activity*log – no audit trail of who changed the tree or when. The activity*log table exists (migration 0009) but writes were skipped for MVP. For a TMS, traceability of structural changes matters. Add activity_log writes to the module mutation routes. Origin: [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9)/[https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10)/[https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11](https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11). (tech-debt / improvement)

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
