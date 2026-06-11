# BK-33 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-33)

1. I open a Test such as "Checkout - Guest Purchase" and go to its tags.
2. I type or pick tags — reserved suite tags like "smoke" or "regression" plus custom ones like "checkout-v2" — and save.
3. The Test now displays the tags I assigned, with reserved suite tags recognized for filtering.
4. Later, from the list of Tests, I filter by the "smoke" suite and see only the Tests carrying that tag.
5. When priorities change, I replace the Test's tag set; its grouping and filtering update to match the new tags immediately.
6. If a Test should leave every suite, I remove all of its tags; it stays intact and runnable but no longer shows under any tag filter.
7. If I filter by a tag no Test carries, I see a clear empty result and adjust my filter.

---
_Synced from Jira by sync-jira-issues_
