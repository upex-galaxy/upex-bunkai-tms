# BK-399 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-399)

- The test-design technique is one of Equivalence Partitioning, Boundary Value Analysis, State Transition, Decision Table, or Pairwise, or left unspecified
- The priority is one of Critical, High, Medium, or Low, or left unspecified
- Both fields are optional; an ATC with neither set is a fully valid ATC
- An ATC that existed before this story shipped shows as "not specified" for both fields, never a default technique or priority
- A technique or priority filter combines with every other active filter on the same list using AND semantics, consistent with the existing filter model
- Changing an ATC's technique or priority is an ordinary header edit and follows the same edit/versioning rule as changing its layer or tags
- Duplicating an ATC carries its technique and priority to the copy, consistent with how duplicate already carries layer and tags
- An unrecognized technique or priority value arriving through the API is rejected, not silently coerced to unspecified

---
_Synced from Jira by sync-jira-issues_
