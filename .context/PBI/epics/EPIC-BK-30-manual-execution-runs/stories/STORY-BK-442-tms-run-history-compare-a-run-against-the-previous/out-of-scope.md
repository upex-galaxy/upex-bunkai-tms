# BK-442 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-442)

- Comparing two arbitrarily chosen Runs — this story compares a Run with the one immediately before it, nothing else
- Comparing Runs across different Tests
- Comparing Runs across different Projects or different Project Environments
- Alerting, notifications, or any subscription to new failures — this story delivers a read surface a person opens, not a push
- Flakiness scoring, trend lines, or any statistic computed over more than the two Runs being compared
- Changing what BK-37's Run history list shows or how it filters
- Changing what the Traceability chain (BK-45, BK-48) renders — it shows the latest Run result per row by design and stays that way
- Adding trend or prior-period delta to the project coverage report — its contract states it returns none, and this story does not change that
- Filing a Bug directly from a step identified as a new failure — a plausible follow-up, not this story
- Any change to how a Run is executed, marked, finished, or aborted

---
_Synced from Jira by sync-jira-issues_
