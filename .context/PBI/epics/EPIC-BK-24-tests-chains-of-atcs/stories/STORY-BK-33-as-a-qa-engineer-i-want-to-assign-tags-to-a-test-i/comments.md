# Comments for BK-33

[View in Jira](https://jira.upexgalaxy.com/browse/BK-33)

---

### jesusgpythondev - 6/6/2026, 7:11:31 PM

# Shift-Left Refinement Updated — BK-33

## Summary

BK-33 has been refreshed for Estimation grooming. The previous shift-left content was reformatted and tightened so Jira stores structured rich text instead of literal Wiki Markup, and the story now separates business AC from detailed QA planning.

## Findings

- The story is valid for full shift-left refinement because it affects shared Test Repository data and future suite selection.
- The prior content left PO questions open; this update converts them into explicit recommendations pending PO confirmation.
- The highest-value scope control is keeping tags lightweight for MVP: reserved vocabulary plus custom values, no registry.
- The main quality risks are stale concurrent saves, workspace-scoped filtering, duplicate normalization, and replacement semantics.

## Risks

- Medium risk: stale tag replacement can silently remove another QA user's suite assignment unless optimistic locking is enforced.
- Medium risk: tag filtering can leak or omit Tests if workspace scoping is not applied consistently.
- Medium risk: expanding reserved tags during MVP can create unclear suite semantics before execution reporting exists.

## Recommendations

- Use the Acceptance Criteria field as the canonical Gherkin source.
- Use the Acceptance Test Plan field for scenario matrix, risk analysis, edge cases, and expert recommendations.
- Keep the Jira description business-readable and avoid API/database implementation detail there.
- Confirm reserved tags for MVP: smoke, sanity, regression.
- Defer tag registry, analytics, colors, ownership, and multi-tag boolean filtering to follow-up stories.

## Open Questions

- PO: confirm whether reserved tags remain limited to smoke, sanity, and regression for MVP.
- PO: confirm whether single-tag filtering is enough for BK-33.
- Design: confirm chip-based tag editing with inline validation.
- Dev: confirm BK-70 provides the Test version needed for optimistic locking, or that BK-33 must add it.

---

### jesusgpythondev - 6/6/2026, 7:12:47 PM

# BK-33 Acceptance Test Plan — Fallback

Temporary fallback: the Acceptance Test Plan custom field could not be updated from this session because the REST token in `.env` cannot access BK-33 on the authenticated Jira site. This comment contains the ATP draft until the field is updated.

# Acceptance Test Plan (ATP) — Shift-Left DRAFT: BK-33 Test Tags

## Summary

BK-33 refines Test tagging for the Test Repository. The story should let QA users assign, replace, clear, and filter Tests by reserved and custom tags while preserving data integrity under concurrent edits.

Coverage produced: 14 Gherkin scenarios.

- Happy path: 4
- Negative path: 5
- Boundary and normalization: 3
- Integration: 2

## Source Inputs

- Jira Story: BK-33, TMS-Test Tags | Assign reserved and custom tags to a Test.
- Parent dependency: BK-70, Test Repository entity definition.
- Prior pattern reference: BK-2 shift-left structure.
- Current formatting rule: Jira content must be published as ADF, not raw Markdown or Wiki Markup stored as a literal paragraph.

## Expert Team Review

### Product Owner Review

BK-33 is valuable because it turns Tests into suite-ready assets. The MVP should avoid expanding into tag registry management because that would add naming governance, permissions, analytics, and migration complexity before suite execution has proven usage patterns.

Recommended product decisions for Estimation:

- Keep reserved tags to `smoke`, `sanity`, and `regression` for MVP.
- Treat custom tags as lightweight user-defined values, not managed entities.
- Defer tag colors, descriptions, ownership, analytics, and global tag browsing.
- Accept empty tag sets because not every Test belongs to a suite.
- Confirm that single-tag filtering is enough for MVP; multi-tag AND/OR filtering should be a separate search story.

### Design Review

The tagging UI should reduce user error before save. A compact multi-select with chips for reserved tags and a custom tag entry pattern is enough for MVP.

Recommended UX details:

- Show reserved tags as selectable chips: smoke, sanity, regression.
- Show custom tags as editable/removable chips.
- Validate invalid tags before save when possible.
- Show clear inline messages for length, comma, max count, and conflict errors.
- For conflict, tell the user that the Test changed and offer refresh rather than silently overwriting.
- Empty state should say "No tags assigned" rather than rendering a blank area.

### Engineering Review

BK-70 already proposes Test tags as values on the Test entity. BK-33 should not introduce a new tag table.

Recommended engineering contract:

- Store tags as an array/value collection on Test.
- Replacement semantics: save receives the full desired tag set.
- Normalize reserved tags to lowercase.
- Trim all tag input before validation and persistence.
- Deduplicate after normalization and trim.
- Enforce max 20 tags at the application boundary.
- Enforce custom tag max length of 50 characters.
- Reject commas to keep import/export and visual parsing predictable.
- Use the Test version for optimistic locking on tag replacement.
- Keep tag filtering workspace-scoped.

### QA Lead Review

The highest-risk areas are not basic save behavior; they are replacement semantics, duplicate handling, stale concurrent saves, filtering correctness, and the boundary between reserved tags and custom tags.

QA focus areas:

- Verify removed tags are actually removed from filtering results.
- Verify reserved tag normalization is predictable.
- Verify custom tags are not accidentally lowercased if product wants user-defined casing preserved.
- Verify stale updates do not overwrite a newer tag set.
- Verify invalid updates leave existing tags unchanged.
- Verify tests from other workspaces never appear in tag-filtered results.

## Proposed Contract Decisions

1. Reserved tag vocabulary: MVP uses only `smoke`, `sanity`, and `regression`.

   Rationale: These map directly to common release gates and keep suite semantics obvious. Additional reserved tags such as nightly or critical-smoke should wait until execution reporting shows real demand.

1. Tag model: tags remain values on Test, not entities.

   Rationale: A registry adds ownership, permissions, rename behavior, deletion behavior, and migration rules. BK-33 only needs suite grouping and filtering.

1. Update semantics: tag save replaces the full tag set.

   Rationale: Replacement is easier for users to reason about and avoids ambiguous merge behavior when another user removes a tag at the same time.

1. Empty tags: allowed.

   Rationale: Draft or exploratory Tests may not belong to any suite. Empty tags should simply remove the Test from tag-filtered lists.

1. Duplicate handling: silently deduplicate after trim and normalization.

   Rationale: Duplicate chips are user input noise, not a business error. The final saved set should be clean and predictable.

1. Custom tag casing: preserve valid custom tag casing after trimming.

   Rationale: Teams may use naming conventions such as Mobile-P1 or Checkout. Reserved tags remain lowercase because they carry system-level meaning.

1. Maximum tag count: 20 tags per Test.

   Rationale: More than 20 tags makes filtering noisy and increases UI clutter. The limit is high enough for MVP suite grouping and low enough to avoid abuse.

1. Concurrency: stale saves are rejected instead of last-write-wins.

   Rationale: Last-write-wins can silently remove another QA user's suite assignment. Conflict handling protects Test repository integrity.

## Edge Cases

High severity:

- Stale concurrent update overwrites another user's tags if no version check exists.
- Tag filtering leaks Tests from another workspace if query scope is wrong.
- Invalid tag update partially saves valid tags and leaves the Test in a mixed state.
- Replacing tags behaves like merge and leaves removed tags behind.

Medium severity:

- Reserved tag casing creates duplicate suite buckets such as SMOKE and smoke.
- Whitespace creates accidental duplicates such as smoke and " smoke ".
- Custom tag longer than 50 characters breaks UI layout or list readability.
- More than 20 tags makes suite grouping noisy.
- Empty tag set is incorrectly rejected even though untagged Tests are valid.

Low severity:

- Unicode custom tags may display inconsistently across environments.
- Custom tag casing may surprise users if normalized without notice.
- Filtering by tag after replacement may show stale data if search/index refresh is delayed.

## Risk Score

Complexity: 3 of 5.

Uncertainty: 3 of 5.

Blast radius: 3 of 5.

Overall score: 27 of 125, Medium.

Rationale: The feature is small at the UI level but sits on shared Test Repository data and suite selection behavior. Concurrency and workspace-scoped filtering make it more than a simple form field.

## Traceability

- AC-1 reserved tags: scenarios 1, 10, 13, 14.
- AC-2 custom tags: scenarios 2, 12, 13.
- AC-3 remove all tags: scenario 4.
- AC-4 case-insensitive reserved tags: scenario 10.
- AC-5 invalid formats: scenarios 5, 6, 7.
- AC-6 duplicate prevention: scenario 11.
- AC-7 filter by tag: scenarios 1, 2, 3, 4, 13, 14.
- AC-8 concurrent updates: scenario 8.
- Permissions and workspace isolation: scenarios 9 and 13.

## Test Outlines

Positive:

1. Assign reserved tags to a Test.
2. Assign custom tags alongside reserved tags.
3. Replace the full tag set on a Test.
4. Remove all tags from a Test.

Negative:

1. Reject a custom tag longer than 50 characters.
2. Reject a tag containing a comma.
3. Reject more than 20 tags.
4. Reject stale concurrent tag updates.
5. Reject tag updates for a Test the user cannot edit.

Boundary and normalization:

1. Normalize reserved tag casing.
2. Trim whitespace and deduplicate tags.
3. Preserve valid custom tag casing after trimming.

Integration:

1. Tag filtering returns only matching Tests.
2. Tag updates refresh search and suite grouping.

## Refined Gherkin

See the Acceptance Criteria field for canonical Gherkin. The same scenario set is intentionally not duplicated here to keep Jira readable.

## Open Items For Grooming

- PO confirmation: reserved tag set stays `smoke`, `sanity`, `regression` for MVP.
- PO confirmation: multi-tag filtering is deferred.
- Design confirmation: chip-based editing pattern is acceptable for MVP.
- Dev confirmation: Test version from BK-70 is available for optimistic locking before BK-33 implementation starts.

## Definition of Ready

- BK-70 Test schema includes tags and version fields or BK-33 explicitly adds the missing pieces.
- Reserved tag vocabulary is confirmed by PO.
- Replacement semantics are accepted by Dev and Product.
- UI/error copy is accepted for invalid tag, max count, forbidden, and conflict states.
- Acceptance Criteria field is treated as the canonical AC source for sprint development.

---

### jesusgpythondev - 6/6/2026, 7:12:47 PM

# BK-33 Canonical Acceptance Criteria — Fallback

Temporary fallback: the Acceptance Criteria custom field could not be updated from this session because the REST token in `.env` cannot access BK-33 on the authenticated Jira site. This comment contains the canonical refined Gherkin until the field is updated.

```gherkin
Background:
  Given an authenticated workspace member with permission to edit Tests
    And a Test exists in the workspace Test Repository
    And the Test has a current version value
    And the reserved tag vocabulary is smoke, sanity, and regression

# Happy path

Scenario: Assign reserved tags to a Test
  Given the Test has no tags
  When the user assigns the tags smoke and regression
  Then the Test is saved with tags smoke and regression
    And the Test appears when filtering Tests by smoke
    And the Test appears when filtering Tests by regression

Scenario: Assign custom tags alongside reserved tags
  Given the Test has the tag smoke
  When the user replaces the tag set with smoke, checkout, and mobile
  Then the Test is saved with tags smoke, checkout, and mobile
    And the custom tags are visible in the Test details
    And the Test appears when filtering by checkout

Scenario: Replace the full tag set on a Test
  Given the Test has tags smoke and checkout
  When the user saves the tag set as sanity and billing
  Then the Test is saved with tags sanity and billing
    And the Test no longer appears when filtering by smoke
    And the Test appears when filtering by sanity

Scenario: Remove all tags from a Test
  Given the Test has tags smoke and regression
  When the user saves an empty tag set
  Then the Test has no tags
    And the Test no longer appears in tag-filtered results for smoke or regression

# Negative path

Scenario: Reject a custom tag longer than 50 characters
  Given the user is editing the Test tags
  When the user enters a custom tag longer than 50 characters
  Then the tag update is rejected
    And the user sees a clear validation message explaining the 50-character limit
    And the Test's existing tags are unchanged

Scenario: Reject a tag containing a comma
  Given the user is editing the Test tags
  When the user enters the custom tag smoke,critical
  Then the tag update is rejected
    And the user sees a clear validation message explaining that commas are not allowed
    And the Test's existing tags are unchanged

Scenario: Reject more than 20 tags
  Given the user is editing the Test tags
  When the user tries to save 21 tags
  Then the tag update is rejected
    And the user sees a clear validation message explaining the maximum tag count
    And the Test's existing tags are unchanged

Scenario: Reject stale concurrent tag updates
  Given User A and User B open the same Test with the same version
    And User A saves tags smoke and checkout first
  When User B tries to save tags sanity using the stale version
  Then User B's update is rejected with a conflict message
    And the Test still has User A's saved tags
    And User B is asked to refresh before saving again

Scenario: Reject tag updates for a Test the user cannot edit
  Given the user has read-only access to the Test
  When the user tries to update the Test tags
  Then the update is rejected as forbidden
    And the Test's existing tags are unchanged

# Boundary and normalization

Scenario: Normalize reserved tag casing
  Given the user is editing the Test tags
  When the user enters SMOKE and Sanity
  Then the Test is saved with tags smoke and sanity
    And the user sees the normalized lowercase reserved tags

Scenario: Trim whitespace and deduplicate tags
  Given the user is editing the Test tags
  When the user enters " smoke ", smoke, and " checkout "
  Then the Test is saved with tags smoke and checkout
    And duplicate tags are not shown to the user

Scenario: Preserve valid custom tag casing after trimming
  Given the user is editing the Test tags
  When the user enters the custom tag " Mobile-P1 "
  Then the Test is saved with the custom tag Mobile-P1
    And the leading and trailing whitespace are removed

# Integration

Scenario: Tag filtering returns only matching Tests
  Given three Tests exist in the workspace
    And Test A has tags smoke and checkout
    And Test B has tags sanity
    And Test C has no tags
  When the user filters Tests by smoke
  Then only Test A is returned
    And Tests from other workspaces are not returned

Scenario: Tag updates refresh search and suite grouping
  Given the Test appears in the smoke suite
  When the user replaces the tag set with regression
  Then the Test is removed from the smoke suite
    And the Test appears in the regression suite
    And subsequent Test list queries reflect the new tags
```

---


_Synced from Jira by sync-jira-issues_
