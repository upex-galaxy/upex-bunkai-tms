# BK-571 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-571)

- ***Archiving a Test**** — the same requirement `BK-039` also covers Tests, but a Test has no archive state at all today, so it needs its own storage change plus a sweep of every place Tests are read. It is a ****sibling story for a future run*** and is deliberately not folded in here. No ticket is created for it by this story.
- Archiving a Module, a User Story or an Acceptance Criterion — each already shipped its own archive behaviour; nothing in this story changes them
- Permanent deletion of an ATC — `BK-039` reserves hard-delete for a separate administrative path with its own confirmation, which this story does not build
- Bulk archive or bulk restore across a selection of ATCs — this story archives and restores one ATC at a time; bulk actions on ATCs are the separate bulk-edit story
- Automatic archiving — no age rule, no usage rule, no scheduled sweep; archiving is always an explicit human action
- Cascading the archive to anything else — archiving an ATC never archives, edits, or removes a Test, a Test chain step, a Run, an Acceptance Criterion, or a Defect
- Retention, purge windows, or an "empty the archive" action
- Any change to how ATCs are created, edited, duplicated or propagated — those stay with their existing stories
- Exporting or reporting on archived ATCs
- Building the workspace-wide ATC index (BK-439) or wiring archive into it — that screen is not built yet, and this story does not depend on it. When it ships it simply inherits the same reuse-surface rule stated in the business rules.

---
_Synced from Jira by sync-jira-issues_
