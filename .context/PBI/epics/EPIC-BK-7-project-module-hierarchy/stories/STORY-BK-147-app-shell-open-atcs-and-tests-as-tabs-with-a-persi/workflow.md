# BK-147 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

## User flow

1. Elena signs in and lands in the application shell — the left navigation, workspace switcher, global search entry, and account block frame every screen from here on.
2. She opens a project and sees the explorer tree with its modules, ATCs and Tests.
3. She clicks an ATC; it opens as a tab in the workbench while the explorer stays beside it and the ATC is highlighted in the tree.
4. She clicks a Test; it opens as a second tab. She switches between the two without losing either.
5. From any tab she can reach the project toolbar to create a new ATC or Test, switch the view, or search.
6. She closes a tab; an adjacent tab becomes active and the explorer stays visible. Closing the last tab returns her to the workbench index.
7. She shares a direct link to a Test; a teammate opens it and lands on that Test as a tab with the full workbench and shell around it.
8. If the link points at an item that was deleted or that the teammate cannot see, the workbench shows a safe not-found state in place of the tab content, with the shell and explorer intact.

---
_Synced from Jira by sync-jira-issues_
