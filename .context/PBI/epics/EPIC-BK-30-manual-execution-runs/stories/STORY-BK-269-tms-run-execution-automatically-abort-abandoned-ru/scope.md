# BK-269 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

A scheduled sweep identifies Runs sitting in "running" status with no recorded step activity for longer than a configurable inactivity threshold, and closes each one automatically

The sweep closes a qualifying Run the same way an abort already closes one — the Run's status becomes "aborted", its still-pending chain positions and steps are resolved, and a reason is recorded — except the reason is system-generated, not typed by a person

The system-generated reason is visibly distinguishable from a reason a person typed when aborting a Run directly

The sweep runs across every Workspace in a single pass, and never closes a Run outside the Workspace it belongs to

The sweep is safe to run repeatedly — running it again against a Run it already closed, or against a Run already closed by a person or by a finish verdict, changes nothing

Once the sweep closes a Run, that Run immediately stops appearing in the Home "active test runs" widget's list and count, exactly as it already does for a human-aborted or finished Run

---
_Synced from Jira by sync-jira-issues_
