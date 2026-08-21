# BK-512 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

- ***Only an Owner of the workspace may delete it.*** Viewer, Member and Admin never see the action — it is absent for them, not visible-and-refused. Admin is deliberately excluded: an Admin can administer a workspace, but ending its existence is an ownership act
- ***The action is scoped to the row it sits on.*** An Owner who owns two workspaces and belongs to a third sees the action on the two they own and nowhere else, and deleting one never affects the other
- ***The exact workspace name must be typed before the destructive action is available.*** A partial match, a case-varying match, or a leading/trailing-whitespace match does not unlock it. This mirrors the gate the Leave confirmation already applies
- ***The deletion is immediate and irreversible.**** There is no grace period, no recoverable state and no restore. The confirmation must say so in those terms ****before*** the Owner commits, because that warning is the only protection the act has
- ***An export is offered before the delete, never after.*** Once the workspace is gone its data cannot be exported, so the correct sequence is export-then-delete. The offer is a route out of the confirmation, not a precondition — an Owner who has already exported, or who does not want the data, is not forced through it
- ***Deletion removes the workspace's records; it never reaches outside the workspace.*** No record belonging to another workspace is touched, and no user account is deleted. A member of the deleted workspace who belongs to other workspaces keeps every one of them
- ***No member is left pointing at a workspace that no longer exists.*** Any member whose active workspace was the deleted one is re-pointed at a workspace they still belong to; a member left with none lands on onboarding
- ***Personal Access Tokens scoped to the deleted workspace stop working immediately***, exactly as if revoked. A PAT can never outlive the workspace it was issued against
- ***Pending invites to the deleted workspace stop working immediately.*** An invite that is accepted after the deletion must fail, and must fail without disclosing that the workspace ever existed
- ***A run in progress does not block the deletion.*** An Owner erasing a workspace is not made to wait on an execution; in-flight runs go with everything else
- ***Sole ownership does not block deletion — it is the normal case.**** BK-90 blocks a **leave* by the only Owner precisely so the workspace is never orphaned. Deletion has no orphan to prevent, so the same condition must not be reused as a refusal here. The two rules point in opposite directions on purpose
- ***A deletion that fails leaves the workspace exactly as it was.*** Partial deletion is not an acceptable outcome: either the workspace and its contents are gone, or nothing changed and the failure is reported
- ***The deletion is recorded in the workspace Activity Stream as it happens***, with the actor and the moment, so the act is an event in its own right rather than a silent disappearance

---
_Synced from Jira by sync-jira-issues_
