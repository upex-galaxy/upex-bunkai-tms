# BK-266 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

- `/projects` becomes a real index: it lists every Project of the active Workspace that the member can see, each one linking through to its own Project.
- Each entry carries the Project identity the app already holds: name, URL slug, the description when the author wrote one, and when it was created. No other per-Project figure is promised — see Out Of Scope.
- A Workspace with zero Projects gets a purposeful empty state that explains what a Project is for and offers the create call to action, instead of the bare form that renders there today.
- `/projects/new` becomes the dedicated creation route and hosts the create-project form exactly as it behaves today: live slug preview, the same field rules, the same inline messages.
- A successful creation from that route takes the member straight into the Project just created.
- Entry points whose only purpose is starting a new Project are repointed at `/projects/new` — at minimum the "New project" control in the left navigation, which today lands on the index.
- The index is scoped to the active Workspace, and switching Workspace re-scopes it to that Workspace's Projects.
- Both routes are fully operable by keyboard, and every interactive element shows a visible focus indicator per the frozen design contract.

---
_Synced from Jira by sync-jira-issues_
