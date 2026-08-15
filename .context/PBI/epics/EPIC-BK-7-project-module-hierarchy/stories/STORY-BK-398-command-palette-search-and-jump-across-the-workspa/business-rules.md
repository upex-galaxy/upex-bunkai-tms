# BK-398 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

- Results are scoped to the member's currently active workspace only; an entity from another workspace the member also belongs to never appears, regardless of query match
- A result appears only if the viewer holds permission to see the underlying entity (project membership); the palette never reveals the existence of an entity the viewer cannot otherwise access
- The palette waits for a minimum query length before searching, so a one-character query does not fire a broad, low-signal search against a large workspace
- Typing is debounced before a search fires, so a fast typist does not trigger one request per keystroke
- Opening the palette while a modal or a form with unsaved input is already open does not discard that unsaved input; the palette layers on top and closing it returns the member to the state they left
- Dismissing the palette (Esc, clicking outside, or after a successful navigation) returns keyboard focus to where it was before the palette opened, except when a navigation occurred, in which case focus follows the new screen

---
_Synced from Jira by sync-jira-issues_
