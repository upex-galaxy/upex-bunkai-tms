# TMS-Defect Filing | Capture expected and actual results at filing

**Jira Key:** [BK-465](https://jira.upexgalaxy.com/browse/BK-465)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a QA Engineer, I want to record what should have happened (Expected) and what actually happened (Actual) when I file a defect, so that anyone reading the defect later sees the full picture of what went wrong, not just a free-text description.

## Origin

This Story is the follow-up the Product Owner ordered when ruling on [BK-337](https://jira.upexgalaxy.com/browse/BK-337)'s Q1 (2026-08-11): BK-337 cut its Expected vs Actual panel rather than widening into new capture, because BK-337 is a read surface for data that did not yet exist.

> Decision: A. Cut it. B loses because BK-337 is the read surface for data that already exists; making it the vehicle for new capture, a form change and a backfill is how a small Story becomes a quarter. C loses on honesty: a panel headed "Expected vs actual" that renders one box, sourced from a different person's intent and blank on roughly half the corpus, misinforms more than an absent panel does.

Follow-up requested: one new Story to capture Expected and Actual at filing time, covering the columns, the form fields, and what happens to defects filed before it lands.

— Product Owner, BK-337, 2026-08-11

## Not yet decided

The Q1 ruling deliberately left two questions to this Story: whether Expected and Actual end up required or optional fields, and what backfill policy (if any) applies to defects filed before this capability exists. Both are open for shift-left refinement, not answered here.

## Status note

Filed 2026-08-14 as unrefined backlog work. It has not been through shift-left QA refinement — that is a separate step, not something assumed here.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)

---

## Traceability

### Story (1)

- [BK-337](https://jira.upexgalaxy.com/browse/BK-337): TMS-Defect Detail | Open a defect and read its full record _(Ready For QA)_

---

## Metadata

- **Created:** 8/14/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
