# ATC search + autocomplete (FTS + ts_rank + recency decay)

**Jira Key:** [BK-20](https://upexgalaxy67.atlassian.net/browse/BK-20)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-011

## User Story

As a tester composing a Test, I want to search and autocomplete ATCs by title and tags within my workspace, so that I can quickly find reusable components without scrolling deep module trees.

## Context

Anchors PRD US 4.3 and implements SRS FR-011. Powers the ATC picker inside the Test composition UI (EPIC-BK-5).

---

## Acceptance Criteria

```gherkin
Scenario: Autocomplete returns top matches by ts_rank + recency
Given the workspace has 200 ATCs
And the user has touched ATC "Login with valid email" most recently
When the user types "login" in the picker
Then GET /atcs/search?query=login returns 200 with up to 20 items
And the most-recently-updated matching ATC ranks above older matches with equal text relevance
And each item includes atc*id, slug, title, module*path, layer, and status_dot

Scenario: Search is scoped to the active workspace
Given workspace W-1 has ATC titled "Logout"
And workspace W-2 has ATC titled "Logout"
When a member of W-1 calls GET /atcs/search?query=logout
Then the response includes only the W-1 ATC
And the W-2 ATC is not returned

Scenario: module_id filter restricts results to the module subtree
Given module M-10 has children M-11 and M-12
And M-13 is a sibling of M-10 (not a descendant)
When the user calls GET /atcs/search?query=login&module_id=M-10
Then results include ATCs from M-10, M-11, and M-12
And ATCs from M-13 are excluded

Scenario: Reject empty query
Given an authenticated member
When the user calls GET /atcs/search?query=
Then the API returns 422 with error code "query_required"

Scenario: Result count respects limit and is capped at 50
Given the workspace has 100 matching ATCs
When the user calls GET /atcs/search?query=login&limit=200
Then the response contains at most 50 items
And the response includes a header or field indicating the cap was applied
```

---

## Business Rules

- query must be at least 1 character; whitespace-only is treated as empty

- limit defaults to 20, max 50; values above 50 are silently capped (not an error)

- Workspace scoping is mandatory and applied at the service layer (defense in depth even if RLS exists)

- Ranking: relevance score = ts*rank(tsv, q) * exp(-age*days / decay_constant). Decay constant documented in code.

- The tsvector column is maintained by trigger on INSERT/UPDATE of atcs (title or tags change)

- Soft-deleted ATCs are excluded from results

---

## Scope

- GET /atcs/search endpoint with query, module_id, layer, limit query params

- Postgres tsvector column on atcs covering title + tags (generated or trigger-maintained)

- GIN index on the tsvector column

- Ranking expression: ts*rank(tsvector, plainto*tsquery(query)) combined with recency decay on updated_at

- Module-subtree filter using existing module_paths or recursive CTE

- Workspace scoping via existing RLS or service-layer where clause

- Response shape: { items: [{ atc*id, slug, title, module*path, layer, status_dot }] }

- Unit tests on ranking, integration tests on scoping and filters

---

## Workflow

The Test composition UI calls GET /atcs/search?query=...&module*id=... as the user types. The service layer validates the query, computes the workspace*id from the session, builds a SQL query that scores each ATC using ts*rank against the maintained tsvector column, multiplies by a recency decay factor based on updated*at, applies the module-subtree filter when present, orders DESC by combined score, and limits to min(requested, 50). The trigger on atcs keeps the tsvector column synchronized whenever title or tags change.

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
- **Labels:** atc, fts, mvp, search, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.687Z_
