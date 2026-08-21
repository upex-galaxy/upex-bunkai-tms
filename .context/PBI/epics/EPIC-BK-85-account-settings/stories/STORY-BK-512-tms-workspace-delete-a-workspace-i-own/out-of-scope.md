# BK-512 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

- ***A grace period, a recoverable "deleted" state, or any restore path.*** The deletion is immediate and irreversible by decision, not by omission — see the AI Product Owner decision comment on this story, which scores the alternatives. A grace period becomes a legitimate follow-up story once the product has a scheduled background-job mechanism to run the purge; it has none today
- ***Deleting a user account.*** The account outlives the workspace. `settings-account.html` draws a delete-account danger zone; that is a different act, a different blast radius, and a different story
- ***Transferring ownership of a workspace to another member.*** An Owner who wants the workspace to survive under someone else needs a transfer, not a delete. No transfer story exists yet; this story does not create one and does not pretend deletion substitutes for it
- ***A durable audit record of the deletion that outlives the workspace.*** The Activity Stream belongs to the workspace and goes with it, so the entry this story writes does not survive the deletion it records. A tenant-external audit log is a compliance capability of its own and is not smuggled in here
- ***Changing anything about leaving a workspace (BK-90).*** Leave keeps its own action, its own confirmation, and its own sole-owner block. This story adds a second, clearly distinct action beside it
- ***Bulk deletion***, deleting several workspaces in one act, or deleting a workspace the caller does not own
- ***Deleting anything smaller than a workspace*** — a Project, a Module, a Test — from this flow
- ***Warning the other members in advance, or notifying them afterwards.*** Notifications about an impending or completed deletion are a separate concern from performing it
- ***Any billing consequence of deletion*** — cancelling a subscription, prorating, or releasing seats. Billing is EPIC BK-224's territory

---
_Synced from Jira by sync-jira-issues_
