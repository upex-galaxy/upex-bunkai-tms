# BK-572 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-572)

- ***Changing an existing member's role.*** Separable under INVEST, and it has a workable stopgap today (remove and re-invite at the new role). It is a deliberate sibling story for a future run, not a silent inclusion here
- ***Transferring ownership of a Workspace to another member.*** Migration `0044` deferred it, and the count-based Owner gate this story inherits means removal does not need it. An Owner who wants the Workspace to survive under someone else needs a transfer story, which does not exist yet
- ***Suspension as a distinct, reversible action.**** Removal must ****not*** be implemented as a suspended state — that unused status value is the obvious thing to reach for and it is the wrong answer here. Reversible deactivation that keeps the row, the role and the tenure is a different product action with its own blast radius and its own ticket
- ***Retrofitting the concurrency race that migration 0044 already documents and accepts.*** The new function guards itself, but `0044`'s own race stays as pre-existing debt and is filed separately — per ADR-0012 a story must not smuggle an unplanned security change into its diff
- ***Changing anything about leaving a Workspace (BK-90).*** Leave keeps its own action, its own endpoint and its own sole-owner block. This story adds a second, clearly distinct action beside it and touches neither
- ***Bulk removal***, removing several teammates in one act, or removing someone from a Workspace the caller does not administer
- ***Revoking Personal Access Tokens that are not scoped to this Workspace.*** They serve the holder's other Workspaces; touching them would let one tenant break access to unrelated tenants
- ***Deleting the removed teammate's account, or anything they authored.*** Authorship is preserved permanently and deliberately
- ***Warning the teammate in advance, or notifying them afterwards.*** No Notification is raised by this removal, including for the Bug unassignments it causes. Telling someone they were removed is a separate concern from removing them
- ***Any billing consequence beyond the Seat count self-correcting*** — no Subscription change, no proration, no Tier change
- ***A tenant-external audit record that outlives the Workspace.*** The Activity Stream entry lives inside the Workspace, like every other entry

---
_Synced from Jira by sync-jira-issues_
