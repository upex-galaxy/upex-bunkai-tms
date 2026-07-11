# TMS-Project Environments | List, add, rename and remove environments

**Jira Key:** [BK-148](https://jira.upexgalaxy.com/browse/BK-148)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec******:*** FR-005

## User story

As a Senior QA Engineer, I want to manage the list of environments for a project (list, add, rename, and remove) so that I can keep the run targets accurate and start manual runs against the right environment.

## Definition of done

- A project member can open the project's environment list and see every environment for that project.
- A project member can add, rename, and remove an environment, with the uniqueness and trimming rules enforced.
- Removing an environment that a Run already references is handled safely per the agreed business rule (default: blocked, with a clear message).
- The happy-path, validation, and guard scenarios in the Acceptance Criteria are demonstrably met on staging.
- Acceptance criteria validated; no critical or major defects open.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (10)

- [BK-190](https://jira.upexgalaxy.com/browse/BK-190): BK-148: TC#1: should list only the caller's project environments and return an empty list to non-members _(Candidate)_
- [BK-191](https://jira.upexgalaxy.com/browse/BK-191): BK-148: TC#2: should reject environment writes with 403 when the actor is a non-member or viewer _(Candidate)_
- [BK-192](https://jira.upexgalaxy.com/browse/BK-192): BK-148: TC#3: should create a unique environment and reject duplicates case-insensitively _(Candidate)_
- [BK-193](https://jira.upexgalaxy.com/browse/BK-193): BK-148: TC#4: should enforce environment name boundaries by trimming and rejecting empty or over-50-char names _(Candidate)_
- [BK-194](https://jira.upexgalaxy.com/browse/BK-194): BK-148: TC#5: should rename an environment and reject a rename to an existing name _(Candidate)_
- [BK-195](https://jira.upexgalaxy.com/browse/BK-195): BK-148: TC#6: should delete an unused environment and block deletion while any run of any status references it _(Candidate)_
- [BK-196](https://jira.upexgalaxy.com/browse/BK-196): BK-148: TC#7: should complete the create-rename-delete environment flow through the project explorer UI _(Candidate)_
- [BK-197](https://jira.upexgalaxy.com/browse/BK-197): BK-148: TC#8: should show an inline error when creating an environment with a duplicate name _(Candidate)_
- [BK-198](https://jira.upexgalaxy.com/browse/BK-198): BK-148: TC#9: should keep the create submit button disabled when the environment name is empty _(MANUAL)_
- [BK-199](https://jira.upexgalaxy.com/browse/BK-199): BK-148: TC#10: should render the environments section with its list or empty state _(MANUAL)_

### Story (1)

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_

### Improvement (1)

- [BK-200](https://jira.upexgalaxy.com/browse/BK-200): Cross-workspace environment PATCH/DELETE discloses existence via 403 instead of non-disclosing 404 _(Open)_

---

## Metadata

- **Created:** 6/20/2026
- **Updated:** 7/10/2026
- **Reporter:** Ely
- **Assignee:** micaelavirgagarcia
- **Labels:** feature-extension, post-mvp

---

_Synced from Jira by sync-jira-issues_
