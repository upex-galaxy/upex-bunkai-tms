# BK-337 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

- The detail record is read-only: no field on it can be edited, and no status-transition or assignment control appears on it
- A defect filed from inside a run shows its steps to reproduce as copied from that run at filing time, with the step that failed visually distinguished from the rest
- A defect filed standalone, outside any run, shows a quiet notice that it was filed manually, not an error state, and offers no origin links
- Evidence is listed up to the ten-link cap already enforced at filing time; the count is always shown against that cap
- A defect's full module path is always shown, not just the leaf module name, so defects filed under same-named modules in different parents are never confused

---
_Synced from Jira by sync-jira-issues_
