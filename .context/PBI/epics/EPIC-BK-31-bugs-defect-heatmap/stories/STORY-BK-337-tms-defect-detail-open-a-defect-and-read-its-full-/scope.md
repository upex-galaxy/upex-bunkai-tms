# BK-337 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

- A read-only single-defect detail route at `/projects/[projectSlug]/bugs/[bugId]`
- A header showing the defect's id, severity, status, title, full module path, and who filed it and when
- The defect's description
- Steps to reproduce as a numbered list
- An evidence list showing the count against the ten-attachment cap, with each row open-able
- A right-rail Details panel summarizing exactly severity, status, module path, reporter, filed date, and assignee
- Origin cross-links from the defect to the originating ATC, the run it came from, and the failing run step
- Turning the defects list's Bug and Run cells into links that open this detail record (today the Run reference renders as plain text with no link)

> ***INFO:*** Corrected 2026-08-14 to match the 2026-08-11 Product Owner and Tech Lead shift-left rulings on this story: Q1 cuts Expected vs Actual, Q2 drops layer and environment from the Details panel and adds assignee, and TQ1 drops the in-list failing-step highlight. The story shipped without these three items.

---
_Synced from Jira by sync-jira-issues_
