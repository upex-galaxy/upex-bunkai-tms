# Team Chat | Share an ATC, test, or run as a rich link

**Jira Key:** [BK-218](https://jira.upexgalaxy.com/browse/BK-218)
**Epic:** [BK-210](https://jira.upexgalaxy.com/browse/BK-210) (Team Chat)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas, a Senior QA Engineer, I want to share an ATC, a Test, or a Run in chat as a rich link, so that teammates see what I am talking about — title and current state — without me copy-pasting screenshots or IDs.

## Context

Chat about QA work constantly references the work itself: "this ATC is flaky", "look at this Run". A bare URL forces every reader to click through; a rich link answers the question in place. This story makes a pasted or inserted reference to an ATC, Test, or Run render as a rich card showing the entity's title and its status or verdict, linking to the entity. Cards respect the viewer's permissions and degrade gracefully when the entity is gone. It builds on the entity models shipped in the ATC Library (epic [https://jira.upexgalaxy.com/browse/BK-13#icft=BK-13](https://jira.upexgalaxy.com/browse/BK-13#icft=BK-13)), Tests (epic [https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24](https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24)), and Manual Execution & Runs (epic [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30)), and activates once the workspace channel story is live.

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

## Traceability

### Story (1)

- [BK-215](https://jira.upexgalaxy.com/browse/BK-215): Team Chat | Chat with workspace members in a real-time channel _(Estimation)_

### Epics (3)

- [BK-30](https://jira.upexgalaxy.com/browse/BK-30): Manual Execution & Runs _(Planning)_
- [BK-13](https://jira.upexgalaxy.com/browse/BK-13): ATC Library (Acceptance Test Cases) _(Planning)_
- [BK-24](https://jira.upexgalaxy.com/browse/BK-24): Tests (chains of ATCs) _(Planning)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
