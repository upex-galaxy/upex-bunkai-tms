# BK-266 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

- ***The Home dashboard.*** Epic BK-254 owns it. This story does not build a landing dashboard, only an honest Project index.
- ***Changing where ****`/`**** sends a signed-in member.*** BK-255 owns that decision. This story assumes members keep arriving at `/projects`.
- ***Per-Project counts on the index*** (Modules, User Stories, ATCs, Tests, Runs, Bugs). Verified against the current data model before scoping: the Project record the app reads today carries no aggregate, and no grouped read exists that would return one figure per Project in a single pass. Promising a count here would mean net-new backend work, which this story deliberately avoids. A separate story if the team wants it.
- ***Pinning, favouriting, sorting, filtering, or searching the index.*** The list is plain and ordered; refinement controls are a later story.
- ***Renaming, archiving, or deleting a Project*** from the index or anywhere else.
- ***Any new backend read or write.*** Verified before scoping: the Project list the current screen already performs returns everything the index needs, and Project creation already has its own path. If implementation finds otherwise, that is a scope change to raise, not to absorb.
- ***Workspace-level aggregate screens*** (ATC Library, Test Runs, Bug Reports, Metrics). The four global navigation entries stay marked as unavailable; a future tech-story owns them.
- ***Re-specifying the create form.*** Field rules, slug derivation, and refusal messages are inherited unchanged from BK-8; this story relocates the form, it does not redesign it.

---
_Synced from Jira by sync-jira-issues_
