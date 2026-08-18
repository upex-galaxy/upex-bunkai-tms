# BK-227 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-227)

- ***Role gate***: changing the automation status requires the member role or higher (roles: viewer < member < admin < owner); viewers see it read-only.
- ***Default***: every new Test starts as manual-only.
- ***Transitions***: any status can move to any other status — three values, no enforced order — and every change lands in the history.
- ***History is append-only and immutable***: entries record author, timestamp, and the from/to pair; nothing is edited or deleted.
- ***Independence***: automation status is a property of the Test, independent from run outcomes, execution mode, and tags — reserved tags do not drive it and it does not drive them.

### Design intent

- Status badge reuses the existing pill component family (same visual language as test tags and verdict chips), one distinct tone per status.
- The library toolbar gains a status filter chip next to the existing tag filters; counts render in the filter control itself.
- On the test view, the status sits in the header as a badge that becomes a dropdown for member+; the status history renders in the test's side panel following the existing detail-panel pattern.
- No new screens; empty state unnecessary since every Test always has a status.

---
_Synced from Jira by sync-jira-issues_
