# IMPROVEMENT: App Shell | Reach Runs, Bugs and Metrics from a project sub-nav

**Jira Key:** [BK-265](https://jira.upexgalaxy.com/browse/BK-265)
**Priority:** High
**Status:** Open
**Components:** None

---

## Description

## Observed gap

Three project surfaces are built, merged to `staging`, and already sitting in ***Ready For QA**** — yet ****no link to any of them exists anywhere in the shipped UI***. A QA Engineer can only reach them by typing the URL into the address bar.

> ***WARNING:*** This is not a missing feature. It is delivered work that no user can find.

Verified by exhaustive `href` grep across the app — zero references to any of the three routes:

| Route | Screen | Entry point in the UI |
| --- | --- | --- |
| `/projects/{projectSlug}/runs` | Test Runs (project run report) | none |
| `/projects/{projectSlug}/bugs` | Bug Reports (defect list + heatmap) | none |
| `/projects/{projectSlug}/metrics` | Metrics (coverage) | none |

## Stories that delivered the orphaned surfaces

| Story | Summary | Status |
| --- | --- | --- |
| BK-38 | TMS-Run Reporting | Filter project runs with pass/fail totals | Ready For QA |
| BK-41 | TMS-Defect List | List and filter defects by module, status, severity | Ready For QA |
| BK-42 | TMS-Defect Heatmap | View count and week-over-week trend per module | Ready For QA |
| BK-46 | TMS-Coverage | Surface untested ACs and modules with not-run filter | Ready For QA |

Each of those stories shipped its screen and stopped at the screen. None of them owned the navigation that leads to it, so the hole fell between them. This item closes that hole.

## Files that should carry the link and do not

- `components/layout/AppSidebar.tsx` — the global nav array renders Home, ATC Library, Test Runs, Bug Reports and Metrics with a `null` destination, so they show a `soon` tag and are not clickable. Deliberate: these are workspace-wide aggregates that do not exist yet.
- `app/(app)/projects/[projectSlug]/project-shell.tsx` — the persistent project shell's toolbar offers only ***New ATC**** and ****New Test***. It is the natural host for a project sub-nav and currently has none.
- `components/layout/CommandPalette.tsx` — no jump-to entry for any of the three routes either, so even the search fallback misses them.

## Approach

A sub-nav inside the persistent project shell, exposing the surfaces that belong to the ***currently open Project***. The global sidebar stays as-is: its items are workspace-level aggregates and remain marked `soon` until those aggregate screens are scoped. Access to Runs, Bug Reports and Metrics comes from the Project the user is already inside.

The shell is the right host because it is already the element that survives the Project's detail routes (BK-147, ADR-0003) — placing the sub-nav there makes it available from every page inside a Project without re-mounting per route.

> ***INFO:**** ****No mockup gates this work.*** `.context/design/master-design-plan.md` §3 describes the global shell nav but no mockup exists for a project-level sub-nav. This is built against DESIGN.md §2 frozen tokens plus the closest live pattern already in the shell — the same path BK-49 took. To be recorded as a §5 spec-only divergence. No ADR: no schema, auth, or cross-cutting invariant is touched.

---

## Metadata

- **Created:** 8/4/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** app-shell, navigation, ux

---

_Synced from Jira by sync-jira-issues_
