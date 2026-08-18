# BK-203 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-203)

- Plan membership rows reference Tests; removing a membership never deletes or alters the Test.
- A Test may belong to any number of plans in its project; a plan holds a given Test at most once.
- Membership can only be edited while the plan is Open; closed plans reject membership changes.
- Adding and removing tests requires the member role or higher; viewers are read-only.
- Only Tests from the plan's own project can be added.

## Design intent

- Plan detail tab gains a "Add tests" primary button opening a search dialog with the same autocomplete-search feel as the existing ATC search.
- The dialog lists matching tests with name and tags, checkboxes for multi-select, and an "already in plan" marker on included ones.
- Member tests render in the same table pattern used across the app (rows: test name, tags, added-by), each row with a remove action behind a kebab menu.
- Removing asks for a lightweight confirm; the empty state returns when the last test is removed.

---
_Synced from Jira by sync-jira-issues_
