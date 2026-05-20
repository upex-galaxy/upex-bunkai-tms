# FR-010b — ATC creation UI (multi-step builder + assertion builder)

**Jira Key:** [BK-19](https://upexgalaxy67.atlassian.net/browse/BK-19)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** 1
**Status:** Backlog

---

## User Story

As a tester or QA author,

I want a guided UI form to create ATCs with multiple steps and assertions,

So that I can build reusable test components without writing JSON or curl commands.



Anchors PRD US 4.1 and US 4.2, implements the client side of SRS FR-010. Consumes the API from Story FR-010a — does not duplicate cross-entity validation.

---

## Acceptance Criteria

Scenario: Author creates an ATC through the multi-step builder

  Given the user is on /modules/{moduleId}/atcs/new

  And the user has selected user story US-100 and acceptance criteria AC-1

  When the user fills title "Login with valid email", layer "UI", adds 3 steps and 2 assertions, and clicks "Create"

  Then the form POSTs to /atcs with the assembled payload

  And on 201 the user is redirected to the new ATC detail page

  And a success toast "ATC created" appears



Scenario: Form surfaces API validation errors without losing user input

  Given the user has filled a valid-looking form

  When the API returns 422 with error code "ac_outside_user_story"

  Then the AC picker shows an inline error "Selected criteria do not belong to this user story"

  And all other form fields keep their values

  And the user can correct the selection and resubmit



Scenario: Step builder enforces strictly increasing positions in the UI

  Given the user adds 3 steps

  When the user drags step 3 above step 1

  Then positions are auto-renumbered to 1, 2, 3

  And the submitted payload reflects the new order



Scenario: AC picker filters by selected user story

  Given the user has selected user story US-100

  When the AC dropdown is opened

  Then only acceptance criteria belonging to US-100 are listed

  And selecting a different user story clears any previously-selected ACs



Scenario: Tag input enforces 10-tag maximum with chip UX

  Given the user has added 10 tags

  When the user attempts to add an 11th tag

  Then the input is disabled

  And a hint "Maximum 10 tags reached" is shown beneath the input

---

## Business Rules

- Form fields mirror API contract exactly — no client-only fields silently dropped

- Title 3..200 chars with live character counter

- At least 1 step and at least 1 acceptance criterion required to enable Submit

- Step content textarea capped at 2KB with character counter

- Optimistic UI is NOT used on create — wait for 201 before redirecting (avoids ghost rows on rollback)

- Form preserves draft in component state across validation failures; only cleared on success

---

## Scope

- Route /modules/{moduleId}/atcs/new with multi-step builder form

- Step builder: add/remove/reorder steps with position auto-renumber

- Assertion builder: add/remove assertions in parallel section

- Layer picker (UI / API / Unit) as segmented control

- User Story + Acceptance Criteria dropdowns with cascading filter

- Tag chip input with 10-tag cap and inline validation hint

- Server error mapping (error code -> field-level message)

- Loading and disabled states during submit

- Success redirect to ATC detail page

---

## Workflow

The author lands on /modules/{moduleId}/atcs/new. The form initializes with the module pre-selected, then the user picks a User Story (dropdown queries /user-stories?module_id=...), which triggers loading of acceptance criteria into the AC picker. The user fills title, picks layer, builds steps and assertions through the inline builders, and adds tags. On Submit the form assembles the payload, calls POST /atcs, shows a spinner, and either redirects to the new ATC detail page on 201 or maps server error codes to inline field messages on 422.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Luis Daniel Medina Meléndez 
- **Labels:** atc, frontend, mvp, ui, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:07.268Z_
