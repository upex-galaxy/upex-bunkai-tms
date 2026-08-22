# BK-507 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-507)

- A single bulk-edit action changes exactly ***one*** field across the selection. Mixing tags, Module and layer in one action is not offered
- The destination Module of a bulk move must belong to the ***same Project*** as every selected ATC — the existing rule that an ATC's Module is its User Story's Module or a descendant of it still holds for each ATC individually
- `layer` remains the closed set ***UI / API / Unit***; a bulk layer change cannot introduce a fourth value
- Adding a tag an ATC already carries leaves that ATC unchanged and counts as a ***success***, not a failure. The same holds for removing a tag it does not carry
- Every ATC changed by a bulk edit has its version advanced and propagates to the Tests that chain it, exactly as a single-ATC edit does. Bulk is a batching of the same edit, never a bypass of its propagation
- ***Each ATC in the selection succeeds or fails on its own.*** One ATC failing never reverts the ATCs that already changed
- A partial failure is a normal outcome, not an error state: the changes that succeeded stand, are visible on the list immediately, and are never presented as if they had been rolled back
- Every ATC changed by a bulk edit produces its ***own*** entry in the workspace Activity Stream — one event per ATC, the same grain a single edit produces, so the audit record does not lose resolution just because the change was batched
- The layer value always pairs its colour with its text label, per the standing rule that colour is never the only signal for a state on any screen
- A member who cannot edit a given ATC on its own cannot change it through a bulk edit either — batching never widens what someone is allowed to change

---
_Synced from Jira by sync-jira-issues_
