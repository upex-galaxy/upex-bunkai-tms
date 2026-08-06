# TMS-Projects | Browse workspace projects in an index with a dedicated create route

**Jira Key:** [BK-266](https://jira.upexgalaxy.com/browse/BK-266)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Dev
**Priority:** High
**Story Points:** -

---

## Overview

## User story

As a QA Lead (Mateo), I want the active Workspace's Projects listed as the first thing I see after signing in, so that I can go straight to the Project I need instead of being asked to create a new one.

## Context

Signing in currently lands a member on `/projects`, and that route is not an index. It renders the create-project form centred on the screen, and the Projects that already exist are demoted to a narrow side card that only appears once the Workspace has at least one Project. The de-facto landing screen therefore asks for something new before showing what is already there — an onboarding step replayed on every visit.

For a QA Lead who lives in three or four Projects at once, that is the wrong first question. The first screen should answer "what exists and where do I go", and creating a Project should be a deliberate act with its own address, not the default state of the landing screen.

> ***INFO:*** This story changes what `/projects` renders and adds `/projects/new`. It does not touch where `/` sends a signed-in member (BK-255 owns that) and it does not build the Home dashboard (epic BK-254 owns that).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)

---

## Metadata

- **Created:** 8/4/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
