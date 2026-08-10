# BK-337 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

- A read-only single-defect detail route at `/projects/[projectSlug]/bugs/[bugId]`
- A header showing the defect's id, severity, status, title, full module path, and who filed it and when
- The defect's description
- Steps to reproduce as a numbered list, with the step that actually failed highlighted
- Expected vs Actual shown side by side
- An evidence list showing the count against the ten-attachment cap, with each row open-able
- A right-rail Details panel summarizing severity, status, module, layer, environment, reporter, and filed date
- Origin cross-links from the defect to the originating ATC, the run it came from, and the failing run step
- Turning the defects list's Bug and Run cells into links that open this detail record (today the Run reference renders as plain text with no link)

---
_Synced from Jira by sync-jira-issues_
