# TMS-Test Tags | Assign reserved and custom tags to a test

**Jira Key:** [BK-33](https://jira.upexgalaxy.com/browse/BK-33)
**Epic:** [BK-24](https://jira.upexgalaxy.com/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** -

---

## Overview

# TMS-Test Tags | Assign reserved and custom tags to a Test

## User Story

As a QA Engineer, I want to assign and replace the set of tags on a Test, using both reserved suite tags and custom tags, so that Tests can be grouped into smoke, sanity, regression, and team-defined suites without maintaining separate lists manually.

## Dependency

BK-70 must define the Test Repository entity before BK-33 can be implemented. BK-33 should only implement tag assignment/replacement and tag-based filtering on the Test entity defined by BK-70.

## Business Value

- Enables QA to curate execution suites directly from the Test Repository.
- Reduces manual maintenance of separate smoke, sanity, and regression lists.
- Creates the foundation for later Test Execution selection and reporting stories.
- Keeps tagging lightweight for MVP by avoiding a separate tag registry.

## Scope

### In Scope

- Assign reserved tags to a Test: `smoke`, `sanity`, `regression`.
- Assign custom tags alongside reserved tags.
- Replace the full tag set on a Test.
- Remove all tags from a Test.
- Normalize reserved tags to lowercase.
- Trim custom tag input and prevent duplicates after normalization.
- Reject invalid tags with a clear validation error.
- Filter Tests by one tag.
- Protect concurrent tag updates with optimistic locking.

### Out of Scope

- Test CRUD and base Test schema: BK-70.
- Test run execution and suite execution: BK-34 to BK-39.
- Tag analytics and usage reports: future story.
- Global tag registry, tag colors, tag descriptions, or tag ownership: future story.
- Tag-level permissions separate from Test edit permissions: future RBAC story.
- Multi-tag boolean search such as AND/OR filters: future search enhancement.

## Business Rules

- Reserved tags for MVP are `smoke`, `sanity`, and `regression`.
- Reserved tag input is case-insensitive and stored lowercase.
- Custom tags are trimmed free text with a maximum length of 50 characters.
- Tags cannot contain commas because comma-separated imports and exports would become ambiguous.
- A Test can have at most 20 tags total, combining reserved and custom tags.
- Duplicate tags are removed after trim and normalization.
- Empty tag sets are valid; the Test becomes untagged.
- Tags are stored as values on the Test, not as first-class tag entities.
- Tag updates replace the full tag set; they do not merge partial updates.
- A tag update requires the same edit permission as updating the Test.
- If two users update the same Test tags concurrently, stale updates are rejected with a conflict response.

## Refined Acceptance Criteria

See the latest comment titled "BK-33 Canonical Acceptance Criteria — Fallback" for the final Gherkin scenarios. This fallback is temporary until the Jira REST token can update the Acceptance Criteria custom field directly.

## QA Refinement Notes

Shift-left review refreshed on 2026-06-06. See the latest comment titled "BK-33 Acceptance Test Plan — Fallback" for the scenario matrix, risk analysis, edge cases, and expert recommendations. This fallback is temporary until the Jira REST token can update the ATP custom field directly.

### Expert Review Summary

- Product recommendation: keep the reserved tag set limited to `smoke`, `sanity`, and `regression` for MVP.
- Design recommendation: expose tag editing as a compact multi-select plus custom entry pattern, with validation visible before save.
- Engineering recommendation: store tags as a text array on Test and use optimistic locking for replacement updates.
- QA recommendation: test replacement semantics, duplicate handling, invalid formats, empty set behavior, filtering, and conflict handling.

### Readiness Status

Ready for Estimation after PO confirms the MVP reserved tag vocabulary and accepts deferred tag registry/analytics scope.

## References

- BK-70: Test Repository entity definition.
- BK-33: Acceptance Test Plan field for full shift-left refinement.

---

## Traceability

### Story (1)

- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Release)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/24/2026
- **Reporter:** Ely
- **Assignee:** jesusgpythondev
- **Labels:** bk-70-child, shift-left-2026-06-06, shift-left-reviewed, test-tags, tms

---

_Synced from Jira by sync-jira-issues_
