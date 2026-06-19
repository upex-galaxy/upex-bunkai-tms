# BK-147 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

## Acceptance Test Plan (ATP) — BK-147 App Shell & Workbench Tabs

***Persona under test******:*** Elena Vargas (Senior QA Engineer)
***Surface******:*** Application shell + project workbench (Projects screen)
***Test type legend******:*** P = positive · N = negative · B = boundary

### Preconditions (shared)

- Elena is signed in and a member (or above) of a workspace that has at least one project.
- The project contains at least one module, two ATCs, and two Tests (each Test chains ≥ 1 ATC).
- A second project exists in the same workspace with its own ATCs/Tests.

| TC | Type | Objective | Steps | Expected result | AC ref |
| --- | --- | --- | --- | --- | --- |
| TC-01 | P | Shell persists across views | Sign in → open a project → open an ATC → open a Test | Left nav, workspace switcher, search entry, and account block remain visible the whole time | Shell stays visible |
| TC-02 | P | Account block shows real identity | Inspect the account block after sign-in | The block shows Elena's own signed-in identity, not a placeholder name | Shell stays visible |
| TC-03 | P | Explorer persists + item opens as tab | In a project, click an ATC in the explorer | ATC opens as a workbench tab; explorer stays beside it; ATC highlighted in the tree | Explorer stays visible |
| TC-04 | P | Open a Test as a tab | Click a Test in the explorer | Test opens as a tab; explorer visible; Test highlighted | Explorer stays visible |
| TC-05 | P | Multiple tabs, switchable | Open an ATC, then a second item, then a third | Three tabs exist; switching between them preserves all three | Multiple tabs |
| TC-06 | N | No duplicate tab on re-open | With an ATC tab open, click the same ATC again | Existing tab is focused; no duplicate is created | Re-opening focuses |
| TC-07 | P | Close active tab → neighbour active | With several tabs open, close the active one | Tab removed; an adjacent tab becomes active; explorer stays visible | Closing a tab |
| TC-08 | B | Close the last tab | With exactly one tab open, close it | Workbench shows its empty index state; explorer stays visible | Closing last tab |
| TC-09 | P | Toolbar reachable from a tab | With a Test open, locate project actions | New ATC, New Test, view switch, and search are reachable without closing the tab | Toolbar reachable |
| TC-10 | P | Deep link to a Test opens as a tab | Paste a direct Test URL into a fresh load | Test opens as a tab inside the workbench; explorer visible; Test highlighted | Deep link opens as tab |
| TC-11 | P | Deep link to an ATC opens as a tab | Paste a direct ATC URL into a fresh load | ATC opens as a tab inside the workbench; explorer visible; ATC highlighted | Deep link opens as tab |
| TC-12 | N | Deep link to a deleted item | Delete a Test, then open its old URL | Safe not-found state shown inside the workbench; shell + explorer intact; no broken full page | Item no longer available |
| TC-13 | N | Deep link to an item without access | Open a URL for an item in a project Elena cannot see | Safe not-found state inside the workbench; no data leak; shell intact | Item no longer available |
| TC-14 | B | Switching projects resets tabs | Open tabs in project A, then open project B from nav | Lands on project B's workbench index; project A tabs are not shown | Switching projects |
| TC-15 | N | Disabled nav destinations | Click a "coming soon" nav item (e.g. Metrics) | Item is visibly disabled; no navigation, no broken route | Disabled destinations (business rule) |
| TC-16 | B | Many tabs overflow gracefully | Open enough items to exceed the tab strip width | Tab strip scrolls/condenses without breaking layout; all tabs reachable | Multiple tabs (boundary) |

### Test-only concerns (not promoted to AC — exploratory / regression)

- Browser back/forward after opening and closing tabs lands on a coherent state (no orphaned URL).
- Refreshing the page while a tab is open re-opens that tab (deep-link path) rather than losing context.
- Keyboard/middle-click on an explorer item still allows opening the full editor in a new browser tab (existing power-user affordance preserved).
- Read-only guarantee: opening an item performs no write; the item's `updated_at` is unchanged after open/close.

---
_Synced from Jira by sync-jira-issues_
