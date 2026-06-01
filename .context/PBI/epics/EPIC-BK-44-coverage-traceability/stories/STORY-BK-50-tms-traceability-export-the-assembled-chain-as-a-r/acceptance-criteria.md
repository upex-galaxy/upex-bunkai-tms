# BK-50 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-50)

```gherkin
Scenario: Export an evidence chain
  Given a user story with an assembled evidence chain
  When the QA Lead exports it
  Then a read-only snapshot is produced that contains the same chain shown on screen
```

```gherkin
Scenario: Snapshot reflects the moment of export
  Given an evidence chain that changes after an export
  When the QA Lead opens a previously exported snapshot
  Then the snapshot still shows the evidence as it was at export time
```

```gherkin
Scenario: Export an empty chain
  Given a user story with no coverage
  When the QA Lead exports it
  Then the snapshot states the story had no coverage at export time
```

---
_Synced from Jira by sync-jira-issues · 2026-06-01T07:51:49.558Z_
