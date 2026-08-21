# BK-512 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

- A ***Delete workspace**** action on the Settings workspaces screen, offered only on rows the caller ****owns*** — absent, not present-and-refused, for every other role
- A confirmation that names the exact workspace, states plainly that the deletion is immediate and cannot be undone, and is gated by typing the workspace's ***exact name*** — the same type-to-confirm idiom the Leave confirmation already ships
- An offer to ***export the workspace's data first*** (BK-508), presented inside the confirmation before the destructive action, so erasure never forces the Owner to abandon their own records
- Deleting the workspace removes everything that belongs to it: its Projects, Modules, User Stories, Acceptance Criteria, ATCs, Tests, Runs and their snapshotted chain steps, Bugs, Milestones, Project environments, memberships, pending invites, Personal Access Tokens, Notifications and Activity Stream entries
- Every other member loses access to the workspace at once. Anyone whose active workspace was the deleted one is re-pointed at a workspace they still belong to, without having to sign out
- An Owner who deletes their ***only*** workspace lands on the onboarding screen, where they can create or join another
- Deleting is recorded in the workspace ***Activity Stream*** at the moment it happens
- Screen states for the flow: the action on an owned row, the confirmation with the name ungated and gated, in-flight, success, and a failure that leaves the workspace intact

---
_Synced from Jira by sync-jira-issues_
