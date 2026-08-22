# BK-223 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-223)

- ***Authentication and role gate***: same contract as the single-call submission story — workspace-scoped Personal Access Token, member role or higher (roles: viewer < member < admin < owner).
- ***Lifecycle parity***: a streamed run follows the same rules as a manual run — only an in-progress run accepts step results; finishing requires the passed / failed verdict vocabulary; aborting requires a reason.
- ***Immutability***: once finished or aborted, the run is immutable.
- ***One effective result per step***: an idempotent retry returns the recorded result; a conflicting re-report of an already-reported step is rejected.
- ***Stale-run guard****: a streamed run with no step report for ****60 minutes*** is automatically marked stale/aborted with the reason "inactivity timeout". The reporting agent may not resume a stale-aborted run — it must start a new run. Any member or higher may still abort a quiet in-progress run from the run view before the timeout fires.
- ***Snapshot rule***: step content is snapshotted when the run starts, so later ATC edits never corrupt the in-flight run.

### Design intent

- Reuses the live run execution screen from manual runs: step checklist with status pills updating in place, progress summary, "In Progress" state chip.
- Run header carries the automated executor attribution ("Agent — <token name>").
- States: a "waiting for first result" state right after start; a stale-run notice with an abort affordance when the run goes quiet.

---
_Synced from Jira by sync-jira-issues_
