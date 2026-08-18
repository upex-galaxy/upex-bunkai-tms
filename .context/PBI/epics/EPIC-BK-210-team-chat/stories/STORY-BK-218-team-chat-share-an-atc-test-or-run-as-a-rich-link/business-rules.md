# BK-218 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-218)

- ***Supported entities***: ATC, Test, and Run references render as rich cards; anything else stays a plain link.
- ***State shown = current state***: a card shows the entity's state as of when the message is rendered, not a frozen snapshot — a Run card shows its verdict (PASS, FAIL, ABORTED, BLOCKED), an ATC or Test card shows its workflow status.
- ***Permissions win over convenience***: the card reveals title and state only to readers who can access the entity's Project; everyone else gets a neutral restricted placeholder that leaks neither title nor state.
- ***Deleted entities never break history***: a card whose entity is gone renders a "no longer available" placeholder; the message itself is untouched.
- ***One card per reference***: a message may contain several references; each renders its own card below the text.

### Design intent

- Cards render as compact bordered tiles under the message text: entity-type icon, title, and a status/verdict badge using the app's existing status colors.
- The restricted placeholder and the deleted placeholder share the same muted tile shape so nothing in the layout jumps.
- Inserting a reference can also be done from the composer via a lightweight picker (search ATCs / Tests / Runs), consistent with the explorer's existing search patterns.

---
_Synced from Jira by sync-jira-issues_
