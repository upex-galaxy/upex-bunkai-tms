# BK-512 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

A QA Lead who owns a workspace has been told to erase it — the client engagement ended and the contract says the records go. He opens Settings, then Workspaces, and finds the list of workspaces he belongs to. On the two rows he owns there is a ***Delete workspace*** action next to the Leave action he already knows. On the row where he is only a Member, there is no Delete action at all.

He picks the workspace to erase. A confirmation opens that names that workspace and nothing else, and tells him plainly what is about to happen: the workspace and everything inside it will be removed immediately, and it cannot be undone. Before he can commit, it offers to prepare an export of the workspace's data first — because once he confirms, there is nothing left to export. He takes the export, comes back, and returns to the same confirmation.

The confirmation will not act on his word alone. He has to type the workspace's exact name. A near miss keeps the destructive action out of reach, so a slip of attention on the wrong row cannot end the wrong workspace. He types it, confirms, and the workspace is gone — its Projects, its Tests, its Runs, its Bugs, its members' access to it, the Personal Access Tokens issued against it and the invites still outstanding.

He is not left staring at a shell pointing at something that no longer exists. Because he still belongs to another workspace, the app moves him there and says which one. Had that been his only workspace, he would have landed on onboarding instead, able to create or join another.

His teammates find out the same way anyone finds out a door is locked: the workspace is simply no longer in their list, and anyone who had it open is moved to one they still belong to. Nobody is stranded, and no one else's workspaces changed.

If the deletion had failed, he would have been told it failed, and the workspace would still be there in full — never half-erased.

---
_Synced from Jira by sync-jira-issues_
