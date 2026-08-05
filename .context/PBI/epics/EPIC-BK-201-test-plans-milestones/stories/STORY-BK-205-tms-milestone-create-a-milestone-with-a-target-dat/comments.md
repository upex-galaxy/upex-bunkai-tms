# Comments for BK-205

[View in Jira](https://jira.upexgalaxy.com/browse/BK-205)

---

### Ely - 7/11/2026, 12:52:48 PM

## PO Ratification — 2026-07-11

- T1 ratified: milestone name 1–100 chars, unique per project (case-insensitive) — now a PO-final rule, no longer convention-derived. Business Rules field updated accordingly.
- T4 confirmed: target date must be today or a future date at creation; overdue signaling once the date passes with readiness incomplete is covered in the readiness story.

---

### Carlos Alcala - 7/22/2026, 11:31:04 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

The ATP DRAFT lives in the 🧪 Acceptance Test Plan (ATP) field on this Story.

Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.

Refined on: 2026-07-22 — QA Shift-Left batch session
Local working copy: `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-205-tms-milestone-create-a-milestone-with-a-target-dat/shift-left-refinement.md`

---

### Carlos Alcala - 7/24/2026, 3:32:45 AM

## Acceptance Criteria updated after Three Amigos follow-up (2026-07-24)

@@Ely — 7 of the 9 remaining "needs confirmation" items were closed without a new decision, because they followed directly from things already agreed in the Three Amigos session (the name/date "required" rules already ratified, and Backend's exact uniqueness index `UNIQUE(project_id, lower(trim(name)))`). Only 2 genuinely need your call.

### Closed by inference (no action needed)

- Empty name / whitespace-only name / missing target date → rejected (already-ratified required-field rules)
- Target date exactly one day before today → rejected / exactly today → accepted (boundary of the already-answered "today or later" rule)
- Duplicate name differing only by leading/trailing whitespace → rejected (Backend's index trims edges)
- Same name allowed in two different projects → accepted (Backend's index is scoped by `project_id`)

### Still open — need your decision

1. ***Is there a maximum target date (upper bound), or is any future date acceptable?***

No existing decision answers this — PO capped the **description** at 500 characters, but the **target date** was never addressed, in shift-left or in Three Amigos.

1. ***Should a name that differs from an existing one only by internal whitespace (e.g. "Release 2.4" vs "Release  2.4") be allowed as a distinct milestone, or treated as a duplicate?***

This one is tied to the uniqueness requirement as a whole, not just the AC. Backend's current index — `UNIQUE(project_id, lower(trim(name)))` — only strips leading/trailing spaces, so "Release 2.4" and "Release  2.4" collide as distinct rows today. If the answer is "should be treated as duplicate", the index itself needs to change (e.g. collapse internal whitespace before comparing, not just trim edges) — this is a joint product + implementation call, not just an AC wording question. Kept open on purpose.

Full scenario-by-scenario detail: `acceptance_criteria` field on this Story.

---

### Ely - 7/30/2026, 1:29:17 PM

Mockup — Milestones board. Source: .context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/milestones-board.html · spec: master-design-plan §4.11



---

### Carlos Alcala - 8/4/2026, 11:50:34 PM

## Shift-Left Refresh — Mockup Cross-Reference (2026-08-04)

The BK-201 milestones-board mockup (added 2026-07-30) was reviewed live against the 2026-07-24 Three Amigos DRAFT and this Story's own `scope.md`/`acceptance_criteria`.

***Ratified (DRAFT, pending real sign-off)******:***

- No upper bound on target date.
- Internal-whitespace name variants allowed as distinct.
- Editing is inline, not a modal — corrects the 2026-07-24 Dev Frontend decision.

***New blocking question (C1)*** — needs a real PO/Dev/Design decision before Ready For Dev: the mockup's detail view always shows BK-206's Attach-plans/readiness UI, with no "BK-205-only" state. This Story's own `scope.md` says the detail view ships with an empty plans area only. Recommended default: `scope.md` wins, Frontend builds a reduced variant for this Story's release — but this needs explicit ratification, not AI inference.

Full writeup: Story description ("Three Amigos Session — Decisions (Refresh, 2026-08-04)") and the 🧪 Acceptance Test Plan (ATP) field. Local working copy: `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-205-tms-milestone-create-a-milestone-with-a-target-dat/shift-left-refinement.md`.

---

### Carlos Alcala - 8/5/2026, 12:00:57 AM

## C1 resolved — 2026-08-05

BK-206 is still in Backlog and this Story's own `scope.md` already defines the release-1 deliverable ("an empty plans area"). Decision: `scope.md` wins over the combined BK-201 mockup — BK-205 ships the detail view without the Attach-plans button, readiness card, or attached-plans table; those arrive with the sibling story.

Added a new AC scenario to make this testable: "Should open a milestone's detail view showing only its own details and an empty plans area" (`@scope-boundary`).

All Critical Questions raised in this refinement (Q1, Q2, C1) are now closed. Remaining non-blocking items (character-counter confirmation with Design, "Editor access" copy alignment, stale `business-rules.md` Design-intent line) stay open as low-priority follow-ups — see the Story description and `shift-left-refinement.md`.

---


_Synced from Jira by sync-jira-issues_
