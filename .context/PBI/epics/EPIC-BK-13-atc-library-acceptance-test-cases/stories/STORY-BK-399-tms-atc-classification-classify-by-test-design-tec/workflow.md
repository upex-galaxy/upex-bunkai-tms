# BK-399 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-399)

1. A QA Engineer such as Elena opens an ATC in its editor — the same surface where she already sets layer and tags.
2. Alongside those, she picks the test-design technique that produced this case (Equivalence Partitioning, Boundary Value Analysis, State Transition, Decision Table, or Pairwise) and how urgent it is (Critical, High, Medium, or Low).
3. Both stay optional: she can save without touching either, and any ATC that predates this story shows an explicit "not specified" state rather than a guessed default.
4. Later, working from the ATC list, she filters by technique or by priority, alone or stacked on top of the Project, Module, and layer filters that already narrow the list.
5. The values she set stick around after a reload, so the filter behaves the same way tomorrow as it did today.
6. What she gets out of it is a real read on how her suite's design techniques and priorities cover the feature, not just a raw ATC count.

---
_Synced from Jira by sync-jira-issues_
