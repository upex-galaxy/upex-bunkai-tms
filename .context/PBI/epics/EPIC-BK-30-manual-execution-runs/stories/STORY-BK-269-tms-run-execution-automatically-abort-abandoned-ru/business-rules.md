# BK-269 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

## Recommended approach

A scheduled sweep periodically looks for Runs sitting in "running" status with no recent step activity, and closes each qualifying one as "aborted", carrying a system-generated reason that reads distinctly from a reason a person typed. This reuses the abort capability a QA Engineer already has today instead of inventing a new Run lifecycle state, so every existing consumer of Run status — the Home active-runs widget, Run history, run reporting, time-to-green, and Test Plan progress — keeps working unchanged, and starts reporting numbers that reflect reality instead of Runs someone forgot to close.

## Alternatives considered and rejected

| Alternative | Why it was rejected |
| --- | --- |
| Add a new "abandoned" Run status | Ripples through every place the product reads or displays a Run's status today — the Home widget, Run history, reporting, time-to-green, Test Plan progress — each of which would need to learn the new value. Reusing "aborted" with a distinguishable reason gives the same signal without touching any of them. |
| UI-only "stale" indicator that never mutates the Run | The Run keeps counting as "running" everywhere it is read, so it does not fix the corrupted dashboard, coverage, or progress numbers — it only decorates the Run for someone who happens to look at it directly. |

## Open questions for the PO

- What should the inactivity threshold be? An early product-journey note mentions a 4-hour default as an initial intent, not a ratified decision — needs PO confirmation before this ships.
- Should the threshold be configurable per Workspace, per Project, or fixed globally for every Workspace?
- Should a Run's owner be notified when their Run is closed by the sweep, now that notifications exist for a Run finishing or being aborted?

---
_Synced from Jira by sync-jira-issues_
