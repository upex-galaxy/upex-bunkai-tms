# TMS-Bug Reports | Browse every defect in the workspace from one index

**Jira Key:** [BK-555](https://jira.upexgalaxy.com/browse/BK-555)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** QA Lead / Quality Engineering Manager
***I want to*** browse every defect in the workspace from a single cross-project index, narrow it by Project, status and severity, and open any row into that defect's full record
***So that*** I can see where the whole product is hurting without opening each Project in turn

## Definition of done

- [ ] The sidebar's "Bug Reports" entry is live and focusable, no longer a non-focusable "soon" item, and carries a real count
- [ ] A `/bugs` route exists and shows defects from every Project of the caller's active workspace
- [ ] Each row carries what a triage decision needs without opening it: defect, title, Project, full module path, severity, status, assignee, and whether it came from a Run
- [ ] The list is ordered most severe first, then most recently filed, and can be narrowed by Project, status and severity, with the filters composing
- [ ] Counts by severity and by status are shown over the whole filtered set, not just the visible page
- [ ] Every defect in the workspace is reachable — no artificial cap silently hides defects that exist
- [ ] Opening a row lands on that defect's full record inside its owning Project
- [ ] Default, filtered, no-match, empty-workspace, loading and named-error-with-retry states all exist
- [ ] A defect from another workspace never appears in the list, in a filter option, or in the count
- [ ] "Metrics" remains a non-focusable "soon" item, and no sidebar entry other than "Bug Reports" changes

## Context

`.context/design/master-design-plan.md` §3 lists `Home / Projects / ATC Library / Test Runs / Bug Reports / Metrics / Settings` as the global shell's destinations, but every defect screen §4.6 specifies is ***Project-scoped*** — the list and heatmap at `/projects/[projectSlug]/bugs` and the record at `/projects/[projectSlug]/bugs/[bugId]`. The nav entry names a workspace-wide aggregate that was never built.

The live code agrees, deliberately: `components/layout/AppSidebar.tsx` gives ATC Library, Test Runs, Bug Reports and Metrics `href: null`, and they render as non-focusable items tagged "soon".

***This story follows a ratified precedent, not a departure from the design contract.**** Decision ****D18**** (BK-265) ruled that every global-shell entry without a built destination stays "soon" and non-focusable. Decision ****D31*** (BK-267, AI Product Owner ruling) then superseded D18 for the ATC Library entry alone, on the stated grounds that BK-439 "is the story that builds the destination D18 found missing". This story is that identical move for Bug Reports: it builds the destination, so the entry becomes live. D31's own wording — that "Test Runs", "Bug Reports" and "Metrics" stay "soon" because "none of their destinations exists yet, so D18's original reasoning still holds for those three" — is precisely the condition this story removes for one of the three. Metrics is untouched, and so is whatever state Test Runs is in when this ships (BK-513 owns that entry on the same D31 path).

Six stories already point at defect surfaces and every one of them is Project-scoped or record-scoped: ***BK-40**** (file a defect from a failing run step), ****BK-41**** (list and filter a Project's defects by module, status and severity, with live counts), ****BK-42**** (the per-module heatmap on the same screen), ****BK-264**** (assign and advance one defect), ****BK-337**** (read one defect's full record), and ****BK-465*** (capture expected vs actual at filing). No ticket anywhere owns a workspace-scoped defect index.

***How this differs from BK-41, which must not be restated here.**** BK-41 answers "what is broken inside **this** Project, and where in its module tree" — it is module-first, it rolls a chosen module up over its whole subtree, and it lives inside the Project shell. This story answers "what is broken across the **whole workspace*, and which Project owns it" — it is Project-first, it has no module filter at all (see the AI Product Owner ruling on this ticket), and it lives at the top level of the app. Neither replaces the other; BK-41's route, filters, counts and heatmap view are untouched, and this index deliberately does not become a second place to do module-tree triage.

What already ships to build on: `GET /api/v1/projects/[id]/bugs` and the `bunkai*list*bugs` RPC (BK-41, keyset-paginated, filters AND-composed, severity + status aggregates recomputed over the filtered set, archived-module defects excluded), the `bugs` table from `0046*bugs.sql` — where `bugs` already carries `workspace*id` directly and is indexed on it — the defect record route from BK-337, and the workspace-scoped precedent `GET /api/v1/workspaces/[id]/open-bugs` that the Home dashboard already uses to count defects across Projects. See the AI Tech Lead ruling on this ticket for the one real cost: `bunkai*list*bugs` pins `p*project*id` as a required first parameter and its grant is bound to that exact signature, so a workspace-wide listing needs its own function rather than a widened one.

## Edge cases enumerated

| # | Case | Where it lands |
| --- | --- | --- |
| 1 | A workspace where no defect has ever been filed | AC-14 — an empty state that reads as empty, never as a failure |
| 2 | A filter combination that matches nothing | AC-15 — distinct from the error state, clearable from where it stands |
| 3 | Hundreds or thousands of defects across many Projects | AC-13 — every one reachable by paging or scrolling further; a page size is never a cap |
| 4 | A caller who belongs to more than one workspace | AC-20 — only the active workspace appears, in the list, the Project filter and the count |
| 5 | A workspace holding exactly one Project | AC-21 — the Project column and Project filter still behave |
| 6 | Two Projects owning modules with the same name | AC-05 — the Project column plus the full module path disambiguate the pair; it is also the reason no module filter is offered at workspace scope |
| 7 | A defect filed against a module that was later archived | AC-19 — excluded, matching what the Project-scoped list already does; the workspace index must not become the back door to defects the Project list hides |
| 8 | A defect whose Project is deleted afterwards | Nothing to build, recorded so nobody invents an orphan state: a Project has no soft-delete in this product, and a defect is removed with its Project, so a defect can never outlive the Project it names |
| 9 | A run-linked defect whose source Run was deleted afterwards | AC-18 — the row reads as a defect with no Run, the same quiet state a manually filed defect gets, never a broken link or an error |
| 10 | A member at any role, Viewer included, opening the index | AC-22 — the same index; the access boundary is the workspace and there is no narrower per-Project grant in this product |

## Design note — for the implementing run

***No §4 screen specifies a workspace-scoped defect index.**** The closest drawn surface is `bk-31-bug-reports/bug-reports-index.html` (§4.6), which draws the ****Project-scoped**** list this screen is the workspace-wide sibling of, and §4.9's global ATC Library (`bk-13-atc-library-global/atc-library-global.html`) is the drawn precedent for a workspace-scoped index living at a top-level route. Per Critical Rule #14 the live UI is the fidelity source: `components/bugs/BugsListView.tsx` already ships this product's defect-row grammar — the mono 8-character id with the full value on hover, the `status-chip` / `dot` severity and status treatment paired with words, the mono module path, the filter-chip groups, and the loading / empty / no-match / error-with-retry shape — and it is what this screen reuses. Two things must be ratified in `.context/design/master-design-plan.md` before implementation: a ****§5 row**** recording the additive supersession of D18 for the "Bug Reports" entry only, worded on D31's model and leaving Metrics exactly as D18 left it, and this story's ****§8 US-to-Screen row***. Build against the §2 frozen tokens and the live surfaces named above; do not invent UI and do not re-pick tokens.

## Provenance

Authored 2026-08-19 by the AI Product Owner profile, from `.context/design/master-design-plan.md` §3, §4.6 and decisions D18/D31, and from the absence of any workspace-scoped defect ticket across EPIC BK-31. Four product rulings and one technical ruling raised during authoring are published as attributed comments on this ticket per Critical Rule #18.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 8/19/2026
- **Updated:** 8/19/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
