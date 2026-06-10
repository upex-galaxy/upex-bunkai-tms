# BUG: Add activity_log audit writes for module rename/move/soft-delete

**Jira Key:** [BK-59](https://jira.upexgalaxy.com/browse/BK-59)
**Priority:** Medium
**Status:** Open
**Components:** None
**Fix Type:** Bugfix

---

## Description

Structural module operations (rename, move, soft-delete cascade) do not write to activity*log -- no audit trail of who changed the tree or when. The activity*log table exists (migration 0009) but writes were skipped for MVP. For a TMS, traceability of structural changes matters. Add activity_log writes to the module mutation routes. Origin: BK-9/BK-10/BK-11. (tech-debt / improvement)

---

## Metadata

- **Created:** 6/4/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
