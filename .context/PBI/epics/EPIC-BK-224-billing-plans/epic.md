# EPIC: Billing & Plans

**Jira Key:** [BK-224](https://jira.upexgalaxy.com/browse/BK-224)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 0

---

## Description

## Goal

Monetize Bunkai Cloud. Workspace owners understand which plan their workspace is on, what they are consuming, and can pay, upgrade, downgrade, or cancel without opening a support ticket. Mateo Silva (QA Lead, workspace owner) gets invoices his finance team accepts; Elena Vargas (Senior QA Engineer) hits plan limits with a clear, role-aware path forward instead of a dead end.

## Scope boundary

***In scope***

- Plan visibility and usage: current tier, seats, usage meters for plan-limited resources, renewal date
- Self-serve upgrade to a paid plan, downgrade, and cancel (with resubscribe)
- Billing details management and invoice history with downloadable PDFs
- Plan-limit warnings across the whole app with a role-aware upgrade path

***Out of scope***

- Enterprise contracts and purchase-order invoicing (sales-assisted motion, not self-serve)
- Self-hosted Bunkai Community edition licensing — free and open-source, no billing surface
- Tax edge-handling beyond what the standard checkout flow provides

## Stories

| Key | Story | Persona |
| --- | --- | --- |
| BK-229 | Billing | View my workspace plan, seats, and usage | Mateo Silva |
| BK-230 | Billing | Upgrade to a paid plan | Mateo Silva |
| BK-231 | Billing | Manage billing details and download invoices | Mateo Silva |
| BK-232 | Billing | See plan-limit warnings with an upgrade path | Elena Vargas |
| BK-233 | Billing | Downgrade or cancel the subscription | Mateo Silva |

## Traceability

- Builds on BK-1 (Tenancy & Identity — workspaces and the owner / admin / member / viewer role ladder) and BK-87 (Settings hub — the Billing section renders as a Settings sub-view).
- Plan-limit warnings surface across the whole app wherever a plan-limited resource is created, not only inside Settings.
- Source: business model, Revenue Streams (open-core tiers: Community self-hosted, Cloud per-seat subscription, Enterprise license) and Key Activities (operating Bunkai Cloud: billing).

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-229](https://jira.upexgalaxy.com/browse/BK-229) | Billing | View my workspace plan, seats, and usage | - | Medium | Backlog |
| [BK-230](https://jira.upexgalaxy.com/browse/BK-230) | Billing | Upgrade to a paid plan | - | Medium | Backlog |
| [BK-231](https://jira.upexgalaxy.com/browse/BK-231) | Billing | Manage billing details and download invoices | - | Medium | Backlog |
| [BK-232](https://jira.upexgalaxy.com/browse/BK-232) | Billing | See plan-limit warnings with an upgrade path | - | Medium | Backlog |
| [BK-233](https://jira.upexgalaxy.com/browse/BK-233) | Billing | Downgrade or cancel the subscription | - | Medium | Backlog |

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 7/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
