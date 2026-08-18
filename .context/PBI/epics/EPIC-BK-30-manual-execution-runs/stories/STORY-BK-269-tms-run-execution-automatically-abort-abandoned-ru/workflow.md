# BK-269 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

On a recurring schedule, the sweep looks across every Workspace for Runs currently sitting in "running" status.

For each candidate Run, it checks how long it has been since that Run's last recorded step activity — or since the Run started, if no step has been recorded yet.

A Run whose idle time exceeds the configured inactivity threshold is closed: its status becomes "aborted", it carries a system-generated reason distinguishable from one a person would type, and its still-pending chain positions and steps are resolved the same way a person's abort already resolves them.

A Run with recent step activity, or a Run already closed — whether it passed, failed, or was aborted by a person or by an earlier sweep — is left exactly as it is.

Once a Run is closed by the sweep, it immediately stops appearing in the Home "active test runs" widget's list and count, and its entry in Run history now reflects the closure the same way it reflects any other closed Run.

---
_Synced from Jira by sync-jira-issues_
