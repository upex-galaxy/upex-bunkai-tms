# App Shell | Save, name, and return to a filtered view

**Jira Key:** [BK-443](https://jira.upexgalaxy.com/browse/BK-443)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

********As a**** Senior QA Engineer
********I want to******** save a filtered view under a name and return to it later
****So that******** the way I narrowed a list survives navigating away, and the views I work from every day are one click apart instead of rebuilt by hand each time

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

## Why this story exists

Narrowing a list is cheap; getting back to the narrowing is not. A QA Engineer sets a module, a severity and a date range, follows a link out to an ATC, comes back, and the list is wide open again. Nothing in the product lets her name that combination, keep it, or return to it tomorrow.

## Current state (verified at `origin/staging`)

Four filtered surfaces, three different conventions, no persistence layer in use:

| Surface | Filter state today |
| --- | --- |
| Traceability chain (BK-48) | Synced to the URL via `history.replaceState` (`components/traceability/TraceabilityChainView.tsx`) |
| Run history (BK-37) | Synced to the URL via `router.replace` (`components/runs/RunHistoryView.tsx`) |
| Bugs list | React state only — the file comments say the URL was deliberately skipped for want of a deep-link requirement (`components/bugs/BugsListView.tsx`) |
| Project workbench ATC search + tag filter | React state only (`app/(app)/projects/[projectSlug]/atc-search-filter.tsx`, `test-tag-filter.tsx`, `workbench-context.tsx`) |

Two related points, so neither is mistaken for a gap this story invents:

- ***BK-48's filter-state question is already settled and shipped.**** Its 2026-08-11 decision comment chose URL query params over local state, and the code implements it. That ruling covers **in-session and shareable-by-link* filter state on the chain view; it explicitly set saved views aside ("this is exploration, not a dashboard"). This story is the layer above it: naming and keeping a view, not encoding one in a link. It should adopt the URL convention rather than compete with it, and bring the two local-state surfaces onto the same convention.
- ***BK-147 persists which tabs are open, not what is filtered inside them.*** Its open-tab set is in-memory and resets on project switch by construction. Unrelated surface.

BK-218 was reviewed and is unrelated — it renders a single entity as a rich chat link, not a filtered view. Do not fold the two together.

## Starting position in the data model

`user*view*state` already exists with full row-level security and has ***zero application consumers*** — table plus generated type only, unused since it was created:

- `supabase/migrations/0009*cross*cutting.sql` — columns `user*id`, `project*id`, `view*kind text`, `state jsonb not null default '{}'`, `updated*at`, primary key `(user*id, project*id, view*kind)`. Owner-only `select` / `insert` / `update` / `delete` policies, each gated on `user*id = auth.uid()`.
- `lib/types/supabase.ts` — the generated row types, and nothing else in `app/`, `components/` or `lib/` references it.

Build on this table rather than proposing a new one. Note the one shape mismatch the implementing run has to resolve deliberately: ***as built, the primary key allows exactly one row per ****`(user, project, view_kind)`**** and there is no name column***, so the table as it stands models "the last state of this view" and not "several named views of it". Supporting more than one named view per kind requires extending that shape; keeping a single unnamed remembered state per kind does not. That trade-off is a schema decision for the implementing run, not a new table decision.

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

- **Created:** 8/13/2026
- **Updated:** 8/13/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** discovery-2026-08-13, filter-persistence, saved-views

---

_Synced from Jira by sync-jira-issues_
