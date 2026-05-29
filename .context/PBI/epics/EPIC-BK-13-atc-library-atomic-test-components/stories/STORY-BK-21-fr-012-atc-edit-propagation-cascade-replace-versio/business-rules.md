# BK-21 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-21)

| Rule | Constraint |
| --- | --- |
| Propagation | Tests reference the ATC, so edits apply to all chaining Tests with no manual re-stitch |
| Versioning | Each saved edit produces a new version of the ATC |
| Anchors on edit | Changing Module / Story / Acceptance Criteria must still satisfy the ATC provenance and Module rules |
| Affected report | On save, the number of affected Tests is reported back |
| Scope | Only members of the owning Workspace can edit |

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.126Z_
