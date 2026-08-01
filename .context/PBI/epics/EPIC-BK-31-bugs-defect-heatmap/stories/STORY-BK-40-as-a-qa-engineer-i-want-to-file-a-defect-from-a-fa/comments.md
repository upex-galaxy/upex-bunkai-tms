# Comments for BK-40

[View in Jira](https://jira.upexgalaxy.com/browse/BK-40)

---

### jesusgpythondev - 6/17/2026, 2:24:34 PM

## Refined Acceptance Criteria (Shift-Left QA pass - 2026-06-17)

> ***INFO:*** Refined and consolidated by QA during the pre-sprint Shift-Left review. These scenarios are the acceptance contract; reconciliation, risks, and ATP details live in the ATP / QA handoff comments.

```gherkin
Background:
  Given an authenticated project member has write access to the current project
    And a Test Run exists for that project

# ---- Happy path ----

Scenario: Open run-linked defect form from a failed step
  Given the user is executing a manual run
    And a run step has status "failed"
    And the run context includes module, executed steps, failing ATC, and captured evidence references
  When the user selects "Report defect"
  Then the defect form opens
    And module is prefilled from the run context
    And steps-to-reproduce are prefilled from executed steps
    And the failing ATC is linked or displayed
    And captured evidence references are listed
    And run, step, and ATC context cannot be reassigned manually

Scenario: Save a valid run-linked defect
  Given the defect form was opened from a failed run step
    And title length is between 5 and 200 characters
    And severity is P1, P2, P3, or P4
    And module belongs to the current project
    And evidence link count is 10 or fewer
  When the user saves the defect
  Then the defect is created in "open" state
    And it is visible in the defects list
    And it preserves the run, step, ATC, module, and evidence context

Scenario: Save a standalone defect
  Given the user opens the defects area
  When the user creates a defect with valid title, module, severity, and reproduction details
  Then the defect is created in "open" state
    And no run, step, or ATC link is required

# ---- Negative ----

Scenario: Hide run-linked defect action for non-failed steps
  Given a run step is not in "failed" state
  When the user views the step actions
  Then "Report defect" is not available for that step

Scenario: Reject invalid title length
  Given the user is filing a defect
  When the title has fewer than 5 characters or more than 200 characters
  Then saving is blocked
    And a clear title-length message is shown

Scenario: Reject missing or cross-project module
  Given the user is filing a defect
  When the module is empty or belongs to another project
  Then saving is blocked
    And no defect is created

Scenario: Reject invalid severity
  Given the user is filing a defect
  When severity is missing or not P1, P2, P3, or P4
  Then saving is blocked
    And a clear severity message is shown

# ---- Boundary ----

Scenario: Enforce evidence link limit
  Given the user is filing a defect
  When exactly 10 evidence links are attached
  Then saving remains allowed if all other fields are valid
  When an 11th evidence link is added
  Then the extra link is blocked
    And a clear evidence-limit message is shown

# ---- Integration ----

Scenario: Defect remains TMS-native without Jira sync
  Given a valid defect is filed from a failed run step
  When the defect is saved
  Then it is stored as a Bunkai TMS defect
    And it is linked to the relevant project, module, and run context when present
    And Jira issue creation or sync is not required for BK-40
```

***Copied from Refined AC by QA - Shift-Left pass 2026-06-17. PO ownership of this contract returns after Estimation grooming; any further AC edits must go through PO.***

---

### jesusgpythondev - 6/17/2026, 2:24:34 PM

## QA Handoff Mirror - BK-40 Shift-Left Review Update

> ***SUCCESS:*** BK-40 is now formatted using the same rich ADF pattern validated by BK-39 and the BK-91 formatter showcase: fenced `gherkin` for ACs, visual risk signals, and compact mirror content.

## Executive Summary

BK-40 defines how a QA Engineer files a TMS-native defect from a failed run step, while preserving run context and avoiding duplicate typing. The primary quality concern is context integrity: the saved defect must keep the correct run, step, ATC, module, and evidence references without allowing cross-project leakage.

## Refinement Delta

-  AC format corrected to a fenced `gherkin` block in the AC comment.
-  Expert-panel decisions retained: failed-step-only MVP; standalone filing in scope; Jira sync/file upload out of scope.
-  Custom-field REST update is still blocked by env/API mismatch, so AC/ATP remain fallback comments.
-  This comment is the QA mirror only; full AC and ATP content live in their dedicated fallback comments.

## ATP Draft Summary

| ID | Focus | Priority |
| --- | --- | --- |
| ATP-P1 | Open run-linked defect form | High |
| ATP-P2 | Save valid run-linked defect | High |
| ATP-P3 | Save standalone defect | Medium |
| ATP-N1 | Non-failed step has no report action | High |
| ATP-N2 | Invalid title length blocked | Medium |
| ATP-N3 | Missing/cross-project module blocked | High |
| ATP-N4 | Invalid severity blocked | Medium |
| ATP-B1 | Evidence limit enforced | High |
| ATP-I1 | No Jira sync required | High |

## High And Medium Risks

> ***ERROR:*** High: wrong run/step/ATC context, cross-project module injection, and evidence leakage. Covered by ATP-P1, ATP-P2, ATP-N3, and ATP-B1.

> ***WARNING:*** Medium: non-failed step filing, invalid title, invalid severity, and standalone missing context. Covered by ATP-N1, ATP-N2, ATP-N4, and ATP-P3.

## Open Confirmations

None blocking. Expert recommendations stand unless PO/Dev intentionally expand scope.

## Dependency Note

BK-40 depends on BK-35 failed-step state and BK-70 defect foundation. BK-41/BK-42/BK-43 remain downstream and out of scope.

## QA Story Points Recommendation

- Recommendation: 5 SP
- Confidence: 0.82
- Basis: effort=Med; complexity=Med; uncertainty=Low-Med; risk=Med
- Re-estimation triggers: Jira sync; file upload; blocked/skipped-step filing; expanded permissions; BK-35 contract change.
- Boundary: QA recommendation only; Jira estimate remains canonical unless explicitly updated.

## Out Of Scope

Jira sync/export, file upload evidence, defect lifecycle beyond initial `open`, marking a step failed, formal TC creation, automated test implementation.

## QA Publication Status

- Description updated: yes
- AC field updated: no - fallback comment updated because custom-field REST update returned 404 while `acli` mutations worked
- ATP field updated: no - fallback comment updated because custom-field REST update returned 404 while `acli` mutations worked
- QA mirror updated: yes
- Labels applied: `shift-left-reviewed`, `shift-left-2026-06-17` yes
- Read-back verification: required after this correction

---

### jesusgpythondev - 6/17/2026, 2:24:35 PM

## Acceptance Test Plan (ATP) DRAFT - BK-40

> ***INFO:*** Coverage estimate: Positive 3, Negative 4, Boundary 1, Integration 1, API 0, Total 9.

Rationale: BK-40 is a form-plus-context persistence story with one upstream run-state dependency, validation rules, boundary coverage, and security-relevant project scoping. The ATP stays outline-level because formal TC creation belongs to `/test-documentation` and automation belongs to `/test-automation`.

| ID | Outline | Priority | Precondition | Expected result | Automation hint |
| --- | --- | --- | --- | --- | --- |
| ATP-P1 | Open run-linked defect form | High | Failed run step exists | Form opens prefilled with module, executed steps, failing ATC, and evidence references | Candidate |
| ATP-P2 | Save valid run-linked defect | High | Valid defect fields and <=10 evidence links | Open defect is created, visible, and preserves run context | Candidate |
| ATP-P3 | Save standalone defect | Medium | Defects area is available | Open standalone defect is created without run/step/ATC link | Candidate |
| ATP-N1 | Non-failed step has no report action | High | Step is not failed | `Report defect` is unavailable | Candidate |
| ATP-N2 | Invalid title length blocked | Medium | Title length is 4 or 201 | Save is blocked with clear title message | Candidate |
| ATP-N3 | Missing/cross-project module blocked | High | Module is empty or outside current project | Save is blocked and no defect is created | Candidate |
| ATP-N4 | Invalid severity blocked | Medium | Severity is missing or outside P1-P4 | Save is blocked with clear severity message | Candidate |
| ATP-B1 | Evidence limit enforced | High | 10 evidence links are present | 10 are accepted; 11th is blocked with clear message | Candidate |
| ATP-I1 | No Jira sync required | High | Defect is saved from failed run step | TMS-native defect exists; Jira issue creation/sync is not required | API/DB candidate later |

## Edge Cases And Risks

> ***ERROR:*** High risks must stay visible during grooming because they affect data integrity, workspace isolation, or evidence access.

| Severity | Risk | Mitigation | Coverage |
| --- | --- | --- | --- |
| :red_circle: High | Defect filed against wrong run step | Make run/step/ATC context non-editable in run-linked flow | ATP-P1, ATP-P2 |
| :red_circle: High | Cross-project module injection | Enforce project-scope validation server-side | ATP-N3 |
| :red_circle: High | Evidence leakage across projects | Validate evidence ownership/access and max count | ATP-B1 |
| :large*orange*circle: Medium | User tries to file from non-failed step | Hide/block action | ATP-N1 |
| :large*orange*circle: Medium | Invalid severity pollutes reporting | Strict enum validation | ATP-N4 |
| :large*orange*circle: Medium | Title validation inconsistent at boundaries | Enforce 5-200 boundary | ATP-N2 |
| :large*orange*circle: Medium | Standalone defects lack run context | Require manual title/module/severity/repro fields | ATP-P3 |
| :green_circle: Low | Jira sync expectation confusion | Explicitly exclude Jira sync from BK-40 | ATP-I1 |

## QA Story Points Recommendation

- Recommendation: 5 SP
- Confidence: 0.82
- Basis: effort=Med; complexity=Med; uncertainty=Low-Med; risk=Med
- Rationale: 9 ATP outlines, one upstream state dependency, controlled validation scope, and no Jira sync/file upload keep it at 5 SP.
- Re-estimation triggers: Jira sync moves into BK-40; file upload enters scope; blocked/skipped step filing enters scope; permission model expands; BK-35 changes failed-step contract.
- Boundary: QA recommendation only; Jira Story Points / Epic / User Story fields remain canonical unless explicitly requested.

---

### Ely - 7/30/2026, 1:28:13 PM

Mockup — Bug detail (defect record, read view). Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-detail.html · spec: master-design-plan §4.6



---

### Ely - 7/31/2026, 6:45:41 PM

## Spec Implementation Plan (Dev)

> Fallback comment — the `customfield_10095` REST update rejected a markdown body ("Operation value must be an Atlassian Document"); the ADF-converted equivalent hit the same field-publishing friction this ticket's own AC/ATP custom fields already show in the comment trail above (404 on those). Posting as a comment per `.agents/jira-required.yaml`'s declared fallback for this field, same convention as the AC/ATP fields on this same ticket.

# BK-40 Implementation Plan — TMS-Defect Filing (File a defect from a failing run step)

## Technical Decisions

1. ***Naming: DB/routes/UI say "bug", Jira prose can keep saying "defect."**** `domain-glossary.md` defines the canonical entity as Bug; the live mockups agree (`BugDrawer`, "Report bug", `bug-reports-index.html`, sidebar nav label "Bug Reports"). Building: table `bugs`, routes `/bugs`, component names `Bug**`. Jira content stays untouched by this decision.
2. ***Bare-bones list scope.*** BK-40 ships an unfiltered, newest-first, single-page list at `/projects/[projectSlug]/bugs` with a "New bug" trigger — zero filter chips/counts/heatmap (those are BK-41/BK-42's additive work on the same route). Evidence: master-design-plan.md §4.6's Build order note explicitly assigns filter/count/heatmap to BK-41/BK-42; neither mockup shows a "New bug" button anywhere.
3. ***No ***`/bugs/[bugId]` detail page in BK-40. Neither the AC nor comments.md ever test opening a filed bug's detail record. §4.6's Build order note assigns `bug-detail.html` to BK-43 (sync-status states). The bare list's row shows enough inline to satisfy "immediately visible."
4. ***Authorization model: Path A (explicit-actor SECURITY DEFINER), reusing ***`bunkai*assert*actor*can*write*project`. ADR-0001 already settles this. Reuses the existing helper from `0021*atc*create*update.sql` verbatim. No new ADR needed.
5. `bugs.status` gets the full lifecycle enum now (open/in_progress/resolved/closed), even though BK-40 only ever writes `open` — mirrors `runs.status`'s own precedent.
6. ***Evidence: ***`text[]` column with a DB-level CHECK (<=10), not a child table. Mirrors `atcs.tags text[]`, strengthened with a DB CHECK given the named HIGH cross-project risk.
7. ***Run-linked context (module/run/step/ATC) is server-derived, never client-supplied.*** Eliminates the "wrong context"/"cross-project injection" risk by construction.
8. ***Steps-to-reproduce AND evidence are editable in the run-linked drawer*** — the shift-left AC's "Editable context" decision governs over the mockup's static rendering, which is silent rather than contradicting it.
9. ***UI integration: a centered modal dialog***, matching the live `RunnerView.tsx`'s existing Abort/Finish modal family, not the mockup's right-side drawer layout — the live runner (BK-34/35/36/39) has no reserved right-column slot. Per Critical Rule #14 (live-UI-first).
10. ***No navigation wiring for ***`/bugs` in BK-40 — matches the already-shipped precedent that `/runs` (BK-38, live on staging) also has no sidebar link yet.
11. ***One shared form component (***`BugFormDialog`) serves both entry points, parameterized by an optional `runContext` prop.
12. ***Route shape: flat ***`POST /api/v1/bugs`, nested `GET /api/v1/projects/[id]/bugs` — matches this codebase's existing split.
13. ***Capability gate: reuse ****`atc:write` for POST, no `requires` for GET — matches existing sibling-route precedent, not inventing a new `bug:**` capability.
14. ***Include a nullable ***`description` column — both relevant mockups show a distinct Description field the Jira ACs never test.
15. ***No realtime.*** Filing a bug is a one-shot create + page-load read.
16. ***Migration number and SQLSTATE block are placeholders (0045, 453xx)*** — Stage 2 must re-verify against `mcp_*supabase**list*migrations` before writing the file (shared Supabase project, concurrent workers).
17. ***Small DRY extraction: hoist ***`isValidUrl` out of `lib/runs/mark-step-view.ts` into a shared helper.

## Schema

New migration `supabase/migrations/00XX*bugs.sql` (table -> RLS -> composer function -> write RPC -> read RPC, mirrors `0031*runs.sql`):

```
bugs: id, workspace*id, project*id, module*id, run*id?, run*step*id?, atc_id?,
      title (check 5-200), severity (check P1-P4), status (check open/in_progress/resolved/closed, default open),
      description?, steps*to*reproduce, evidence*urls text[] (check <=10), created*by, created*at, updated*at
RLS: select = workspace member; insert = workspace write-role (defense-in-depth; real inserts go via RPC)
bunkai*bug*json(p*bug*id) -- composer
bunkai*create*bug(p*actor*user*id, p*project*id, p*module*id, p*title, p*severity, p*description,
                   p*steps*to*reproduce, p*evidence*urls, p*run*id, p*run*step*id, p*atc*id) returns jsonb security definer
  1. v*workspace*id := bunkai*assert*actor*can*write_project(...)  -- reused verbatim
  2. module must exist + module.project*id = p*project_id, else raise
  3. title/severity/evidence-count backstops at RPC level
  4. insert, status defaults 'open'; activity_log audit insert
  5. return bunkai*bug*json(new id)
bunkai*list*project*bugs(p*actor*user*id, p*project*id) returns jsonb security definer -- read-gate, any active role
```

## API

`POST /api/v1/bugs` — create (run-linked + standalone), `auth: required, requires: ['atc:write']`. Run-linked body derives project/module/run/atc server-side from `run*step*id` (never client-supplied); standalone requires explicit `project*id`+`module*id`. Validates title 5-200, severity enum, evidence <=10 URLs. Response `{ bug }`, 201.

`GET /api/v1/projects/[id]/bugs` — bare list, `auth: required`, no query params (BK-41 extends additively). Response `{ items }`, newest-first.

Both get `route.openapi.ts`; `public/openapi.json` regenerated + committed in the same PR.

## UI

***Run-linked ("Report bug"):*** wired into the live `components/runs/RunnerView.tsx`, per-step block. Button only when step is `failed`. Opens `components/bugs/BugFormDialog.tsx` as a 4th centered modal (Abort/Finish family). Prefill: title stub, severity default P3, module server-derived read-only, steps-to-reproduce = executed step content, evidence = captured URLs (editable, capped 10).

***Standalone ("New bug"):*** `app/(app)/projects/[projectSlug]/bugs/page.tsx` + `components/bugs/BugsListView.tsx` — bare unfiltered table + "New bug" button opening the same dialog with no `runContext`.

## Task breakdown (16 steps)

1. Confirm migration number/SQLSTATE live; write migration. 2. `lib/bugs/constants.ts`. 3. Extract `isValidUrl` to shared helper. 4. `lib/bugs/validation.ts` + tests. 5. `lib/bugs/errors.ts` + tests. 6. `lib/bugs/list-view.ts` + tests. 7. `lib/supabase/rpc.ts` wrappers. 8. `app/api/v1/bugs/route.ts` + openapi + tests. 9. `app/api/v1/projects/[id]/bugs/route.ts` + openapi + tests. 10. `openapi:gen` + commit. 11. `lib/bugs/isolation.test.ts` (cross-project injection + actor-bind regression, real-login pattern per `live-ui-identity.md` §3). 12. `lib/runs/report-bug-view.ts` + tests. 13. `components/bugs/BugFormDialog.tsx`. 14. Wire into `RunnerView.tsx`. 15. Standalone page + list view. 16. Tests -> types -> lint.

## ATP -> implementation mapping

| ATP | Focus | Implementation |
| --- | --- | --- |
| ATP-P1 | Open run-linked form, prefilled | `report-bug-view.test.ts` |
| ATP-P2 | Save valid run-linked defect | `route.test.ts` + `isolation.test.ts` |
| ATP-P3 | Save standalone defect | `route.test.ts` |
| ATP-N1 | No report action on non-failed step | `report-bug-view.test.ts` + route backstop |
| ATP-N2 | Invalid title length blocked | `validation.test.ts` |
| ATP-N3 | Missing/cross-project module blocked | `isolation.test.ts` |
| ATP-N4 | Invalid severity blocked | `validation.test.ts` |
| ATP-B1 | Evidence limit enforced | `validation.test.ts` + DB CHECK |
| ATP-I1 | No Jira sync required | `route.test.ts` (no sync columns/call) |

## Review Workload Forecast

```
Estimated: 3660 additions + 45 deletions = 3705 total lines
400-line budget risk: High
Chain strategy: feature-branch-chain
Decision trace: Q1=No (greenfield new-domain feature work, not mechanical) . Q2=No (even the 3 natural slices exceed 400 lines each) . Q3=Yes (new bugs table/RLS/RPCs are shared scaffolding both UI slices depend on) -> feature-branch-chain
Decided by: /git-flow-master §Chained-PR decision tree
Decision needed before apply: No (resolved)
```

Execution shape: PR-per-slice against a long-lived integration branch (`feat/BK-40-bug-filing`), self-merged by the worker, final integration -> staging PR through Agent 4 — ruling recorded 2026-07-31 in `escalation-log.md`, settling the chain-execution-shape ambiguity between generation-1 workers. 3 slices: (1) DB+RLS+RPC+API, (2) runner-drawer UI, (3) standalone list+form UI.

---


_Synced from Jira by sync-jira-issues_
