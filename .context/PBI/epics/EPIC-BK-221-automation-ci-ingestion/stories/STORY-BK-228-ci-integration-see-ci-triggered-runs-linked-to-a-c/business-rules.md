# BK-228 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-228)

- ***Write-once***: CI metadata arrives with the run submission/upload and is immutable afterwards, consistent with finished-run immutability.
- ***All fields optional***: a run may carry any subset of commit reference, branch, pipeline name, and pipeline URL; display degrades per field.
- ***Link construction****: the commit link is built from the project's configured repository URL plus the commit reference; without a configured repository URL the commit shows as plain text. The pipeline URL is used exactly as provided. The repository/pipeline URL configuration lives in ****Project settings*** (per-project), not workspace settings.
- ***Validation bounds***: commit references and branch names are validated for sane length and shape at ingestion; invalid values are rejected with a clear message rather than stored broken.
- ***Visibility***: read-only metadata, visible to every role that can view runs (viewer and higher).

### Design intent

- Run detail header gains a compact "CI context" row: branch chip, monospaced short commit with an external-link affordance, pipeline name linking out.
- Runs tables show the branch chip as a secondary line on automated rows; the filter row gains a branch filter following the existing filter-control pattern ([https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) lineage).
- The CI context row simply does not render when a run has no metadata — no placeholder noise.

---
_Synced from Jira by sync-jira-issues_
