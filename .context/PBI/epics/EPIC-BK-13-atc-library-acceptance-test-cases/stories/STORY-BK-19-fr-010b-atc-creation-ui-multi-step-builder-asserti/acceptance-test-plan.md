# BK-19 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-19)

# Acceptance Test Plan — BK-19: TMS-ATC Builder

***Story******:*** BK-19
***Epic******:*** BK-13 — ATC Library
***Environment******:*** staging (https://staging-upexbunkai.vercel.app)
***TMS Modality******:*** jira-native
***Shift-Left******:*** reviewed 2026-06-18 (short-circuit applied)
***Total TCs******:*** 43
***Date******:*** 2026-06-18

---

## Execution Order & TC Suite

### BK-19: TC-01: Validate ATC creation when all required fields are provided

***Precondition******:*** User is authenticated on staging; at least one User Story with one AC exists in the project.
***Steps******:*** Open the ATC builder, fill in a valid title (3–200 chars), select a layer, anchor to a User Story and one AC, add at least one step, submit.
***Expected******:*** ATC is created and the browser redirects to the ATC detail page showing the new record.
***Technique******:*** EP (happy path)
***Priority******:*** CRITICAL

---

### BK-19: TC-02: Validate AC linkage persistence in DB when ATC is saved

***Precondition******:*** ATC builder accessible; staging-dbhub or API access available.
***Steps******:*** Create a valid ATC anchored to a User Story and one AC via the builder. After redirect, call GET /api/v1/atcs/{id} or query DB to inspect `ac_ids`.
***Expected******:*** The saved record contains at least one linked AC ID matching the AC selected in the builder.
***Technique******:*** Error-Guessing (integrity verification)
***Priority******:*** CRITICAL

> Note: Requires API GET /api/v1/atcs/{id} or DB verification via staging-dbhub after UI save.

---

### BK-19: TC-03: Validate AC provenance integrity when linked AC belongs to selected User Story

***Precondition******:*** ATC saved and accessible via API or DB; ATC anchored to US-X and AC-Y (where AC-Y belongs to US-X).
***Steps******:*** After ATC creation, retrieve the record and verify the linked AC ID belongs to the User Story selected during creation.
***Expected******:*** The AC linked in the record belongs to the User Story specified — no cross-story AC linkage present.
***Technique******:*** Error-Guessing (integrity verification)
***Priority******:*** CRITICAL

> Note: Requires API GET /api/v1/atcs/{id} or DB verification via staging-dbhub after UI save.

---

### BK-19: TC-04: Validate server rejection of POST /atcs with empty ac_ids payload

***Precondition******:*** Valid auth token available; staging API accessible directly.
***Steps******:*** Send POST /atcs with a valid body but `ac_ids: []` (empty array).
***Expected******:*** Server returns a 4xx error (not 201); ATC is not created.
***Technique******:*** Error-Guessing (security boundary)
***Priority******:*** CRITICAL

> Note: Requires API GET /api/v1/atcs/{id} or DB verification via staging-dbhub after UI save.

---

### BK-19: TC-05: Validate rejection when no User Story is anchored on save

***Precondition******:*** ATC builder open with a valid title, layer, and steps entered.
***Steps******:*** Attempt to save without selecting any User Story or AC.
***Expected******:*** ATC is not saved; validation message indicates a User Story and at least one AC are required.
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-06: Validate rejection when User Story is selected but no AC is selected

***Precondition******:*** ATC builder open; User Story selected but no AC chosen.
***Steps******:*** Attempt to save with title, layer, and steps filled but AC list empty.
***Expected******:*** ATC is not saved; validation message indicates at least one AC must be selected.
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-07: Validate rejection when zero steps are present on save

***Precondition******:*** ATC builder open with title, layer, and provenance filled but no steps added.
***Steps******:*** Attempt to save.
***Expected******:*** ATC is not saved; validation message indicates at least one step is required.
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-08: Validate rejection when assertions exist but zero steps are present

***Precondition******:*** ATC builder open with assertions entered but no steps.
***Steps******:*** Attempt to save with one or more assertions and zero steps.
***Expected******:*** ATC is not saved; step-required validation fires (assertions alone are insufficient).
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-09: Validate title rejection when shorter than minimum (2 chars — below boundary)

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Enter title "AB" (2 characters) and submit.
***Expected******:*** ATC is not saved; message reads "Title must be at least 3 characters".
***Technique******:*** BVA + EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-10: Validate title rejection when empty

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Leave title blank and submit.
***Expected******:*** ATC is not saved; required-field validation fires on title.
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-11: Validate title rejection when exceeding maximum (201 chars)

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Enter a 201-character title and submit.
***Expected******:*** ATC is not saved; field-level error indicates title is too long.
***Technique******:*** BVA + EP (negative)
***Priority******:*** MEDIUM

---

### BK-19: TC-12: Validate tag input disabled and inline message shown when 11th tag is attempted

***Precondition******:*** ATC builder open with exactly 10 tags already added.
***Steps******:*** Attempt to add an 11th tag via the tag input.
***Expected******:*** Tag input is disabled; inline message "Maximum 10 tags reached" is displayed; 11th tag is not added.
***Technique******:*** EP (negative)
***Priority******:*** MEDIUM

---

### BK-19: TC-13: Validate rejection when no layer is selected on save

***Precondition******:*** ATC builder open with title, provenance, and steps filled but layer unselected.
***Steps******:*** Attempt to save.
***Expected******:*** ATC is not saved; validation message indicates a layer must be selected.
***Technique******:*** EP (negative)
***Priority******:*** HIGH

---

### BK-19: TC-14: Validate rejection when module is outside the project subtree (422)

***Precondition******:*** A module from a different project subtree is selectable or injectable.
***Steps******:*** Attempt to save an ATC with a module outside the current project (trigger `module*outside*project_subtree`).
***Expected******:*** Server returns 422; form-level or field-level error "Selected module is outside the current project" is displayed; ATC is not saved.
***Technique******:*** Error-Guessing (negative)
***Priority******:*** HIGH

---

### BK-19: TC-15: Validate field-level error display when server returns 422 title*too*short

***Precondition******:*** Form filled with valid client-side data; server configured to return 422 `title*too*short` (or intercepted via mock/proxy).
***Steps******:*** Submit the form and observe the response handling.
***Expected******:*** Field-level error "Title must be at least 3 characters" is displayed at the title field; form stays open with all state preserved.
***Technique******:*** Error-Guessing (negative)
***Priority******:*** HIGH

---

### BK-19: TC-16: Validate field-level error display when server returns 422 ac*outside*user_story

***Precondition******:*** Form filled; server returns 422 `ac*outside*user_story`.
***Steps******:*** Submit the form and observe the response handling.
***Expected******:*** Field-level error "Selected Acceptance Criteria must belong to the chosen User Story" displayed; form stays open; all fields preserved.
***Technique******:*** Error-Guessing (negative)
***Priority******:*** HIGH

---

### BK-19: TC-17: Validate field-level error display when server returns 422 steps*position*invalid

***Precondition******:*** Form filled; server returns 422 `steps*position*invalid`.
***Steps******:*** Submit the form and observe the response handling.
***Expected******:*** Field-level error "Step positions are invalid. Please reorder and try again." displayed; form stays open; all fields preserved.
***Technique******:*** Error-Guessing (negative)
***Priority******:*** HIGH

---

### BK-19: TC-18: Validate ATC creation with title of exactly 3 characters (lower valid boundary)

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Enter a 3-character title and submit.
***Expected******:*** ATC is saved successfully; detail page loads.
***Technique******:*** BVA
***Priority******:*** HIGH

---

### BK-19: TC-19: Validate ATC creation with title of exactly 200 characters (upper valid boundary)

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Enter a 200-character title and submit.
***Expected******:*** ATC is saved successfully; detail page loads.
***Technique******:*** BVA
***Priority******:*** HIGH

---

### BK-19: TC-20: Validate title rejection at 201 characters (above upper boundary)

***Precondition******:*** ATC builder open with valid layer, provenance, and steps.
***Steps******:*** Enter a 201-character title and submit.
***Expected******:*** ATC is not saved; field-level error fires indicating maximum exceeded.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-21: Validate ATC creation with exactly 10 tags (upper valid boundary)

***Precondition******:*** ATC builder open with valid title, layer, provenance, and steps.
***Steps******:*** Add exactly 10 tags and submit.
***Expected******:*** ATC is saved with all 10 tags.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-22: Validate 11th tag is rejected (above upper boundary)

***Precondition******:*** 10 tags already added in the builder.
***Steps******:*** Attempt to add an 11th tag.
***Expected******:*** Tag input disabled; message "Maximum 10 tags reached"; 11th tag not added.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-23: Validate ATC creation with step content of exactly 2048 characters (2 KB boundary)

***Precondition******:*** ATC builder open with valid title, layer, provenance.
***Steps******:*** Enter exactly 2048 characters as step content and submit.
***Expected******:*** ATC is saved; step content preserved in full.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-24: Validate step rejection when content exceeds 2048 characters (above 2 KB max)

***Precondition******:*** ATC builder open with valid title, layer, provenance.
***Steps******:*** Enter 2049 characters as step content and attempt to save.
***Expected******:*** ATC is not saved; field-level error indicates step content exceeds the 2 KB limit.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-25: Validate ATC creation with 0 tags (zero valid boundary)

***Precondition******:*** ATC builder open with valid title, layer, provenance, and steps.
***Steps******:*** Leave tags empty and submit.
***Expected******:*** ATC is saved successfully with no tags.
***Technique******:*** BVA
***Priority******:*** MEDIUM

---

### BK-19: TC-26: Validate ATC creation with 1 step and 0 assertions (minimum valid combination)

***Precondition******:*** ATC builder open with valid title, layer, and provenance.
***Steps******:*** Add exactly one step, leave assertions empty, and submit.
***Expected******:*** ATC is saved; detail page shows one step and zero assertions.
***Technique******:*** BVA
***Priority******:*** HIGH

---

### BK-19: TC-27: Validate AC selection is cleared when User Story picker changes to a different story

***Precondition******:*** ATC builder open; US-A selected with AC-1 and AC-2 checked.
***Steps******:*** Change the User Story picker to US-B.
***Expected******:*** Previously selected ACs (from US-A) are cleared; AC list refreshes to show only ACs of US-B.
***Technique******:*** State-Transition
***Priority******:*** HIGH

---

### BK-19: TC-28: Validate AC list shows only ACs of the newly selected User Story

***Precondition******:*** Two User Stories (US-A, US-B) exist with distinct ACs; US-A is initially selected.
***Steps******:*** Switch User Story picker from US-A to US-B.
***Expected******:*** AC dropdown/list contains only ACs belonging to US-B; no AC from US-A is present.
***Technique******:*** State-Transition
***Priority******:*** HIGH

---

### BK-19: TC-29: Validate step positions renumber after moving a step up

***Precondition******:*** ATC builder with at least 2 steps added in order (Step 1, Step 2).
***Steps******:*** Click "move up" on Step 2.
***Expected******:*** Step 2 becomes Step 1 and Step 1 becomes Step 2; positions renumber correctly.
***Technique******:*** State-Transition
***Priority******:*** MEDIUM

---

### BK-19: TC-30: Validate step positions renumber after moving a step down

***Precondition******:*** ATC builder with at least 2 steps added in order (Step 1, Step 2).
***Steps******:*** Click "move down" on Step 1.
***Expected******:*** Step 1 becomes Step 2 and Step 2 becomes Step 1; positions renumber correctly.
***Technique******:*** State-Transition
***Priority******:*** MEDIUM

---

### BK-19: TC-31: Validate submit button is disabled and loading indicator shown during in-flight POST

***Precondition******:*** ATC builder with all fields valid, network throttled or intercepted.
***Steps******:*** Click Submit and observe the button state while the request is in flight.
***Expected******:*** Submit button is disabled; a loading indicator is visible; user cannot click again.
***Technique******:*** State-Transition
***Priority******:*** HIGH

---

### BK-19: TC-32: Validate form state is preserved after a 422 server error

***Precondition******:*** ATC builder with all fields filled; server configured or intercepted to return 422.
***Steps******:*** Submit the form and observe state after the 422 response.
***Expected******:*** Form stays open; title, steps, ACs, and tags are all preserved; error message is displayed.
***Technique******:*** State-Transition + Error-Guessing
***Priority******:*** HIGH

---

### BK-19: TC-33: Validate second POST is prevented when submit is clicked again during in-flight request

***Precondition******:*** ATC builder with all fields valid; network throttled to create in-flight window.
***Steps******:*** Click Submit, then immediately click Submit again before the response returns.
***Expected******:*** Only one POST is sent; no duplicate ATC is created.
***Technique******:*** State-Transition
***Priority******:*** HIGH

---

### BK-19: TC-34: Validate move-up button disabled for first step and move-down button disabled for last step

***Precondition******:*** ATC builder with at least 2 steps.
***Steps******:*** Observe the reorder controls for the first and last steps.
***Expected******:*** First step has "move up" disabled; last step has "move down" disabled.
***Technique******:*** State-Transition
***Priority******:*** MEDIUM

---

### BK-19: TC-35: Validate steps are persisted in submitted order after save

***Precondition******:*** ATC builder with 3+ steps entered in a specific order.
***Steps******:*** Save the ATC and open the detail page.
***Expected******:*** Steps appear in the same order they were submitted; no reordering occurred.
***Technique******:*** EP (positive)
***Priority******:*** HIGH

---

### BK-19: TC-36: Validate ATC creation with zero assertions when at least one step is provided

***Precondition******:*** ATC builder with valid title, layer, provenance, and one step; assertions left empty.
***Steps******:*** Submit.
***Expected******:*** ATC is saved; detail page shows no assertions.
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-37: Validate ATC creation with exactly 10 tags saves all tags

***Precondition******:*** ATC builder with valid required fields.
***Steps******:*** Add exactly 10 tags and submit.
***Expected******:*** ATC is saved; detail page shows all 10 tags.
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-38: Validate ATC creation with minimum valid title (3 characters)

***Precondition******:*** ATC builder with valid layer, provenance, and steps.
***Steps******:*** Enter a 3-character title and submit.
***Expected******:*** ATC is saved; detail page title matches the 3-character input.
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-39: Validate ATC creation with maximum valid title (200 characters)

***Precondition******:*** ATC builder with valid layer, provenance, and steps.
***Steps******:*** Enter a 200-character title and submit.
***Expected******:*** ATC is saved; detail page title shows the full 200-character value.
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-40: Validate steps code editor renders a markdown numbered list in live preview

***Precondition******:*** ATC builder open; steps field is a code editor.
***Steps******:*** Enter a markdown numbered list in the steps field (e.g., "01. Open the page").
***Expected******:*** Live preview renders the numbered list correctly; format hint is visible (e.g., "01. Open the page").
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-41: Validate assertions code editor renders a YAML bullet list in live preview

***Precondition******:*** ATC builder open; assertions field is a code editor.
***Steps******:*** Enter a YAML bullet list in the assertions field (e.g., "- status == 200").
***Expected******:*** Live preview renders the YAML bullets correctly; format hint is visible (e.g., "- status == 200").
***Technique******:*** EP (positive)
***Priority******:*** MEDIUM

---

### BK-19: TC-42: Validate ATC cannot be anchored to a User Story from a different workspace

***Precondition******:*** Access to or knowledge of a User Story in a different workspace.
***Steps******:*** Attempt to create or submit an ATC anchored to a User Story outside the current workspace (via UI or direct API call).
***Expected******:*** Creation is rejected; the ATC is not saved across workspace boundaries.
***Technique******:*** Error-Guessing (security)
***Priority******:*** HIGH

---

### BK-19: TC-43: Validate ATC save is rejected when module is outside the current project subtree

***Precondition******:*** A module from an external project subtree is available for selection or injection.
***Steps******:*** Submit an ATC with a module outside the current project subtree.
***Expected******:*** Server returns 422 `module*outside*project_subtree`; error displayed; ATC not saved.
***Technique******:*** Error-Guessing (security)
***Priority******:*** HIGH

---

## Coverage Summary

| Type | Count |
| --- | --- |
| Positive (happy path + variants) | 8 |
| Negative (validation rejections) | 13 |
| Boundary — BVA | 9 |
| State / Sequence | 8 |
| Security / Integrity | 5 |
| ***Total**** | ****43*** |

---

## CRITICAL TCs

| TC | Draft ID | Description |
| --- | --- | --- |
| TC-02 | I-01 | AC linkage persistence in DB after save |
| TC-03 | I-02 | Linked AC belongs to selected User Story |
| TC-04 | I-03 | Server rejects POST /atcs with empty ac_ids |

All three require backend verification: API GET /api/v1/atcs/{id} or DB query via staging-dbhub.

---
_Synced from Jira by sync-jira-issues_
