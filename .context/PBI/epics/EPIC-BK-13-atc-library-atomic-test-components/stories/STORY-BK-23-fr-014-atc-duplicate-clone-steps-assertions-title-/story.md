# ATC duplicate (clone steps + assertions, title suffix "(copy)")

**Jira Key:** [BK-23](https://upexgalaxy67.atlassian.net/browse/BK-23)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-014

## User Story

As a tester building a variant of an existing ATC, I want to duplicate an ATC with all its steps and assertions in one click, so that I can start from a known-good template instead of re-typing.

## Context

Anchors PRD US 4.6 and implements SRS FR-014. Reuses the same persistence path as FR-010a (BK-18) create but skips form input by deep-copying the source.

---

## Acceptance Criteria

```gherkin
Scenario: Duplicate produces independent copy with "(copy)" title suffix
Given an ATC titled "Login with valid email" with 4 steps and 2 assertions
When the user POSTs to /atcs/{source*id}/duplicate without a new*title
Then the API returns 201 with a new atc_id
And the new ATC is titled "Login with valid email (copy)"
And the new ATC has 4 steps and 2 assertions matching the source's content
And editing the new ATC does NOT modify the source

Scenario: Custom new_title overrides the default suffix
Given an existing ATC titled "Login with valid email"
When the user POSTs /atcs/{source*id}/duplicate with new*title "Login with SSO"
Then the new ATC is titled exactly "Login with SSO"
And no "(copy)" suffix is appended

Scenario: Duplicate emits atc.created event (not atc.duplicated)
Given an authenticated member
When the user duplicates an ATC
Then an atc.created event is emitted with the new atc_id and full payload
And no separate atc.duplicated event is emitted
And downstream consumers do not need special handling

Scenario: Reject duplicate when caller lacks member role
Given an authenticated viewer
When the viewer POSTs /atcs/{source_id}/duplicate
Then the API returns 403 with error code "insufficient_role"

Scenario: new_title length validation matches create endpoint
Given an authenticated member
When the user POSTs /atcs/{source*id}/duplicate with new*title "ab"
Then the API returns 422 with error code "title*too*short"
And no new ATC is created
```

---

## Business Rules

- The new ATC is fully independent — no foreign-key link to the source after creation

- Default title is exactly "{source_title} (copy)" with single space and lowercase "(copy)"

- new_title, when provided, replaces the default entirely (no concatenation)

- new_title is validated by the same rules as create (3..200 chars)

- The duplicate inherits module*id, user*story*id, acceptance*criterion_ids, layer, and tags from the source without re-validation (source already passed those rules)

- Emitted event type is atc.created, not atc.duplicated; payload is the full new ATC

- Slug of the duplicate is freshly computed from the new atc_id; never cloned from source

---

## Scope

- POST /atcs/{source*id}/duplicate endpoint with optional { new*title } body

- Read source ATC + steps + assertions in a snapshot

- Insert new atcs row inheriting module*id, user*story_id, AC ids, layer, tags, and step/assertion content

- Title defaults to "{source*title} (copy)" if new*title omitted

- New slug computed from new atc_id (slugs are NOT cloned — each ATC has its own immutable slug)

- Emit atc.created event for the new ATC (unified event, not a separate atc.duplicated)

- Role check: requires member or above

- Unit tests for default title, custom title, validation, and independence (edit copy does not affect source)

---

## Workflow

A member POSTs /atcs/{source*id}/duplicate optionally with { new*title }. The service loads the source ATC, its steps, and its assertions. Inside a single transaction it inserts a new atcs row with the new title (default suffix or override), copies all step rows with their content and positions, copies all assertion rows with their content and positions, computes the new slug from the new atc_id, and commits. The event bus emits atc.created carrying the full new ATC payload, identical to a normal create.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** atc, clone, mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.688Z_
