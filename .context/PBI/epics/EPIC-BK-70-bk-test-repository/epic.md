# EPIC: QA Test Repository

**Jira Key:** [BK-70](https://jira.upexgalaxy.com/browse/BK-70)
**Priority:** Medium
**Status:** Backlog
**Total Story Points:** 0

---

## Description

## Scope

This epic is the central repository for individual QA ***Test*** work items (test cases) across the whole product. As of this writing it holds 116 children, all of issue type Test, spanning 11 different feature stories (BK-6, BK-9, BK-28, BK-32, BK-33, BK-34, BK-38, BK-39, BK-40, BK-42, BK-50). Each child's summary is prefixed with its originating story key (for example, "BK-33: TC14: should tag updates refresh search and suite grouping [integration]"), and its status tracks the test's own execution lifecycle — `Candidate` (drafted, not yet run), `Draft`, `AUTOMATED` or `MANUAL` (executed and classified by how), or `DEPRECATED` (the feature it covered was replaced, as with the 12 BK-9 module-creation tests superseded by later work).

***What belongs here***: any Test work item produced from acceptance-test-case refinement for any story in the project, regardless of which feature epic that story lives under.

***What does not belong here***:

- Stories, ATCs, or other feature-definition work items — those stay under their own feature epics.
- Bugs and Defects — those belong to BK-183, the default defect-intake bucket.
- Run or Execution records — those are tracked as their own work type, not as children of this epic.

Membership in this epic says nothing about which product feature a test covers. Use the story-key prefix in each child's summary (or its parent-link/traceability chain) to find the feature it belongs to.

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 8/13/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** qa, regression, test-repository

---

_Synced from Jira by sync-jira-issues_
