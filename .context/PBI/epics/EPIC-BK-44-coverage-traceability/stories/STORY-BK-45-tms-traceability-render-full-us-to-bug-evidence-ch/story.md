# TMS-Traceability | Render full US to bug evidence chain in one read

**Jira Key:** [BK-45](https://jira.upexgalaxy.com/browse/BK-45)
**Epic:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44) (Coverage & Traceability)
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 8
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## User story

As a QA Lead, I want to open any user story and see its full evidence chain — acceptance criteria, the ATCs that satisfy them, the tests they belong to, the latest run result, and any defect raised — so that I can answer audit and coverage questions without assembling the picture by hand.

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

### Tests (20)

- [BK-446](https://jira.upexgalaxy.com/browse/BK-446): BK-45: TC13: should show "No acceptance criteria yet" for a story with zero ACs, distinct from AC-03 copy _(Draft)_
- [BK-445](https://jira.upexgalaxy.com/browse/BK-445): BK-45: TC01: should render the full 5-layer chain for a fully covered story _(Draft)_
- [BK-447](https://jira.upexgalaxy.com/browse/BK-447): BK-45: TC14: should redirect an unauthenticated user to login with no chain data rendered first _(Draft)_
- [BK-448](https://jira.upexgalaxy.com/browse/BK-448): BK-45: TC16: should return an identical non-disclosure response given foreign-workspace or nonexistent story _(Draft)_
- [BK-449](https://jira.upexgalaxy.com/browse/BK-449): BK-45: TC17: should exclude an archived AC and its archived ATC from the chain _(Draft)_
- [BK-450](https://jira.upexgalaxy.com/browse/BK-450): BK-45: TC18: should exclude a ghost ATC whose ancestor module was archived, given archived_at is null on the ATC _(Draft)_
- [BK-451](https://jira.upexgalaxy.com/browse/BK-451): BK-45: TC19: should render an archived Story's chain read-only with an archived banner, not a 404 _(Draft)_
- [BK-452](https://jira.upexgalaxy.com/browse/BK-452): BK-45: TC20: should render the chain for a draft-status Story with no additional lifecycle gate _(Draft)_
- [BK-453](https://jira.upexgalaxy.com/browse/BK-453): BK-45: TC23: should render the select a user story prompt when no story query param is present _(Draft)_
- [BK-454](https://jira.upexgalaxy.com/browse/BK-454): BK-45: TC24: should render no filter or export control anywhere on the view _(Draft)_
- [BK-455](https://jira.upexgalaxy.com/browse/BK-455): BK-45: TC25: should repeat an ATC's chain segment under each bound AC given the ATC is bound to 2+ ACs on the same story _(Draft)_
- [BK-456](https://jira.upexgalaxy.com/browse/BK-456): BK-45: TC02: should render the minimum populated chain given 1 AC, 1 ATC, 1 Test and 1 Run _(Draft)_
- [BK-457](https://jira.upexgalaxy.com/browse/BK-457): BK-45: TC04: should render the correct latest-run status pill given each of the 4 terminal run statuses _(Draft)_
- [BK-458](https://jira.upexgalaxy.com/browse/BK-458): BK-45: TC05: should not show a misleading verdict when the latest run is in-flight _(Draft)_
- [BK-459](https://jira.upexgalaxy.com/browse/BK-459): BK-45: TC07: should list and order multiple defects linked to one run by created_at DESC _(Draft)_
- [BK-460](https://jira.upexgalaxy.com/browse/BK-460): BK-45: TC08: should not show a defect belonging to a different story's ATC even when sharing a Test/Run _(Draft)_
- [BK-461](https://jira.upexgalaxy.com/browse/BK-461): BK-45: TC09: should show the correct layer-specific awaiting-data copy given each missing chain layer _(Draft)_
- [BK-462](https://jira.upexgalaxy.com/browse/BK-462): BK-45: TC10: should show the Uncovered 0 ATCs bound strip for an AC with no ATCs _(Draft)_
- [BK-463](https://jira.upexgalaxy.com/browse/BK-463): BK-45: TC11: should render a mixed story correctly given some ACs full chain and some uncovered _(Draft)_
- [BK-464](https://jira.upexgalaxy.com/browse/BK-464): BK-45: TC12: should show No coverage anywhere on this story given a story with ACs but zero ATCs bound _(Draft)_

### Defect (1)

- [BK-317](https://jira.upexgalaxy.com/browse/BK-317): Coverage & Traceability: Latest-run status pill shows "Aborted" — AC-01 (BK-45) specifies pass/fail/blocked/skipped _(Closed)_

### Story (1)

- [BK-50](https://jira.upexgalaxy.com/browse/BK-50): TMS-Traceability | Export the assembled chain as a read-only snapshot _(QA Approved)_

### Epics (3)

- [BK-24](https://jira.upexgalaxy.com/browse/BK-24): Tests (chains of ATCs) _(Planning)_
- [BK-30](https://jira.upexgalaxy.com/browse/BK-30): Manual Execution & Runs _(Planning)_
- [BK-31](https://jira.upexgalaxy.com/browse/BK-31): Bugs & Defect Heatmap _(Planning)_

---

## Metadata

- **Created:** 6/1/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Benjamin Segovia
- **Labels:** shift-left-2026-06-11, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
