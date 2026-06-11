# BK-28 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

## User flow

1. Elena opens a Test she previously created (or one a teammate created in her workspace).
2. The Test detail view shows the current ATC chain in order, with drag handles next to each ATC (visible only if Elena has reorder permission).
3. Elena drags an ATC up or down to a new position. The UI gives immediate visual feedback as she drops.
4. She continues reordering until the sequence matches the User Story flow she is verifying.
5. She clicks "Save".
6. The system checks for conflicts — has anyone else reordered this same Test since Elena opened it?

- If yes: the save is blocked with a message showing the current order; Elena reviews and decides whether to keep her change or accept the teammate's.
- If no: the new order is committed.

1. If the order Elena submitted is identical to what was there before, the system saves no change — no activity log entry, no last-modified bump.
2. If the order actually changed, the activity log of her workspace shows the new chain alongside her name and a timestamp.
3. From here, anyone who opens the Test later will see the updated chain, and any subsequent Run will execute the ATCs in the new order — covered by the Manual Runs epic (BK-006).

## Note for the AI-agent and CI-agent path

When an agent reorders a Test through the Bunkai headless surface instead of the UI, the same business rules apply: same permission gate, same no-op detection, same concurrent-edit guard, same activity-log entry. The agent provides the Test identifier + the new chain order + a retry-safe identifier. There is no "agent-only" reorder path.

---
_Synced from Jira by sync-jira-issues_
