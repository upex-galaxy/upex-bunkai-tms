# EPIC: Notifications Center

**Jira Key:** [BK-208](https://jira.upexgalaxy.com/browse/BK-208)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 29

---

## Description

Bunkai already records everything that matters — runs finish, bugs land on people, statuses move — but today the only way to learn any of it is to go looking. This epic makes workspace events reach the right person without polling: Elena learns her run finished without keeping the run tab open, Sara learns a bug was assigned to her while she is still in her editor flow, and Mateo gets a daily digest instead of touring dashboards every morning.

***Scope boundary.**** This epic delivers an ****in-app notification inbox**** (bell + panel), ****event subscriptions for the run and bug lifecycles****, ****per-event-type notification preferences****, and an ****email digest of unread items***. It does NOT deliver chat or direct messages (that is the future Team Chat epic — its mentions will land in this same inbox) and it does NOT deliver external integrations such as Slack or webhook delivery (future integrations work).

## User Stories

| ***#**** | ****Story**** | ****Persona*** |
| --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209](https://jira.upexgalaxy.com/browse/BK-209#icft=BK-209) | Notifications  | View an inbox of workspace events | Elena Vargas, Senior QA Engineer |
| [https://jira.upexgalaxy.com/browse/BK-211#icft=BK-211](https://jira.upexgalaxy.com/browse/BK-211#icft=BK-211) | Notifications  | Get notified when a run finishes or is aborted | Elena Vargas, Senior QA Engineer |
| [https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212](https://jira.upexgalaxy.com/browse/BK-212#icft=BK-212) | Notifications  | Get notified on bug assignment and status changes | Sara Iglesias, Full-Stack Developer |
| [https://jira.upexgalaxy.com/browse/BK-213#icft=BK-213](https://jira.upexgalaxy.com/browse/BK-213#icft=BK-213) | Notifications  | Configure notification preferences per event type | Elena Vargas, Senior QA Engineer |
| [https://jira.upexgalaxy.com/browse/BK-214#icft=BK-214](https://jira.upexgalaxy.com/browse/BK-214#icft=BK-214) | Notifications  | Receive an email digest of unread notifications | Mateo Silva, QA Lead |

## Traceability

- Consumes lifecycle events from epic ***BK-30 Manual Execution & Runs**** (final verdicts and aborts) and from epic ****BK-31 Bugs & Defect Heatmap*** (assignment and status changes).
- Notification preferences live as a sub-view of the ***Settings hub delivered by BK-87*** (epic [https://jira.upexgalaxy.com/browse/BK-85#icft=BK-85](https://jira.upexgalaxy.com/browse/BK-85#icft=BK-85) Account & Settings).
- Future ***Team Chat*** mentions are a declared event type from day one (visible but locked in preferences), so chat work later plugs into this inbox instead of building a second delivery surface.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-209](https://jira.upexgalaxy.com/browse/BK-209) | Notifications | View an inbox of workspace events | 13 | Medium | Ready For QA |
| [BK-211](https://jira.upexgalaxy.com/browse/BK-211) | Notifications | Get notified when a run finishes or is aborted | 5 | Medium | Ready For QA |
| [BK-212](https://jira.upexgalaxy.com/browse/BK-212) | Notifications | Get notified on bug assignment and status changes | 8 | Medium | Ready For QA |
| [BK-213](https://jira.upexgalaxy.com/browse/BK-213) | Notifications | Configure notification preferences per event type | 3 | Medium | Ready For QA |
| [BK-214](https://jira.upexgalaxy.com/browse/BK-214) | Notifications | Receive an email digest of unread notifications | - | Medium | Backlog |

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** new-feature, post-mvp

---

_Synced from Jira by sync-jira-issues_
