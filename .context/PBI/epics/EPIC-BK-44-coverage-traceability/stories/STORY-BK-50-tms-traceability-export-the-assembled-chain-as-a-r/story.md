# TMS-Traceability | Export the assembled chain as a read-only snapshot

**Jira Key:** [BK-50](https://jira.upexgalaxy.com/browse/BK-50)
**Epic:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44) (Coverage & Traceability)
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## User story

As a QA Lead, I want to export a user story's assembled evidence chain as a shareable, read-only pack so that I can hand auditors and stakeholders a fixed record without giving them system access.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (6)

- [BK-331](https://jira.upexgalaxy.com/browse/BK-331): BK-50: TC01: should download a self-contained document carrying the full chain, the workspace/project/story identity and the export timestamp given a story with an assembled chain _(AUTOMATED)_
- [BK-332](https://jira.upexgalaxy.com/browse/BK-332): BK-50: TC02: should render the downloaded snapshot completely with zero external requests when the file is opened with the network unavailable _(AUTOMATED)_
- [BK-333](https://jira.upexgalaxy.com/browse/BK-333): BK-50: TC03: should preserve the chain exactly as captured when the live chain changes after the export _(AUTOMATED)_
- [BK-334](https://jira.upexgalaxy.com/browse/BK-334): BK-50: TC04: should redirect to login and render no chain data given an unauthenticated browser session _(AUTOMATED)_
- [BK-335](https://jira.upexgalaxy.com/browse/BK-335): BK-50: TC05: should reject the traceability request with 401 given an unauthenticated API caller _(AUTOMATED)_
- [BK-336](https://jira.upexgalaxy.com/browse/BK-336): BK-50: TC06: should expose no hosted artifact, public link or share control anywhere on the traceability screen _(AUTOMATED)_

### Defect (1)

- [BK-329](https://jira.upexgalaxy.com/browse/BK-329): Coverage & Traceability API: traceability route ignores the {projectId} path segment — any well-formed UUID returns the story chain _(Closed)_

### Story (1)

- [BK-45](https://jira.upexgalaxy.com/browse/BK-45): TMS-Traceability | Render full US to bug evidence chain in one read _(QA Approved)_

### Improvement (1)

- [BK-330](https://jira.upexgalaxy.com/browse/BK-330): Traceability export: snapshot filename is minute-granular, so same-minute exports of one story collide _(Closed)_

---

## Metadata

- **Created:** 6/1/2026
- **Updated:** 8/9/2026
- **Reporter:** Ely
- **Assignee:** Benjamin Segovia
- **Labels:** +shift-left-2026-07-09, +shift-left-reviewed, new-feature

---

_Synced from Jira by sync-jira-issues_
