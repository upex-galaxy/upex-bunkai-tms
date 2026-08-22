# TMS-Run History | Browse every run in the workspace from one index

**Jira Key:** [BK-513](https://jira.upexgalaxy.com/browse/BK-513)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** QA Lead / Quality Engineering Manager
***I want to*** browse every Run in the workspace from a single cross-project index, filter it down, and open any row into the Run it names
***So that*** I can see what the whole team executed this week without opening each Project in turn

## Definition of done

- [ ] The sidebar's "Test Runs" entry is live and focusable, no longer a non-focusable "soon" item, and carries a real count
- [ ] A `/runs` route exists and shows Runs from every Project the caller can see in the active workspace
- [ ] Each row carries what a QA needs to judge it without opening it: Test, Project, environment, execution mode, outcome, when it started and finished, and its step outcome counts
- [ ] The list is newest-first and can be filtered by Project, outcome, environment and execution mode, with the filters composing
- [ ] Every Run in the workspace is reachable — no artificial cap silently hides Runs that exist
- [ ] Opening a row lands on that Run inside its owning Project
- [ ] Default, filtered, no-match, empty-workspace, loading and named-error-with-retry states all exist
- [ ] A Run from another workspace never appears in the list, in a filter option, or in the count
- [ ] "Bug Reports" and "Metrics" remain non-focusable "soon" items, unaffected

## Context

`.context/design/master-design-plan.md` §3 lists `Home / Projects / ATC Library / Test Runs / Bug Reports / Metrics / Settings` as the global shell's destinations, but every run screen §4 specifies is ***Project-scoped*** (`/projects/[projectSlug]/runs`, and a Test's own history at `/projects/[projectSlug]/tests/[testId]/runs`). The nav entry names a workspace-wide aggregate that was never built.

The live code agrees, deliberately: `components/layout/AppSidebar.tsx` gives ATC Library, Test Runs, Bug Reports and Metrics `href: null`, and they render as a non-focusable item tagged "soon".

***This story follows a ratified precedent, not a departure from the design contract.**** Decision ****D18**** (BK-265) ruled that every global-shell entry without a built destination stays "soon" and non-focusable. Decision ****D31*** (BK-267, AI Product Owner ruling) then superseded D18 for the ATC Library entry alone, on the stated grounds that BK-439 "is the story that builds the destination D18 found missing". This story is that identical move for Test Runs: it builds the destination, so the entry becomes live. D31's own wording — that "Test Runs", "Bug Reports" and "Metrics" stay "soon" because "none of their destinations exists yet, so D18's original reasoning still holds for those three" — is precisely the condition this story removes for one of the three. Bug Reports and Metrics are untouched.

Four stories already point at run surfaces and every one of them is Project-scoped or Test-scoped: ***BK-37**** (a Test's past runs), ****BK-38**** (filter a Project's runs with pass/fail totals), ****BK-225**** (filter runs by execution mode), ****BK-442*** (compare a run against the previous run of the same Test). No ticket anywhere owns a workspace-scoped runs index.

***BK-442 is the reason this matters beyond convenience.*** The design plan records BK-442's comparison view as mockup-gated and unratified — it has a story but no drawn surface. A workspace-wide index of Runs is the natural host for a run-to-run comparison, because comparison starts from picking two Runs, and this is the only screen where every Run in the workspace is pickable. BK-442 is linked from this story for that reason; this story does not build the comparison.

What already ships to build on: `GET /api/v1/projects/[id]/runs/report` (BK-38, Project-scoped, keyset-paginated, filters AND-composed, totals recomputed over the filtered set), the `runs` / `run*atcs` / `run*steps` tables from migration `0031_runs.sql` — where `runs` already carries the workspace directly — Project environments, and the workspace-scoped precedent `GET /api/v1/workspaces/[id]/active-runs` that the Home dashboard already uses to read across Projects.

## Design note — for the implementing run

***No §4 screen specifies a workspace-scoped runs index.**** The closest drawn surface is `bk-30-test-runs-index/test-runs-index.html` (§4.8), which draws the Project-scoped list this screen is the workspace-wide sibling of, and §4.9's global ATC Library is the drawn precedent for a workspace-scoped index living at a top-level route. Two things must be ratified in `.context/design/master-design-plan.md` before implementation: a ****§5 row**** recording the additive supersession of D18 for the "Test Runs" entry only — worded on D31's model, leaving Bug Reports and Metrics as D18 left them — and this story's ****§8 US-to-Screen row***. Build against the §2 frozen tokens and the live surfaces named above; do not invent UI and do not re-pick tokens.

## Provenance

Authored 2026-08-18 by the AI Product Owner profile, from `.context/design/master-design-plan.md` §3 and decisions D18/D31, and from the absence of any workspace-scoped runs ticket across EPIC BK-30.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Story (1)

- [BK-442](https://jira.upexgalaxy.com/browse/BK-442): TMS-Run History | Compare a run against the previous run of the same test _(Backlog)_

---

## Metadata

- **Created:** 8/18/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
