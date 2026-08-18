# BK-262 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

- Every non-ATC route family currently reachable with a Bearer token — imports, modules, projects, user stories, acceptance criteria, workspaces, invites — checks the token's capability scope before performing the action, exactly like ATC routes already do.
- The existing capability scopes stay as they are today; this story wires them into the routes that do not yet check them.
- Requests made with a browser session keep working exactly as they do today.

---
_Synced from Jira by sync-jira-issues_
