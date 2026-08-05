# BK-266 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

***Returning member, populated workspace (the common path)***

1. Mateo signs in and lands in the application.
2. The Projects index opens on his active Workspace and lists its Projects, oldest first — name, slug, and description where one exists.
3. He recognises "Checkout flow", activates it, and arrives on that Project.
4. Nothing asked him to create anything.

***First-time member, empty workspace***

1. Mateo signs in with a Workspace that holds no Projects yet.
2. The index shows an empty state: what a Project is for, and one clear way to create the first one.
3. He follows it to the dedicated create route, names the Project, and confirms.
4. He arrives inside the new Project. The next visit to the index lists it.

***Creating another project later***

1. From anywhere in the shell, Mateo uses the "New project" control in the left navigation.
2. He arrives on the dedicated create route — the same form, the same live slug preview, the same refusal messages as before this story.
3. On success he lands inside the new Project; on refusal he stays on the route with his input intact and a message explaining what to change.

***Switching workspace***

1. Mateo switches his active Workspace in the switcher.
2. The index re-scopes: the new Workspace's Projects are listed, and none of the previous Workspace's Projects remain visible.

---
_Synced from Jira by sync-jira-issues_
