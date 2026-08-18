# BK-226 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

- Result formats beyond JUnit XML (TAP, Allure, JSON reporters) — future format adapters
- Direct API submission and streaming — sibling stories own those paths
- Auto-creating Tests, ATCs, or environments from report contents — the Test must already exist; the report maps onto it
- Automatic pipeline polling or repository-host integrations that fetch reports on their own — upload is initiated by the user or their pipeline script
- Scheduling or orchestrating test runners — excluded epic-wide
- Editing a created run to fix a bad mapping — finished runs stay immutable; re-upload creates a new run

---
_Synced from Jira by sync-jira-issues_
