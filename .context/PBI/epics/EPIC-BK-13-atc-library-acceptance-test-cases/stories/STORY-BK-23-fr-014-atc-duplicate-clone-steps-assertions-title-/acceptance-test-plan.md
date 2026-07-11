# BK-23 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-23)

## Acceptance Test Plan — BK-23: TMS-ATC Duplicate

***Story******:*** As a Senior QA Engineer, I want to duplicate an ATC with all its steps and assertions in one click, so that I can start a variant from a known-good template instead of retyping it.

***Epic******:*** BK-13 — ATC Library (Atomic Test Components)
***Spec******:*** FR-014
***Env******:*** Staging (`https://staging-upexbunkai.vercel.app`)
***Modality******:*** Jira-native
***Shift-Left reviewed******:*** 2026-06-02

---

## Risk Summary

| Risk | Level | Mitigation |
| --- | --- | --- |
| BK-18 dependency (insert path) not landed | MEDIUM | Verify ATC create exists before duplicate |
| Copy independence — DB rows not isolated | HIGH | DB cross-validation (atc*steps, atc*assertions) |
| Title boundary validation (3-200) | MEDIUM | BVA explicit boundaries |
| Cross-workspace access leak | HIGH | 404 on foreign workspace ATC |

---

## Test Coverage

### AC1 — Duplicate copies all steps and assertions

***BK-23******:****** TC01******:****** Validate ATC duplicate copies all steps and assertions (happy path)***

- Precondition: ATC "Login happy path" exists with 3 steps and 2 assertions in staging workspace
- Steps: Click "Duplicate" on the ATC → confirm action
- Expected: New ATC created with identical 3 steps (same position, content, input*data, expected) and 2 assertions (same position, content); `atc*id` is new; `POST /atcs/{id}/duplicate` returns 201

***BK-23******:****** TC02******:****** Validate ATC duplicate copies steps when no assertions exist***

- Precondition: ATC exists with steps but 0 assertions
- Steps: Duplicate the ATC
- Expected: Copy has same steps, 0 assertions — no assertion rows inserted

***BK-23******:****** TC03******:****** Validate ATC duplicate copies assertions when no steps exist***

- Precondition: ATC exists with assertions but 0 steps
- Steps: Duplicate the ATC
- Expected: Copy has 0 steps, same assertions

---

### AC2 — Default title = source title + "(copy)"

***BK-23******:****** TC04******:****** Validate ATC duplicate default title appends (copy) suffix***

- Precondition: ATC titled "Login happy path" exists; user does not provide a custom title
- Steps: Duplicate without entering a title
- Expected: New ATC titled "Login happy path (copy)"

***BK-23******:****** TC05******:****** Validate ATC duplicate default title when source title is at boundary (194 chars)***

- Precondition: ATC with title of 194 characters (200 - 6 for " (copy)")
- Steps: Duplicate without custom title
- Expected: Title = source (194 chars) + " (copy)" = 200 chars — valid, accepted

***BK-23******:****** TC06******:****** Validate ATC duplicate default title behavior when source title is 195+ chars***

- Precondition: ATC with title of 195 characters
- Steps: Duplicate without custom title — auto title would be 201 chars
- Expected: System truncates or returns 422 with clear message (clarify expected behavior — flag as open question if no spec)

---

### AC3 — Custom title override

***BK-23******:****** TC07******:****** Validate ATC duplicate accepts valid custom title (EP — nominal)***

- Precondition: ATC exists; user enters title "Login with remember-me" (22 chars)
- Steps: Duplicate with custom title provided
- Expected: New ATC titled "Login with remember-me"; 201 returned

***BK-23******:****** TC08******:****** Validate ATC duplicate accepts title at minimum boundary (3 chars) — BVA***

- Precondition: ATC exists
- Steps: Duplicate with title "Log" (3 chars)
- Expected: 201 — title accepted

***BK-23******:****** TC09******:****** Validate ATC duplicate accepts title at maximum boundary (200 chars) — BVA***

- Precondition: ATC exists
- Steps: Duplicate with title of exactly 200 characters
- Expected: 201 — title accepted

***BK-23******:****** TC10******:****** Validate ATC duplicate rejects title below minimum (2 chars) — BVA***

- Precondition: ATC exists
- Steps: Duplicate with title "Lo" (2 chars)
- Expected: 422 validation error; no new ATC created

***BK-23******:****** TC11******:****** Validate ATC duplicate rejects title above maximum (201 chars) — BVA***

- Precondition: ATC exists
- Steps: Duplicate with title of 201 characters
- Expected: 422 validation error; no new ATC created

---

### AC4 — Copy independence (DB isolation)

***BK-23******:****** TC12******:****** Validate editing a step in the copy does not change the original***

- Precondition: ATC "Source" duplicated to "Source (copy)"; both have 3 steps
- Steps: Edit step 1 content in the copy → save
- Expected: Step 1 in original "Source" is unchanged; DB shows distinct `atc*id` rows in `atc*steps`

***BK-23******:****** TC13******:****** Validate editing an assertion in the copy does not change the original***

- Precondition: ATC "Source" duplicated; both have 2 assertions
- Steps: Edit assertion 1 in the copy → save
- Expected: Assertion 1 in original is unchanged; distinct rows in `atc_assertions`

***BK-23******:****** TC14******:****** Validate deleting the copy does not affect the original***

- Precondition: ATC "Source" duplicated to "Source (copy)"
- Steps: Delete the copy
- Expected: Original ATC "Source" with all its steps + assertions remains intact

---

### Error cases (Error-Guessing)

***BK-23******:****** TC15******:****** Validate duplicate returns 404 for non-existent source ATC***

- Precondition: Authenticated user
- Steps: `POST /atcs/non-existent-id/duplicate`
- Expected: 404 response; no ATC created

***BK-23******:****** TC16******:****** Validate duplicate returns 404 for ATC from another workspace***

- Precondition: User in Workspace A; ATC belongs to Workspace B
- Steps: `POST /atcs/{workspace*b*atc_id}/duplicate`
- Expected: 404 (cross-workspace isolation — not 403 to avoid leaking existence)

***BK-23******:****** TC17******:****** Validate duplicate returns 403 for user without permission***

- Precondition: ATC exists; user has read-only role (viewer/guest)
- Steps: Attempt to duplicate the ATC
- Expected: 403 response; no ATC created

***BK-23******:****** TC18******:****** Validate duplicate redirects to new ATC detail page after success***

- Precondition: ATC exists; user has write permission
- Steps: Duplicate via UI → confirm
- Expected: Browser redirects to `/atcs/{new*atc*id}` detail page; new ATC shown

---

## Open Questions

1. ***TC06 — Long default title behavior***: What happens when source title is 195+ chars and auto-title would exceed 200? No spec covers this. Needs product decision.
2. ***TC02/TC03 — Edge ATCs with 0 steps or 0 assertions***: Is an ATC with 0 steps valid per BK-18 business rules? If not, TC02/TC03 may be untestable.

---

## TC Summary (18 total)

| TC | AC | Technique | Priority |
| --- | --- | --- | --- |
| TC01 | AC1 | EP-happy | HIGH |
| TC02 | AC1 | EP-alt | MEDIUM |
| TC03 | AC1 | EP-alt | MEDIUM |
| TC04 | AC2 | EP-happy | HIGH |
| TC05 | AC2 | BVA-boundary | MEDIUM |
| TC06 | AC2 | BVA-boundary | MEDIUM |
| TC07 | AC3 | EP-happy | HIGH |
| TC08 | AC3 | BVA-min | HIGH |
| TC09 | AC3 | BVA-max | HIGH |
| TC10 | AC3 | BVA-below-min | HIGH |
| TC11 | AC3 | BVA-above-max | HIGH |
| TC12 | AC4 | Error-Guessing | HIGH |
| TC13 | AC4 | Error-Guessing | HIGH |
| TC14 | AC4 | Error-Guessing | MEDIUM |
| TC15 | Error | Error-Guessing | HIGH |
| TC16 | Error | Error-Guessing | HIGH |
| TC17 | Error | Error-Guessing | HIGH |
| TC18 | UX | EP | MEDIUM |

---
_Synced from Jira by sync-jira-issues_
