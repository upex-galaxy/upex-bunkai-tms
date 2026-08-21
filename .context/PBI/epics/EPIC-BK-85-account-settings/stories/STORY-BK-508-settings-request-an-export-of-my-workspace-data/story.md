# Settings | Request an export of my workspace data

**Jira Key:** [BK-508](https://jira.upexgalaxy.com/browse/BK-508)
**Epic:** [BK-85](https://jira.upexgalaxy.com/browse/BK-85) (Account & Settings)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

********As a**** QA Lead / Quality Engineering Manager who owns a workspace
********I want to******** request a complete export of my workspace's data from Settings and download it once it is ready
****So that******** I can answer a compliance or data-subject request with the actual records instead of assembling them by hand

## Definition of done

- [ ] A Data export section exists in the Settings hub, visible only to a workspace Owner
- [ ] An Owner can request an export of the workspace's data and the request is acknowledged immediately
- [ ] The section reports the state of the current request and, when ready, offers the archive for download
- [ ] The download stops working after a stated window, and the section says so plainly
- [ ] A failed export is reported as failed with a retry, never left looking stuck
- [ ] The archive never contains another workspace's data and never contains a credential

## Context

`.context/SRS/non-functional-specs.md` §9 commits to it: "GDPR: Workspace owners can request data export + deletion via Settings." Nothing of the kind exists today — no route, no section, no ticket. The two exports that do ship are much narrower and neither substitutes for this one: a Project's ATCs to CSV (BK-467) and a client-side evidence-chain snapshot of a single User Story. Both are working artifacts for a QA Engineer; neither is a workspace-scoped subject-data export an Owner can hand to compliance.

This story delivers the ***export half only***. Owner-initiated deletion — the other half of that SRS sentence — is deliberately excluded and its exclusion is recorded in the Out Of Scope field with the reasoning.

## Provenance

Authored 2026-08-18 by the autonomous discovery routine, from `.context/SRS/non-functional-specs.md` §9 (Compliance).

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

- [BK-512](https://jira.upexgalaxy.com/browse/BK-512): TMS-Workspace | Delete a workspace I own _(Backlog)_

---

## Metadata

- **Created:** 8/18/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
