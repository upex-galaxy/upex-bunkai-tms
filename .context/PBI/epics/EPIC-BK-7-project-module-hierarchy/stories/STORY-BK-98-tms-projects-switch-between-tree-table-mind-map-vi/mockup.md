# BK-98 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-98)

1. 

****Story:**** TMS-Projects | Switch between Tree, Table & Mind map views in a hardened explorer
****Tester:**** Nahuel Gomez
****Date:**** 2026-06-09
****Environment:**** Staging
****Surface:**** UI (no new API endpoints — pure UI view switcher)

—

1. 

This is a UI-hardening + view-switcher story. It layers a Tree/Table/Mind-map toggle onto the existing Projects explorer ([https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) module creation, [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) module rename/delete). The feature is purely frontend — no schema changes, no new API endpoints. Risk is medium: the view switcher itself is additive (can't break existing functionality), but the hardened explorer panel, context menu, and accordion behavior touch existing [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9)/[https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) surface.

****Prerequisites:**** [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (module creation) and [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) (module rename/delete) must be functional on staging. The Projects screen must contain modules, user stories, and ATCs to exercise the explorer.

1. 

| Risk  | Score  | Mitigation  |
| --- | --- | --- |
| ------ | ------- | ------------ |
| [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9)/[https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) regression from explorer hardening  | 4 (MEDIUM)  | Smoke [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9)/[https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) flows first; if broken, block [https://jira.upexgalaxy.com/browse/BK-98#icft=BK-98](https://jira.upexgalaxy.com/browse/BK-98#icft=BK-98)  |
| Mind map SVG rendering broken with large trees  | 2 (LOW)  | Test with existing staging data; scale test if possible  |
| Filter chips miscount ATCs  | 3 (LOW)  | Cross-reference chip counts against manual ATC count  |
| Right-click context menu items missing or misordered  | 2 (LOW)  | Check all 8 menu items per AC  |
| Explorer panel resize/collapse breaks layout  | 3 (LOW)  | Test at min (220px), max (520px), and collapsed states  |
| Design fidelity drift from master-design-plan §4.3  | 2 (LOW)  | Visual comparison against mockup screens/project.jsx  |

****Overall Risk Score: 4 (MEDIUM)**** — Proceed per autonomous full.

1. 

- ****UI:**** PRIMARY — all 8 ACs are visual/interaction tests
- ****API:**** SCOPE — verify no regression on GET endpoints for projects/modules/stories/atcs
- ****DB:**** NONE — no schema changes in this story

—

1. 

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Navigate to a project in the workbench  | Project opens, explorer visible  |
| 2  | Locate the view toggle in the project toolbar  | Tree / Table / Mind map toggle visible  |
| 3  | Select Tree  | Explorer visible next to read-only ATC detail pane (NOT the ATC table)  |
| 4  | Select Table  | Full-width ATC table displayed  |
| 5  | Select Mind map  | SVG topology renders: module → US → ATC  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Activate Tree view  | Explorer visible  |
| 2  | Click an ATC in the explorer  | Read-only detail pane opens on the right (not full-page navigation)  |
| 3  | Verify tab appears for the ATC  | Open-ATC tab visible; row highlighted in tree  |
| 4  | Open a second ATC  | Second tab added; first tab still present  |
| 5  | Close a tab  | Tab closes; active tab switches  |
| 6  | Inspect detail pane content  | Shows: slug, status, layer, module path, title, linked US with AC checkboxes (bound ACs checked), Steps and Assertions (read-only), tags  |
| 7  | Click Edit action  | Navigates to /atcs/{id} full editor  |
| 8  | Modifier-click / middle-click an ATC  | Opens full editor in a new tab  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Activate Mind map view  | SVG topology renders  |
| 2  | Inspect mode selector  | Topology is interactive/selectable  |
| 3  | Check Coverage mode  | Visibly disabled, labelled "soon"  |
| 4  | Check Bug-density mode  | Visibly disabled, labelled "soon"  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Open Tree detail pane for an ATC  | Run-result banner and Run action omitted; note about test runner arrival  |
| 2  | Check "Used by N tests"  | Omitted with arrival note  |
| 3  | Check Mind map for run-related overlays  | None present  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Open a project that has at least 1 ATC  | Filter chips visible: all / fail / blocked / unrun with live counts  |
| 2  | Note the count for each chip  | Count matches tree content  |
| 3  | Select "fail" chip  | Tree filters to only ATCs with fail status  |
| 4  | Select "all" chip  | All ATCs shown again  |
| 5  | Open a project with 0 ATCs  | Filter chips hidden  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Navigate to a module containing US with ACs and ATCs  | Module visible in tree  |
| 2  | Verify US rows collapsed by default  | Children (AC/ATC) not visible  |
| 3  | Toggle a US row  | AC and ATC children revealed  |
| 4  | Check ATC display  | ATC nests under US, shows slug (not UUID)  |
| 5  | Check US issue key  | Renders on single line, no wrapping  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Right-click or use shortcut on a US row  | "Create ATC" option appears  |
| 2  | Click "Create ATC"  | Navigates to /atcs/new?story=&ac=  |
| 3  | Verify editor pre-anchors  | Module, story, and AC pre-anchored in the editor  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Right-click a module row  | Context menu: Open, New sub-module, New story, Rename, Move, Copy ID, Delete (Duplicate disabled "soon")  |
| 2  | Right-click a story row  | Context menu relevant to stories  |
| 3  | Right-click an ATC row  | Context menu relevant to ATCs  |
| 4  | Check Duplicate item  | Present but disabled, labelled "soon"  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Locate the divider between explorer and content  | Divider visible  |
| 2  | Drag divider left to minimum  | Panel shrinks, minimum 220px  |
| 3  | Drag divider right to maximum  | Panel expands, maximum 520px  |
| 4  | Collapse panel to rail  | Panel becomes a narrow rail  |
| 5  | Restore from rail  | Panel returns to previous width  |

1. 

| Step  | Action  | Expected  |
| --- | --- | --- |
| ------ | -------- | ---------- |
| 1  | Review Projects screen against master-design-plan §4.3  | Layout matches mockup screens/project.jsx  |
| 2  | Check for unratified departures  | Any divergence from mockup must be in §5 (D8 already ratified)  |

—

1. 

- Screenshots for each view mode (Tree, Table, Mind map)
- Screenshots of: detail pane, context menu, filter chips, accordion expanded, panel collapsed/rail
- Console log check (no errors)
- Network tab check (no 4xx/5xx on explorer data fetches)

1. 

- At least 1 project with modules, user stories, ACs, and ATCs at varying statuses (fail, blocked, unrun)
- At least 1 project with 0 ATCs (for filter chip hide test)
- If staging has insufficient data, test data seeding may be needed

---
_Synced from Jira by sync-jira-issues_
