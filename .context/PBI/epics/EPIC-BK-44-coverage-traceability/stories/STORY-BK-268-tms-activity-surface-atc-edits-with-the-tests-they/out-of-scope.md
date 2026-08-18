# BK-268 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-268)

- Notifying watchers of an affected Test about the ATC edit — this story only covers the activity feed entry. Whether an edit should also trigger a notification is an open question recorded for the PO, not decided by this story.
- Any guardrail that blocks or warns about an ATC edit based on how a referencing Test is expected to behave (a "layer compatibility" style check) — no such policy exists in the product today, and introducing one is out of scope here.
- Changing how the set of affected Tests for an edit is calculated, or which Tests count as "affected" — this story surfaces that existing calculation, it does not change it.
- Changing what happens when an ATC is created, duplicated, or archived — only the edit case is in scope.
- Any new screen, page, or navigation entry point. This story extends the existing workspace activity feed with a new kind of entry; it does not introduce new UI surface.
- Deciding the exact visual treatment for an entry with a very large number of affected Tests — recorded as an open question for the PO, not answered here.

---
_Synced from Jira by sync-jira-issues_
