# BK-373 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

1. A defect Elena filed could not reach Jira — the destination was unreachable, or the credential had expired.
2. The defect is still fully usable in Bunkai. Opening it, Mateo sees the External tracker panel in the failed state, with the reason Jira gave and when it was attempted, and the reassurance that the defect is saved and will retry automatically once the connection is fixed in Settings.
3. There is no button for him to press. Bunkai keeps trying on its own, waiting a little longer between each attempt so it does not hammer a destination that is down.
4. When the destination comes back, or an administrator fixes the credential, the next attempt succeeds. The panel flips to the sent state, showing the Jira issue key as a way to open it and when it was sent.
5. If the failure is one that can never clear — the destination project does not exist — the attempts stop and the panel says why, so Mateo knows to fix it in Settings rather than wait.
6. If Jira was merely rate-limiting Bunkai, Mateo sees nothing at all: the defect is in flight, not failed, and it lands a little later.

---
_Synced from Jira by sync-jira-issues_
