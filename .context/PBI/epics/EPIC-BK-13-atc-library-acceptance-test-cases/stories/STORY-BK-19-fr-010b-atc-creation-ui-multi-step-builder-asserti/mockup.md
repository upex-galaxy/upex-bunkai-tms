# BK-19 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-19)

## Positive Scenarios (Happy Path + Variations)

| Outline Name | Precondition | Notes |
|---|---|---|
| ***Create ATC with US + AC + Steps + Assertions + Tags*** | Module loaded; US/AC endpoints available | Happy path end-to-end create and verify redirect. |
| ***Cascade US → AC and repopulate*** | US-A and US-B with different AC sets available | Change US mid-form and verify AC list updates. |
| ***Reorder steps with position renumbering*** | At least 3 steps added | Up/down buttons trigger reorder; positions auto-renumber. |
| ***Add assertions and submit*** | At least 1 step added | Assertion builder mirrors step UX; validates non-empty. |
| ***Tag chip cap at 10*** | Tag input available | Add exactly 10 tags; verify 11th is blocked or rejected per UX. |
| ***Redirect to detail page on 201*** | Form submitted with valid data | After POST succeeds, user lands on `/atcs/{slug}`. |

## Negative Scenarios (Validation + Error Handling)

| Outline Name | Precondition | Notes |
|---|---|---|
| ***Empty step rejected*** | Step builder open | Attempt to submit with empty step description; validation error shown. |
| ***Empty assertion rejected*** | Assertion builder open | Attempt to submit with empty assertion text; validation error shown. |
| ***AC outside US — 422 error*** | Form with US + AC selected | Simulate API error `ac*outside*user_story`; field-level error mapped; form state retained. |
| ***Module outside project subtree — 422 error*** | Module picker or context | Simulate API error `module*outside*project_subtree`; mapped to form error. |
| ***Steps position invalid — 422 error*** | Steps reordered; race condition possible | Simulate API error `steps*position*invalid`; form state retained for correction. |
| ***Title too short — 422 error*** | Title field | Enter title below minimum length (TBD); validation error mapped. |
| ***Missing US — validation error*** | Form open | Attempt to submit without selecting US; field-level validation error. |
| ***Missing AC — validation error*** | US selected; no AC chosen | Attempt to submit without AC; field-level validation error. |
| ***Missing steps — validation error*** | No steps added | Attempt to submit without at least one step; field-level validation error. |

## Boundary Scenarios (Limits + Edge Cases)

| Outline Name | Precondition | Notes |
|---|---|---|
| ***Exactly 10 tags (boundary)*** | Tag input available | Add 10 tags and verify max cap is enforced. |
| ***Exactly 0 steps (boundary, invalid)*** | Form ready to submit | Verify at least 1 step is required (already in Negative scenarios). |
| ***Exactly 0 assertions (boundary, valid?)**** | Form with steps but no assertions | ****NEEDS PO/DEV CONFIRMATION***: are assertions required, or optional? |
| ***Max title length (boundary)*** | Title field | Enter title at max length + 1 char; verify validation error if max exists. |
| ***Min title length (boundary, already invalid)*** | Title field | Title too short error already in Negative scenarios. |
| ***Max steps count**** | Step builder | ****NEEDS DEV CONFIRMATION***: is there a max step count? (Assume unlimited or very high.) |
| ***Max assertions count**** | Assertion builder | ****NEEDS DEV CONFIRMATION***: is there a max assertion count? (Assume unlimited or very high.) |

## Integration Scenarios (Dependencies + External Factors)

| Outline Name | Precondition | Notes |
|---|---|---|
| ***API contract readiness (BK-18)*** | BK-18 API finalized | Form cannot initialize without US/AC endpoints. Blockers on this. |
| ***Design tokens loaded*** | Design system available | Form styling (spacing, chip appearance, segmented control) applies correctly. |
| ***Error code → field message mapping*** | mapApiError utility available | All 4 error codes (`ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid`, `title*too*short`) map to user-facing field errors. |
| ***Redirect to detail page*** | `/atcs/{slug}` detail page implemented | POST 201 response contains slug; detail page renders ATC correctly. |

## Accessibility Scenarios (A11y + Keyboard Navigation)

| Outline Name | Precondition | Notes |
|---|---|---|
| ***Tab order across form sections*** | Screen reader + keyboard (Tab key) | US picker → AC picker → steps → assertions → tags → Submit. Logical, no jumps. |
| ***Screen reader announces step reorder*** | Screen reader active | Reorder a step; SR announces "Step moved to position N of M". |
| ***Screen reader announces AC picker update*** | Screen reader active | Change US picker; SR announces "Acceptance Criteria picker cleared and updated". |
| ***Disabled state for up/down buttons*** | Step builder with first/last step | First step: up button disabled. Last step: down button disabled. |
| ***Form validation errors announced*** | Screen reader active | When validation fails, error message is announced (ARIA attributes on error fields). |

---
_Synced from Jira by sync-jira-issues_
