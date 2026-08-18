# BK-226 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

- "Upload CI results" flow in the project runs view: choose an existing Test and a Project Environment, upload a JUnit XML report
- Mapping preview before anything is created: report entries matched to the Test's steps, with unmapped entries and uncovered steps highlighted
- Explicit acknowledgement gate for unmapped entries — nothing is silently dropped
- Creates a finished automated run: per-step results from the report, verdict derived (any failure means failed; all passing means passed), uncovered steps recorded as blocked
- File validation with clear errors: supported format and size bounds
- Scripted upload path usable from a pipeline (authenticated with a Personal Access Token)

---
_Synced from Jira by sync-jira-issues_
