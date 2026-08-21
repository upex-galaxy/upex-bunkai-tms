# TMS-ATC Library | Archive an ATC and restore it from the archive

**Jira Key:** [BK-571](https://jira.upexgalaxy.com/browse/BK-571)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec******:*** `BK-039` — Soft-delete (`.context/SRS/functional-specs.md`, "Cross-cutting Functional Requirements"). This is an SRS functional-requirement id, not a Jira issue key.

## User story

********As a**** Senior QA Engineer
********I want to******** archive an ATC I no longer want offered for reuse, review the archived ones in their own view, and restore any of them when it turns out to still matter
****So that******** the ATC Library stops surfacing retired cases without ever destroying the evidence that ties a past regression back to a requirement

## Definition of done

- [ ] An ATC can be archived from the ATC surfaces that exist today inside its owning Project, with a confirmation that names the ATC and how many Tests currently chain it
- [ ] An archived ATC disappears from its Project's default ATC list, from ATC search, and from the command palette
- [ ] An opt-in archived view lists the archived ATCs of the workspace, showing who archived each one and when
- [ ] An archived ATC can be restored from that view and immediately behaves like any other ATC again
- [ ] Archiving an ATC that Tests chain is ***allowed after an explicit warning***, never silently refused, and never removes the ATC from those Tests' chains
- [ ] Past Runs that executed the ATC keep rendering every step, its content and its recorded result, unchanged by archiving
- [ ] The Traceability chain of a User Story keeps showing an archived ATC as evidence rather than reporting a gap it does not have
- [ ] An archived ATC cannot be edited, duplicated into circulation, or added as a new step to a Test chain until it is restored
- [ ] Archive and restore each write their own workspace Activity Stream entry
- [ ] Archiving is recoverable by design — no action in this story destroys an ATC record

## Context

`BK-039` commits the whole product to recoverable deletion: **"**`DELETE`** endpoints set **`archived*at = now()`**. Listing endpoints filter **`archived*at IS NULL`** by default."** Modules, User Stories and Acceptance Criteria each shipped a working version of that. ***ATC never did.***

The result is a half-built capability that reads as finished. The ATC table already carries the archive column (migration `0014*module*soft*delete.sql`), and the read paths already honour it — ATC search (`0027*atc*search.sql`), the usage report (`0029*atc*usage.sql`), workspace and command-palette search (`0071*workspace*search.sql`), and the edit guards, whose own comment reads **"Archived ATCs remain non-editable"** (`0035*atc*update*propagation.sql`). The API contract goes further and already publishes the operation as real: `.context/SRS/api-contracts.yaml` documents **"Soft-delete an ATC → 204 Archived"**.

***Zero writers exist.*** There is no archive path, no restore path, and no affordance anywhere in the product. Nothing in the system can ever set that column, so every one of those filters is currently dead weight guarding a state the product cannot reach, and the published contract is one the API does not honour.

This story supplies the missing write half. It needs ***no database migration*** — the column, and the read-side filtering, are already in place.

## Why archive, not delete

This is deliberately framed as ***archive → restore****, not as deletion, because the mechanism genuinely is recoverable. QA teams retain retired test cases on purpose: a case that looks dead is often the only artifact tying a past regression to the requirement it broke. The user-facing promise is **deprecation you can undo* — the ATC stops being offered for reuse, and nothing is lost.

## Provenance

Authored 2026-08-21 from `BK-039` (`.context/SRS/functional-specs.md`), the published `delete` operation in `.context/SRS/api-contracts.yaml`, and a read of the shipped migration tree confirming the read-path filters exist while no writer does. The two open questions this story had to settle — the in-use behaviour and the run-evidence carve-out — were decided by the AI Product Owner and AI Tech Lead profiles per Critical Rule #18; both decisions are posted as attributed comments on this issue.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 8/21/2026
- **Updated:** 8/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
