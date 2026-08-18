# TMS-Milestone | Create a milestone with a target date

**Jira Key:** [BK-205](https://jira.upexgalaxy.com/browse/BK-205)
**Epic:** [BK-201](https://jira.upexgalaxy.com/browse/BK-201) (Test Plans & Milestones)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** 8

---

## Overview

## User story

As Mateo Silva, QA Lead, I want to create a milestone with a name and a target date inside a project, so that the team's testing work is anchored to a concrete delivery goal such as "Release 2.4".

## Context

Test Plans organize what a cycle verifies; a Milestone anchors when it must be ready. A milestone is a lightweight named goal — "Release 2.4", target date August 15 — that will later aggregate the readiness of its attached plans. This story delivers the milestone container itself: creation, listing, and a countdown to the target date. It activates once its dependency epics are live; attaching plans and readiness tracking arrive in the sibling milestone story.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-07-22

> Refined Acceptance Criteria live in the `acceptance_criteria` field (Step 1a).

### Edge Cases Identified

| ***#**** | ****Edge case**** | ****In original Story?**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Two users create a milestone with the same name at nearly the same time (race) | No | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 2 | Editing an active milestone's name into a duplicate of another existing name | No | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 3 | Editing an active milestone's target date to a past date | No | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 4 | Milestone name that is only whitespace (trims to empty) | No | Medium | Test only |
| 5 | Milestone name differing from an existing one only by internal whitespace | No | Medium | Test only (NEEDS PO/DEV CONFIRMATION on intended behavior) |
| 6 | Target date exactly one day before today | Partially (AC3 gives a non-boundary example) | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 7 | Target date far in the future, no stated upper bound | No | Low | Ask PO (NEEDS PO/DEV CONFIRMATION) |
| 8 | Description of unusually large size, no bound stated | No | Medium | Ask PO (NEEDS PO/DEV CONFIRMATION) |
| 9 | User's local "today" vs. server "today" near midnight (timezone edge) | No | Medium | Ask PO/Dev (NEEDS PO/DEV CONFIRMATION) |
| 10 | Same milestone name allowed across two different projects | No (implied by "unique per project") | Low | Test only |
| 11 | Role upgraded mid-session (viewer → member) — does the Create option appear live? | No | Low | Ask PO/Dev (NEEDS PO/DEV CONFIRMATION) |

### Clarified Business Rules

- ***Role-inheritance model****: workspace roles are `viewer ⊂ member ⊂ admin ⊂ owner`. Viewers can **see* the Milestones list/detail (visibility is role-agnostic among members) but cannot create — the create action requires `member` role or higher.
- ***Whitespace handling on the name field****: the uniqueness/validation rule trims leading and trailing whitespace only — it does ****not*** collapse internal whitespace. "Release 2.4" and "Release  2.4" (double internal space) are distinct names, not duplicates.
- ***Duplicate-name comparison****: case-insensitive and trim-based (leading/trailing only), scoped ****per project*** — the same name is allowed to exist in two different projects.
- ***Authorization scope (still unconfirmed)***: creation is gated by the existing `workspace*members` role table; no separate `project*members`-level access check was found in the data model — pending Technical Question #4 below.

### Critical Questions for PO

1. ***Should this Story's ACs be extended to cover milestone editing (****`scope.md` ****lists it as in-scope), or should editing be moved out of this Story's scope explicitly?***

1. ***Should AC5 also state server-side enforcement (API rejects a direct viewer create request), not just UI-hiding?***

1. ***Business rules say "member role or higher" can create milestones — should admin and owner get explicit AC coverage, or is the existing role-inheritance model sufficient without new ACs?***

1. ***Is there a maximum length for the milestone description?***

### Technical Questions for Dev

1. ***Is the target date a pure calendar date (DATE column) or does it carry a time component?*** — affects the exact comparison basis for the "today or later" boundary.
2. ***Is "today" evaluated in server UTC or the requesting user's local timezone at submit time?*** — affects correctness near midnight for users outside the server's timezone.
3. ***Is uniqueness enforced by a DB-level constraint (e.g. unique index on**** `(project_id, lower(trim(name)))`****), or by an application-layer check-then-insert?*** — the latter is race-prone under concurrent creates of the same name (Phase 5 Edge Case #1).
4. ***Is milestone-creation authorization gated purely by the existing**** `workspace*members` ****role, or is there also a project-level access check?*** — no `project*members` entity was found in `business-data-map.md`; confirming this shapes the RBAC decision table.
5. ***Is there an intended upper bound on the target date?*** — lower-priority than the PO questions above, but still needs a stated Dev decision if PO does not weigh in.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field and the canonical comment below.

---

## Three Amigos Session — Decisions (2026-07-24, DRAFT — pending real team ratification)

> This session was AI-facilitated to accelerate the actual Dev/Design/PO/QA conversation. Treat every decision below as a strong starting draft, not a final sign-off — the real stakeholders should confirm or override before sprint planning.

### PO decisions

1. ***Editing is in scope for BK-205.*** `business-rules.md` already states the target date "may be moved forward or backward while active" — this is a ratified rule, not new scope. Edit ACs added (name/description/target date).
2. ***Server-side RBAC enforcement on create AND edit is non-negotiable.*** A client-only permission check is a broken-access-control gap this QA-focused product cannot ship with.
3. ***admin/owner roles do not need separate explicit ACs.*** Role inheritance ("member or higher") already covers them; the existing parametrized scenario (member/admin/owner) is sufficient.
4. ***Milestone description is capped at 500 characters.*** Consistent with the existing 100-char name cap; avoids unbounded free text.

### Dev Backend decisions

1. ***Name uniqueness enforced via a DB-level unique index*** on `(project_id, lower(trim(name)))` — makes concurrent-duplicate creation structurally impossible rather than relying on an app-layer check-then-insert.
2. `target_date` ***is a DATE column; "today" is evaluated in server UTC.***
3. ***Authorization is workspace-role-only*** (via `workspace_members`) — no project-level access layer exists in the data model, so none is introduced here.
4. ***Edit reuses create's validation logic***, with one explicit exception: uniqueness must exclude the record's own current name.

### Dev Frontend decisions

1. ***Editing uses the existing create-dialog in "edit mode"***, not per-field inline editing — reuses ~90% of existing validation/UI, avoids N independent inline-edit states.
2. ***Validation errors render inline below the offending field***, not as toast/banner (reserved for network/server failures).
3. ***A live character counter is added under the description field***, given the new 500-char cap.

### Design decisions

1. ***Milestones list renders as a table***, not cards — matches the "scannable by date" intent already stated in `business-rules.md`.
2. ***The days-remaining counter uses neutral styling in every state for this Story*** — no urgency/overdue color treatment. That belongs to [https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206) (readiness), so it is not built twice.
3. `mockup.md`***'s "inline edit" wording is corrected*** to reflect the modal-reuse approach agreed with Frontend.
4. ***Empty state (list and detail):**** ****simple text + icon + one CTA.*** Low-stakes secondary state; no illustration investment needed for MVP.

### QA notes

- Outline count grew from 19 to ~26 with the newly confirmed edit scenarios (positive edit, self-exclusion from uniqueness, edit RBAC) and the description-length boundary pair.
- Scenario "API rejects a viewer create request with 403" is now a ***release gate***, not a draft outline.
- admin/owner AC-scope decision accepted as methodologically sound (RBAC is monotonic); a light exploratory check on admin/owner is still planned during execution as a cheap safety net.
- DB-level uniqueness constraint simplifies the concurrency test (E3) to a deterministic assertion instead of an orchestrated race.
- Automation note: test fixtures must use relative date offsets (`today - 1`, `today`, `today + N`), not the Story's literal example dates, or the suite goes stale/flaky over time.

### Suggested Story Points (pending team ratification): ***8***

Backend ≈5, Frontend ≈5, Design = small non-blocking spike — converged team estimate (not a simple sum) once the editing-scope question was resolved. Not written to the Jira Story Points field by this session — left for the real team's own estimation ritual.

## Three Amigos Session — Decisions (Refresh, 2026-08-04, Mockup Cross-Reference — DRAFT, pending real team ratification)

> This session was AI-facilitated to accelerate the actual Dev/Design/PO/QA conversation, triggered by the milestones-board mockup landing on 2026-07-30 (see Ely's comment below). Treat every decision below as a strong starting draft, not a final sign-off — the real stakeholders should confirm or override before Ready For Dev. Live mockup reviewed via local Playwright session: `../upex-bunkai-tms/.context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/milestones-board.html`.

### C1 — BLOCKING, not resolved by this session — needs real PO/Dev/Design ratification

***Finding****: the delivered mockup's Milestone detail view unconditionally renders the Attach-plans button, the readiness card, and the attached-plans table in every state (default, overdue, viewer-role) — there is no "BK-205-only" variant. This conflicts with this Story's own `scope.md`, which says the detail view ships with ****"an empty plans area"*** only — no attach/readiness UI, since that arrives with the sibling story (assign test plans and track readiness).

***Why it matters***: the mockup was commissioned as one combined screen covering both stories together (per the design brief), so it naturally shows the end-state UI — that does not mean this Story ships that whole state. This changes Frontend's actual build scope and this Story's Definition of Done.

***Recommended default (NOT ratified — needs explicit PO call)***: `scope.md` wins. This Story ships with the header + an empty "no plans attached yet" placeholder — no Attach-plans button, no readiness card, no attached-plans table. Those arrive with the sibling story. Frontend needs a reduced variant of the detail view for this Story's release; Design should confirm whether that reduced state already exists or needs producing.

***Alternative*** (if PO decides otherwise): both stories ship as one integrated increment despite separate Jira tracking, in which case the mockup is correct as-is and `scope.md`'s "empty plans area" wording should be updated to match.

### PO decisions (ratified — cheapest, already-implemented defaults)

1. ***No upper bound on target date.*** The mockup's date picker sets only `min` (today), never a `max`, and no validation path checks one — matches the already-drafted AC. Ratifies the previously open Q1.
2. ***Internal-whitespace name variants are allowed as distinct milestones.*** The mockup's `validateMs()` trims leading/trailing whitespace only before comparing, matching Backend's already-built `UNIQUE(project_id, lower(trim(name)))` index — changing this now would require a DB index migration for a rare, cosmetic edge case. Ratifies the previously open Q2.

### Dev Frontend correction (supersedes the 2026-07-24 decision)

1. ***Editing is inline, not a modal.*** The 2026-07-24 session assumed "editing reuses the create-dialog in edit mode." The delivered mockup does the opposite: `Edit details` swaps a card inline into the detail page (readiness card and attached-plans table stay visible below), while `Create` uses a true modal overlay. The mockup is the current, most recent decision — the DRAFT text from 07-24 is corrected. This affects locator/ATC design for automation (`#edit-form` inline card vs. `.overlay .modal`) and manual test steps (Esc key behavior is a separate code path for inline edit vs. overlay dismiss).

### Design notes (non-blocking, confirm-only)

1. ***Live character counter under description — not present in the mockup.*** The 2026-07-24 session called for one given the new 500-char cap; the delivered mockup shows a plain textarea with no counter. Weak, inconclusive evidence (could be a prototype omission, could be a reversed decision) — confirm with Design, do not change any AC either way.
2. ***UI copy says "Editor access," the ratified role name is "member."**** The mockup's viewer-role note reads **"Editing and attaching plans require Editor access"* — but `business-rules.md` and every AC use the real role name "member." Recommend aligning the copy before implementation so QA and users aren't tracking two different vocabularies for the same gate.

### QA notes

- Live mockup review used a local static server + Playwright screenshots across List / Create / Detail / Edit / Overdue / Viewer-role states — no state variant omits the Attach/Readiness UI, which is the strongest evidence behind the C1 finding.
- `business-rules.md`'s "Design intent" line ("days-remaining counter that changes tone as the date approaches") is stale — already superseded by the 2026-07-24 Design decision ("no urgency/overdue color treatment for this Story") and confirmed absent in the mockup (only a binary on-track/overdue chip). Recommend a doc cleanup pass, not an AC change.
- Full mockup cross-reference detail, screenshots, and reasoning: local working file `shift-left-refinement.md` in this Story's PBI folder.

## C1 — RESOLVED (2026-08-05)

***Decision***: `scope.md` wins. BK-206 (assign test plans / track milestone readiness) remains in Backlog and has not started; this Story's own `scope.md` already defines the release-1 deliverable as "Milestone detail view with its details and an empty plans area." BK-205 ships the detail view WITHOUT the Attach-plans button, readiness card, or attached-plans table — those arrive with the sibling story. The combined mockup (`milestones-board.html`) is the target end-state once BK-206 also ships, not part of this Story's Definition of Done.

***Made concrete***: a new AC scenario was added — "Should open a milestone's detail view showing only its own details and an empty plans area" (`@scope-boundary`) — so Frontend and QA have a testable definition of the reduced state, not just prose in `scope.md`.

***No change needed*** to `scope.md` or `out-of-scope.md` — both already stated this; the gap was that the mockup (delivered after those fields were written) looked like it contradicted them, and nothing had explicitly reconciled the two until now.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Story (1)

- [BK-206](https://jira.upexgalaxy.com/browse/BK-206): TMS-Milestone | Assign test plans and track milestone readiness _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/5/2026
- **Reporter:** Ely
- **Assignee:** Carlos Alcala
- **Labels:** new-feature, post-mvp, shift-left-2026-07-22, shift-left-2026-08-04, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
