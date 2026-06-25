# TMS-Project Environments | List, add, rename and remove environments

**Jira Key:** [BK-148](https://jira.upexgalaxy.com/browse/BK-148)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For QA
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

---

## Traceability

### Story (1)

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(QA Approved)_

---

## Metadata

- **Created:** 6/20/2026
- **Updated:** 6/23/2026
- **Reporter:** Ely
- **Assignee:** micaelavirgagarcia
- **Labels:** feature-extension, post-mvp

---

_Synced from Jira by sync-jira-issues_
