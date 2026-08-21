# BK-507 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-507)

- ***Bulk-editing an ATC's status.*** An ATC's status is its execution outcome (pass / fail / blocked / skipped / running / unrun), derived from Runs — it is not an authored attribute, and letting anyone hand-set it would fabricate evidence the traceability chain depends on. This is a deliberate departure from the literal field list in PRD US 8.2; see the AI Product Owner decision comment on this story
- ***Bulk delete, bulk archive, and bulk duplicate**** — this story delivers bulk **edit* only
- Bulk-editing an ATC's steps, assertions, or its User Story / Acceptance Criterion anchoring
- Bulk edit on the workspace-wide ATC index (`/atcs`) — that surface is not built yet (BK-439). The selection affordance built here is what that index inherits when it lands
- Bulk edit of Tests, Runs, or Bugs — the other entity types PRD US 8.2 names. Each needs its own story against its own screen
- ***ATC Priority*** as a bulk-editable field — the field is not shipped yet (BK-399). It is the natural fourth field once it is
- Selecting ATCs across more than one Project, or carrying a selection across a page change
- Undoing a completed bulk edit as one gesture

---
_Synced from Jira by sync-jira-issues_
