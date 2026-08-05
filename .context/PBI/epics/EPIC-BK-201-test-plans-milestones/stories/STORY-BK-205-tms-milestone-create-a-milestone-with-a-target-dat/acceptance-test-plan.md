# BK-205 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-205)

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205](https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205) — TMS-Milestone | Create a milestone with a target date

***Status****: Refined — Awaiting PO Estimation | ****Mode****: Shift-Left (pre-sprint) | ****Refined on****: 2026-07-22 | ****Modality***: Xray

> Worked-example dates anchor to the Story's own reference date, ***2026-07-11*** (AC3 / Ely's PO-ratification comment), not the session calendar date.

---

## Phase 1 — Critical Analysis

***Business context***: Primary persona: Mateo Silva (QA Lead) — creates milestones to anchor testing to a release goal. Secondary: Lucia (viewer) — negative case, cannot create. Value: a lightweight named delivery goal ("Release 2.4") to plan around, ahead of the readiness-aggregation capability (sibling Story [https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206)). KPI: release predictability / QA planning cadence (Epic [https://jira.upexgalaxy.com/browse/BK-201#icft=BK-201](https://jira.upexgalaxy.com/browse/BK-201#icft=BK-201)). Journey: first of two Milestone stories — this Story is the container (create + list + detail shell); [https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206) attaches Test Plans and computes readiness.

***Technical context****: Frontend — new "Milestones" rail entry, list (name/date badge/days-remaining/creator), detail tab, create dialog (name/date/description) per `business-rules.md`/`mockup.md`. Backend — ****no endpoint found***; `business-api-map.md` has zero "milestone" mentions. External services — none. Integration — Milestone belongs to one `project` (confirmed live) and create/edit permission gates off existing `workspace_members` roles (`viewer ⊂ member ⊂ admin ⊂ owner`, confirmed live). No new external integration.

***Story complexity***:

| ***Axis**** | ****Rating**** | ****Why*** |
| --- | --- | --- |
| Business logic | Medium | uniqueness (case-insensitive + trim, not internal-whitespace-collapse), date validation (today-or-later), role gate (member+) |
| Integration | Low–Medium | reuses `projects`+`workspace_members`; no new `milestones` entity yet |
| Data validation | Medium | name required 1–100 chars trimmed + unique; date required, lower-bound only; description optional, no stated upper bound |
| UI | Medium | new list view, detail tab, create dialog, date badge + days-remaining widget |

***Estimated test effort****: Medium. Creation is a single well-scoped CRUD-lite op (no readiness/aggregation logic — deferred to [https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206)), but `scope.md` also promises milestone ****editing*** with zero corresponding ACs (Gap #1) — don't finalize effort until resolved.

***Epic-level inheritance***: No `module-context.md` exists yet for EPIC-BK-201 — nothing to inherit. `epic.md`'s "nothing in this epic is manually editable progress" applies to readiness ([https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206](https://jira.upexgalaxy.com/browse/BK-206#icft=BK-206)), not this Story's create/edit of milestone fields. No PO/Dev answers exist above the Story-level PO Ratification comment (2026-07-11, in `comments.md`).

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| ***#**** | ****Location**** | ****Question for PO/Dev**** | ****Impact**** | ****Suggested clarification*** |
| --- | --- | --- | --- | --- |
| 1 | AC1 Given — "member of the project" | Literal workspace role `member`, or just "has access" regardless of role? | Determines role exercised in happy-path AC | Reword: "has workspace role `member` (or higher) and access to project X" |
| 2 | business-rules.md — visibility | Does `viewer` count as "workspace member" for ***visibility**** (yes, per inheritance) even though AC5 blocks them from ****creating***? | Read vs. write split must be unambiguous for RBAC design | Confirm viewers see list/detail but not create |
| 3 | AC3 / business-rules.md — "today or later" | Pure calendar date, or datetime? If datetime, compared at start-of-day or exact timestamp? | Sets exact BVA boundary (`today−1` vs timestamp) | State field as date-only if intended |
| 4 | AC3 | Whose "today" — server UTC or user's local timezone? | Near-midnight dates could evaluate past/future differently by clock | State authoritative clock |
| 5 | business-rules.md "member role or higher" vs AC1 "member of the project" | Gated purely by ***workspace**** role, or also a ****project***-level check? No `project*members` entity found — only `workspace*members` | Shapes RBAC Decision Table | Confirm workspace-role-only, or point to project-level mechanism |
| 6 | business-rules.md date validation | No upper bound stated — is far-future (+10y) acceptable or should it be capped? | Determines whether a max-boundary BVA outline is needed | Confirm no upper bound, or state one |

### Gaps (missing info)

| ***#**** | ****Type**** | ****Why critical**** | ****What to add**** | ****Risk if omitted*** |
| --- | --- | --- | --- | --- |
| 1 | AC/Scope mismatch | `scope.md` lists editing (name/description/target date "while active") as in-scope; ***zero ACs cover editing*** | Add edit ACs: duplicate-name-on-edit, past-date-on-edit, who may edit | Story can't be verified against its own scope; edit ships untested or silently deferred |
| 2 | Business rule | Name has explicit 1–100 char bound (ratified); description has ***no stated length limit*** | Add a max length (or state "unbounded") | Unbounded text risks DB/UI overflow; blocks a concrete BVA outline |
| 3 | AC | AC5 only covers UI-hidden create option; no AC on a ***direct API call*** by a viewer | Add: viewer direct API create → rejected (403) | Classic "button hidden, API allows" bypass risk — currently untested |
| 4 | Business rule | Uniqueness stated as a rule but no concurrency/locking behavior defined for near-simultaneous creates | State DB-level constraint (race-safe) vs. app-level pre-check only | Two users could create duplicate names under an app-layer check-then-insert race |
| 5 | AC | "member role or higher" stated but only `viewer` (negative) and implied `member` (positive) exercised; `admin`/`owner` never explicit | Add explicit admin/owner AC coverage, or state role-inheritance suffices | RBAC table left inferred, not confirmed, for the two highest roles |

### Edge cases not in Story

| ***#**** | ****Scenario**** | ****Expected (best guess)**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Two users create same name near-simultaneously | Exactly one succeeds; other gets duplicate rejection; no dup row | High | Add to AC (***NEEDS PO/DEV CONFIRMATION***) — ties Gap #4 |
| 2 | Edit active milestone's name into an existing duplicate | Rejected, same duplicate-name message | High | Add to AC (***NEEDS PO/DEV CONFIRMATION***) — ties Gap #1 |
| 3 | Edit active milestone's target date to the past | Rejected, same past-date message | High | Add to AC (***NEEDS PO/DEV CONFIRMATION***) — ties Gap #1 |
| 4 | Name is only whitespace (`"   "`) | Trims to empty → rejected as required | Medium | Test only — already implied by "required, 1–100 post-trim" |
| 5 | Name differs from existing only by ***internal**** whitespace ("Release  2.4" vs "Release 2.4") | Accepted as distinct — rule trims but doesn't collapse internal whitespace | Medium | Test only (****NEEDS PO/DEV CONFIRMATION*** on this reading) |
| 6 | Target date exactly `today − 1` | Rejected — AC3's literal example is 10 days past, not the tight boundary | High | Add to AC (***NEEDS PO/DEV CONFIRMATION***) — ties Ambiguity #3/#4 |
| 7 | Target date far future (+10y), no stated upper bound | Accepted unless PO wants a cap | Low | Ask PO (***NEEDS PO/DEV CONFIRMATION***) — ties Ambiguity #6 |
| 8 | Description of unusually large size, no bound stated | Undefined today | Medium | Ask PO (***NEEDS PO/DEV CONFIRMATION***) — ties Gap #2 |
| 9 | User local "today" vs server "today" near midnight | Undefined today | Medium | Ask PO/Dev (***NEEDS PO/DEV CONFIRMATION***) — ties Ambiguity #3/#4 |
| 10 | Same name allowed across two different projects | Accepted — uniqueness scoped "per project" | Low | Test only (***NEEDS PO/DEV CONFIRMATION*** as positive corollary) |
| 11 | Role upgraded viewer→member mid-session — Create option appears live without reload? | Undefined today | Low | Ask PO/Dev (***NEEDS PO/DEV CONFIRMATION***) |

***Contradictions***: `scope.md` states editing is in-scope; `acceptance-criteria.md` has zero edit scenarios — a scope-vs-AC-set mismatch (Gap #1) significant enough to block clean estimation. No other contradictions found; the creation-flow narrative across `story.md`/`workflow.md`/`mockup.md`/`acceptance-criteria.md` is internally consistent.

***Testability validation — Verdict:**** ****Partial.*** Issues: AC5's "option not available to her" is UI-only, no assertable server contract (Gap #3). AC3/AC4 state rejection messages exist but not verbatim copy — acceptable for DRAFT, must pin before in-sprint execution. No test-data examples for boundary cases (`today−1`, name 1/100/101 chars) — expected, deferred to in-sprint. Cannot fully isolate authorization test design until Ambiguity #5 (workspace- vs project-level check) is resolved.

---

## Phase 3 — Refined Acceptance Criteria

One consolidated table (was 18 separate scenario blocks across AC1–AC5 plus new edge-case scenarios). "Flag" = NEEDS PO/DEV CONFIRMATION where marked.

| ***#**** | ****Source AC**** | ****Scenario**** | ****Type**** | ****Priority**** | ****Given**** | ****When**** | ****Then**** | ****Flag*** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | AC1 | Create milestone; list with date + days-remaining | Positive | Critical | Mateo has role member+ in "Bunkai Web"; today 2026-07-11 | Creates "Release 2.4", target 2026-08-15, desc "Second summer cut" | Listed with name, "Aug 15, 2026" badge, "35 days left", saved description |  |
| 2.1 | AC2 | Create without description | Positive | High | Mateo viewing Milestones | Creates "Hotfix window 2.4.1", target 2026-09-01, no description | Created, listed with empty-description state, date + countdown |  |
| 2.2 | AC2 | Reject empty name | Negative | Critical | Mateo viewing Milestones | Submits empty name + valid future date | Not created; required-field message | ✅ |
| 2.3 | AC2 | Reject whitespace-only name | Negative | Medium | Mateo viewing Milestones | Submits `"   "` + valid future date | Not created; treated as empty (trims) | ✅ |
| 2.4 | AC2 | Reject missing target date | Negative | Critical | Mateo viewing Milestones | Submits valid name, no date | Not created; required-field message | ✅ |
| 2.5 | AC2 | Accept name at exactly 1 char | Boundary | Medium | Mateo viewing Milestones | Creates 1-char name + valid date | Created and listed |  |
| 2.6 | AC2 | Accept name at exactly 100 chars post-trim | Boundary | Medium | Mateo viewing Milestones | Creates 100-char name + valid date | Created and listed |  |
| 2.7 | AC2 | Reject name at 101 chars post-trim | Boundary | Medium | Mateo viewing Milestones | Creates 101-char name + valid date | Not created; max-length message |  |
| 3.1 | AC3 | Reject target date well in past | Negative | Critical | Today 2026-07-11 | Creates "Retro goal", target 2026-07-01 | Not created; "must be today or later" message |  |
| 3.2 | AC3 | Reject target date exactly `today − 1` | Boundary | High | Today 2026-07-11 | Target 2026-07-10 | Not created; same past-date message | ✅ |
| 3.3 | AC3 | Accept target date exactly = today | Boundary | Critical | Today 2026-07-11 | Target 2026-07-11 | Created; "0 days left"/"today" counter | ✅ |
| 3.4 | AC3 | Accept far-future target, no upper bound stated | Boundary | Low | Today 2026-07-11 | Target 2036-07-11 (+10y) | Created, listed, unless PO confirms a cap | ✅ |
| 4.1 | AC4 | Reject duplicate name differing only by case | Negative | Critical | "Release 2.4" exists in "Bunkai Web" | Creates "release 2.4" in same project | Not created; duplicate-name message |  |
| 4.2 | AC4 | Reject duplicate differing only by leading/trailing whitespace | Boundary | High | "Release 2.4" exists | Creates " Release 2.4 " in same project | Not created; duplicate-name message | ✅ |
| 4.3 | AC4 | Accept name differing only by internal whitespace | Positive | Medium | "Release 2.4" exists | Creates "Release  2.4" (double internal space) | Created — distinct name (trim ≠ collapse) | ✅ |
| 4.4 | AC4 | Allow same name across two different projects | Positive | Medium | "Release 2.4" exists in "Bunkai Web" | Creates "Release 2.4" in a different accessible project | Created — uniqueness scoped per project | ✅ |
| 5.1 | AC5 | Hide create option from viewer | Negative | Critical | Lucia has `viewer` role | Opens Milestones section | Create option not available |  |
| 5.2 | AC5 | Reject direct viewer API create request | Negative | Critical | Lucia has `viewer` role | Direct API create request bypassing UI | Rejected 403; no milestone created | ✅ |
| 5.3 | AC5 | Allow member/admin/owner to create | Positive | High | User has role member, admin, or owner (parametrized) | Creates with valid name + date | Created and listed, for each of the 3 roles | ✅ (admin/owner legs) |
| E1 | New (Phase 2 edge) | Reject edit-rename into duplicate | Edge | High | "Release 2.4" and "Hotfix window 2.4.1" both exist | User with edit rights renames latter to "release 2.4" | Rejected, same duplicate-name message | ✅ — no AC exists yet |
| E2 | New (Phase 2 edge) | Reject edit-target-date into the past | Edge | High | Active milestone with future target date | Edit sets date before today | Rejected, same past-date message | ✅ — no AC exists yet |
| E3 | New (Phase 2 edge) | Prevent concurrent duplicate creation | Edge | High | No "Release 2.4" milestone exists yet | Two users submit create for same name at nearly the same instant | Exactly one succeeds; other gets duplicate rejection; no dup row | ✅ — concurrency unspecified anywhere in Story |

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| ***Type**** | ****Count**** | ****Notes*** |
| --- | --- | --- |
| Positive | 5 | Happy-path creation + uniqueness/cross-project/RBAC-positive corollaries |
| Negative | 8 | Required-field, past-date, duplicate-name, RBAC-negative variants |
| Boundary | 6 | Name-length BVA (1/100/101) + target-date BVA (today−1/today/far-future) |
| Integration | 0 | No external integration point; project-scoping + RBAC reuse existing entities, already exercised above |
| API | 0 | No confirmed endpoint yet (Data feasibility flags); outlines assume the eventual contract |
| ***Total**** | ****19*** | drives PO estimation |

***Rationale***: two genuine input ranges (name length, target date) and one RBAC decision — each a binding technique trigger. Name-length BVA → 3 outlines (min/max/max+1); date BVA → 3 (min−1/min/unbounded-max check); RBAC decision table → 2 negative legs (UI-hidden + API-enforced) + 1 parametrized positive leg (member/admin/owner). Remainder is EP on required fields and on the uniqueness rule's partitions (case-fold dup, whitespace-trim dup, internal-whitespace non-dup, cross-project non-dup). No padding — every outline explores a partition/boundary/rule a sibling doesn't.

### Outline list (names only)

***Positive***

- Should create a milestone with name, target date, and description and list it with date + days-remaining — Pre: role member+. Expected: listed with correct badge/countdown.
- Should create and list a milestone when description is omitted — Pre: role member+. Expected: listed with empty-description state.
- Should allow the same milestone name in two different projects — Pre: name used in project A, user has access to B. Expected: succeeds in B. — ✅
- Should accept a name differing from an existing one only by internal whitespace — Pre: "Release 2.4" exists. Expected: "Release  2.4" accepted as distinct. — ✅
- Should allow member, admin, and owner roles to create — Pre: role parametrized. Expected: succeeds for all three. — ✅ (admin/owner legs)

***Negative***

- Should reject creation when target date is in the past — Pre: today 2026-07-11. Expected: rejected, past-date message.
- Should reject creation when name is empty — Pre: valid future date. Expected: rejected, required-field message.
- Should reject creation when name is only whitespace — Pre: valid future date. Expected: rejected as empty. — ✅
- Should reject creation when target date is missing — Pre: valid name. Expected: rejected, required-field message.
- Should reject duplicate name differing only by case — Pre: "Release 2.4" exists. Expected: rejected, duplicate message.
- Should reject duplicate differing only by leading/trailing whitespace — Pre: "Release 2.4" exists. Expected: rejected, duplicate message. — ✅
- Should not expose create-milestone UI option to a viewer — Pre: viewer role. Expected: option absent.
- Should reject a viewer's direct create API request even with UI hidden — Pre: viewer role, direct API. Expected: 403, none created. — ✅

***Boundary***

- Should accept name at exactly 1 char — Pre: valid future date. Expected: succeeds.
- Should accept name at exactly 100 chars post-trim — Pre: valid future date. Expected: succeeds.
- Should reject name at exactly 101 chars post-trim — Pre: valid future date. Expected: rejected, max-length message.
- Should reject target date exactly `today − 1` — Pre: today 2026-07-11, target 2026-07-10. Expected: rejected, past-date message. — ✅
- Should accept target date exactly = today — Pre: today 2026-07-11, target 2026-07-11. Expected: succeeds, "today"/0-days countdown. — ✅
- Should accept target date far in the future, no stated upper bound — Pre: target = today+10y. Expected: succeeds unless PO confirms a cap. — ✅

***Integration***: None identified — no external integration point; project-scoping/RBAC checks reuse existing entities, already covered above.

---

## Phase 5 — Edge Cases (DRAFT)

| ***#**** | ****Edge case**** | ****In original Story?**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Two users create same name near-simultaneously (race) | No | High | Add to AC (✅) |
| 2 | Edit active milestone's name into an existing duplicate | No | High | Add to AC (✅) |
| 3 | Edit active milestone's target date to the past | No | High | Add to AC (✅) |
| 4 | Name is only whitespace (trims to empty) | No | Medium | Test only |
| 5 | Name differs from existing only by internal whitespace | No | Medium | Test only (✅ on intended behavior) |
| 6 | Target date exactly `today − 1` | Partially (AC3 gives non-boundary example) | High | Add to AC (✅) |
| 7 | Target date far future, no upper bound stated | No | Low | Ask PO (✅) |
| 8 | Description of unusually large size, no bound stated | No | Medium | Ask PO (✅) |
| 9 | User local "today" vs server "today" near midnight | No | Medium | Ask PO/Dev (✅) |
| 10 | Same name allowed across two different projects | No (implied) | Low | Test only |
| 11 | Role upgraded mid-session (viewer→member) — Create option live without reload? | No | Low | Ask PO/Dev (✅) |

> ✅ = NEEDS PO/DEV CONFIRMATION. Test-data generation strategy + Faker recipes are NOT defined here — they land in `/sprint-testing` Stage 1 once the feature exists.

---

## Story Quality Assessment

***Verdict***: Needs Improvement

- The creation-flow ACs (name/date/description, duplicate rejection, past-date rejection) are concrete, PO-ratified, and testable — a solid floor for the happy path.
- `scope.md` promises milestone editing but the AC set contains zero edit scenarios — the Story can't be verified against its own scope document as written (Gap #1).
- AC5's viewer restriction is specified only as a UI affordance; whether it's also enforced server-side is unstated — a real security-relevant gap for an RBAC-gated feature (Gap #3).

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***Should ACs be extended to cover milestone editing, or should editing move out of scope explicitly?*** Context: `scope.md`/`business-rules.md` describe editing name/description/target date "while active", but zero edit scenarios exist in the ACs. Impact if unanswered: Story can't be estimated or called "done" against its own scope; edit validation ships untested. Suggested: add 2-3 edit ACs mirroring create validations (duplicate-name, past-date), reusing the same rejection messages.
2. ***Should AC5 also state server-side enforcement (API rejects a direct viewer create), not just UI-hiding?*** Context: AC5's only assertion is a UI-only claim. Impact if unanswered: a real authorization bypass ships untested (button hidden, API allows). Suggested: add "...and a direct API request to create a milestone as a viewer is rejected with 403."
3. ***Should admin/owner get explicit AC coverage, or is role-inheritance sufficient without new ACs?*** Context: only `viewer` (negative) and implied `member` (positive) are exercised; admin/owner are inferred. Impact if unanswered: RBAC table ships with two legs based on inference. Suggested: confirm role-inheritance suffices (no new AC needed) — cheapest resolution if true.
4. ***Is there a maximum length for the milestone description?*** Context: name has an explicit 1–100 char bound; description has none. Impact if unanswered: no concrete boundary can be designed; DB column type and UI validation left to Dev's guess. Suggested: none — needs a PO/Dev decision.

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. Is the target date a pure calendar date (DATE column) or does it carry a time component? — affects the comparison basis for the "today or later" boundary.
2. Is "today" evaluated in server UTC or the requesting user's local timezone at submit time? — affects correctness near midnight.
3. Is uniqueness enforced by a DB-level constraint (e.g. unique index on `(project_id, lower(trim(name)))`), or an app-layer check-then-insert? — the latter is race-prone (Phase 5 Edge Case #1).
4. Is milestone-creation authorization gated purely by `workspace*members`, or is there also a project-level access check? — no `project*members` entity found; shapes the RBAC decision table.
5. Is there an intended upper bound on the target date? — lower priority; still needs a stated Dev decision if PO doesn't weigh in.

---

## Suggested Story Improvements

| ***#**** | ****Current state**** | ****Suggested change**** | ****Benefit*** |
| --- | --- | --- | --- |
| 1 | AC1 Given: "Mateo is a member of the project" | "Mateo has the workspace role `member` (or higher) and access to project X" | Removes Ambiguity #1 |
| 2 | business-rules.md: "member role or higher" with no admin/owner AC | Add explicit admin/owner AC scenarios, or state role-inheritance is sufficient | Closes Gap #5 |
| 3 | AC5: "option not available to her" | Add: "...and a direct API request to create a milestone is rejected with 403" | Closes Gap #3 |
| 4 | business-rules.md has no description length rule | Add an explicit max length (e.g. "up to N characters") | Closes Gap #2 |
| 5 | scope.md's edit bullet has no matching ACs | Add edit ACs mirroring create validation, or explicitly defer editing to a future story | Resolves Gap #1 |

---

## Data feasibility flags

- ***Entity/fixture missing***: no `milestones` entity/table anywhere in `business-data-map.md` (zero mentions).
- ***API contract gap***: no milestone-related endpoint anywhere in `business-api-map.md` (zero mentions).
- ***Regression scope gap***: `master-test-plan.md` has zero "milestone" mentions — feature not yet in regression scope, consistent with being unimplemented.
- ***Code-level confirmation****: search of `../upex-bunkai-tms` (`app/`, `components/`, `cli/`, excluding `node_modules`/`.next`) for "milestone" returned ****zero matches*** — no scaffolding exists, consistent with `post-mvp`/`Backlog` labeling and `business-feature-map.md` §2.10 (Status: Planned).
- ***Dependency substrate available***: `projects` and `workspace_members` ARE confirmed live — only the new `milestones` entity, API surface, and UI are missing.
- ***Required pre-work***: run a `/business-data-map` and `/business-api-map` refresh once [https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205](https://jira.upexgalaxy.com/browse/BK-205#icft=BK-205) nears implementation, to capture the new `milestones` table/endpoints before Stage 4/5 design begins.

---

## Recommended testing strategy

***Pre-implementation***: Resolve Critical Questions #1–#4 with PO and Technical Questions #1–#5 with Dev before estimation/implementation. Recommend a DB-level unique constraint on `(project_id, lower(trim(name)))` so duplicate-name is race-safe by construction, not app-layer check-then-insert.

***During implementation***: Unit/API coverage for name EP+BVA (empty, whitespace-only, 1/100/101 chars) and duplicate detection (case-fold + trim, explicitly NOT internal-whitespace-collapse). Unit/API coverage for target-date BVA (`today−1` rejected, `today` accepted). RBAC decision-table coverage (viewer: UI-hidden + API 403; member/admin/owner: allowed) once Technical Question #4 is resolved.

***Post-implementation (in-sprint by**** `/sprint-testing`****)***: `/sprint-testing` will detect the `shift-left-reviewed` label, read this file, and build the full ATP (parametrization tables, test-data JSON, numbered steps) as a superset of this draft. Run an exploratory charter for the concurrent-create race (Edge Case #1) and, once editing is clarified/implemented, for the edit-related gaps (Edge Cases #2–#3).

---

## Risks & mitigation

| ***#**** | ****Risk**** | ****Likelihood**** | ****Impact**** | ****Mitigated by which outlines*** |
| --- | --- | --- | --- | --- |
| 1 | Editing scope/AC mismatch ships unresolved (Gap #1) | Medium | High | Critical Question #1; Suggested Improvement #5; Scenarios E1/E2 |
| 2 | UI-only permission enforcement leaves an API bypass (Gap #3) | Medium | High | Critical Question #2; Negative outline "API request from viewer rejected" |
| 3 | Duplicate-name race condition under concurrent creates (Gap #4) | Low | Medium | Technical Question #3; Phase 5 Edge Case #1 |
| 4 | Timezone/date-type ambiguity causes an off-by-one-day boundary bug (Ambiguities #3/#4) | Medium | Medium | Technical Questions #1/#2; Boundary outlines "today−1"/"exactly today" |

---

## Next steps

- [ ] PO answers Critical Questions #1–#4 before sprint planning
- [ ] Dev answers Technical Questions #1–#5 before estimation
- [ ] Story enters sprint at status `Ready For Dev` once estimated
- [ ] When Story reaches `Ready For QA`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)

## Refresh — 2026-08-04 (Mockup Cross-Reference)

Live mockup reviewed (local server + Playwright): `../upex-bunkai-tms/.context/designs/.../milestones-board.html`. Ratified in this session's Three Amigos refresh (full detail in the description and in the local `shift-left-refinement.md`):

- Q1 (target date upper bound) — ratified: no upper bound.
- Q2 (internal-whitespace duplicate) — ratified: allowed as distinct.
- Edit UX corrected: inline card, not a modal — supersedes the 2026-07-24 Dev Frontend decision.
- ***NEW BLOCKING — C1***: the mockup's detail view always renders BK-206's Attach-plans/readiness UI with no "BK-205-only" state, conflicting with this Story's own `scope.md` ("empty plans area"). Needs explicit PO/Dev/Design ratification before Ready For Dev — see description for the full writeup.

## C1 resolved — 2026-08-05

`scope.md` wins: BK-206 still in Backlog, this Story ships the detail view with an empty plans area only, no Attach-plans/readiness UI. New AC scenario added to make it testable ("Should open a milestone's detail view showing only its own details and an empty plans area", `@scope-boundary`). All Critical Questions from this refinement (Q1, Q2, C1) are now closed — see description for full history.

---
_Synced from Jira by sync-jira-issues_
