# BK-202 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-202)

- A Test Plan belongs to exactly one project and is visible to every workspace member of that project.
- Plan names are unique per project, case-insensitive, compared after trimming spaces.
- Plan name is required, 1 to 100 characters after trim; description and goal are optional.
- Creating and editing plans requires the member role or higher; viewers have read-only access.
- A newly created plan starts in the Open state with an empty test list.

## Design intent

- Test Plans becomes a section in the project explorer rail, alongside the existing test library entries.
- Selecting it opens a "Test Plans" tab in the main area, following the persistent-tabs pattern the app shell already uses for ATCs and Tests.
- List + detail: the list is a table (name, goal, status chip, test count, creator); clicking a plan opens its own detail tab.
- Primary "New plan" button on the list; creation happens in a compact dialog (name, description, goal).
- Empty states: list-level ("No test plans yet — create one to organize a cycle") and detail-level ("This plan has no tests yet").

---
_Synced from Jira by sync-jira-issues_
