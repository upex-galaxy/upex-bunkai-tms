# BK-225 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-225)

- ***Mode is derived, never entered***: a run's execution mode comes from its executor — human executor means Manual; agent or CI executor means Automated. No one edits mode.
- ***Mode is fixed at run creation*** and immutable afterwards, consistent with run-history immutability.
- ***Totals***: per-mode totals count runs consistently with the existing pass/fail totals; aborted runs keep their mode and are counted the way aborted runs are counted today.
- ***Visibility***: read-only reporting — every workspace role that can view runs (viewer and higher) sees badges, filters, and totals.

### Design intent

- Badge reuses the existing pill/chip component family from the runs views (same shape as verdict chips): neutral tone for "Manual", accent tone for "Automated".
- The mode filter joins the existing filter row of the project runs view; per-mode totals extend the existing summary strip rather than adding a new panel.
- Run detail header shows the mode badge beside the verdict chip.
- Empty states reuse the current runs-view empty-state component with mode-specific copy.

---
_Synced from Jira by sync-jira-issues_
