# BK-268 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

Elena, a Senior QA Engineer, relies on a Test called "Regression Suite" that chains a login ATC among others. A teammate opens that ATC in the app's own editor and tightens the expected error copy on a failed-login step, then saves.

Later that day, an integration script also patches a different ATC's tags through the product's API as part of a bulk cleanup.

Elena opens the workspace activity feed — the same feed BK-49 already ships — to catch up on what changed while she was heads-down on another Test. She now sees two new entries she would not have seen before this story: one for the teammate's in-app edit, one for the integration's API edit. Each entry names who made the change and which ATC changed. The entry for the login ATC also tells her "Regression Suite" and "Smoke Suite" are among the Tests affected, so she knows to re-check those before her next run instead of finding out only when a run behaves unexpectedly.

An ATC with no Tests chained to it is edited elsewhere in the workspace; its entry still appears in the feed, just without any affected Tests listed, so Elena's picture of "what changed today" stays complete even for ATCs nobody has wired into a Test yet.

Meanwhile, an automation script that only wants Run-related events explicitly asks the feed for just those event types — it does not see the ATC-edit entries, because the feed still honors an explicit request that leaves them out.

---
_Synced from Jira by sync-jira-issues_
