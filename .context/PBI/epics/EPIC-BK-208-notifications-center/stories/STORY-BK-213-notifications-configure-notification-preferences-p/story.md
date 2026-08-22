# Notifications | Configure notification preferences per event type

**Jira Key:** [BK-213](https://jira.upexgalaxy.com/browse/BK-213)
**Epic:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208) (Notifications Center)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** 3

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to configure which event types notify me and through which channel, so that the inbox and my email only carry the events I actually care about.

## Context

Once run and bug events flow into the inbox, volume becomes the enemy: a busy workspace can bury the one notification that matters. This story adds a Notifications sub-view to the existing Settings hub where Elena toggles each event type (run lifecycle, bug lifecycle, and mentions as a declared-but-future type) per channel (in-app, email). The email channel feeds the digest story; the mentions row is groundwork for the future Team Chat epic. This story activates once the inbox (sibling story) and the Settings hub are live.

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

### Storys (3)

- [BK-209](https://jira.upexgalaxy.com/browse/BK-209): Notifications | View an inbox of workspace events _(Ready For QA)_
- [BK-87](https://jira.upexgalaxy.com/browse/BK-87): Settings | Open a settings hub and view my account _(Ready For QA)_
- [BK-214](https://jira.upexgalaxy.com/browse/BK-214): Notifications | Receive an email digest of unread notifications _(Ready For Dev)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Carlos Alberto Chiavassa
- **Labels:** new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
