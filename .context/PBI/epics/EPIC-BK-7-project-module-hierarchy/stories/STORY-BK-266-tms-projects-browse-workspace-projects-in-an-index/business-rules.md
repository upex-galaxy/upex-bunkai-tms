# BK-266 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

| # | Rule | Boundary / note |
| --- | --- | --- |
| BR-1 | The index shows only Projects belonging to the ***active Workspace***. | Visibility rules already in force are unchanged — a member never sees a Project from a Workspace they do not belong to. |
| BR-2 | Projects are listed ***oldest first***. | Same order the left navigation already uses, so the two lists never contradict each other. |
| BR-3 | A member who belongs to ***no Workspace*** is still sent to onboarding before either route renders. | Unchanged from today. |
| BR-4 | Permission to create a Project is ***unchanged***: member role or above. | A member without the right role gets the same refusal message the form already produces. |
| BR-5 | Name rules, slug derivation, and refusal messages on `/projects/new` are ***inherited unchanged*** from the shipped create-project behaviour (BK-8, BK-53). | This story moves the form; it does not re-open its rules. |
| BR-6 | Switching Workspace ***re-scopes*** the index. | The list a member sees always matches the Workspace shown in the switcher. |
| BR-7 | A Project ***description*** is optional. | When absent, the entry shows name and slug only — no placeholder text, no empty line. |
| BR-8 | The empty state appears ***only*** when the active Workspace has zero visible Projects. | One Project is enough to render the index proper. |

---
_Synced from Jira by sync-jira-issues_
