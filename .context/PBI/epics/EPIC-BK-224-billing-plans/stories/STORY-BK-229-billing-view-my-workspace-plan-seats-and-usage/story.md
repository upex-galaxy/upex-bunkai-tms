# Billing | View my workspace plan, seats, and usage

**Jira Key:** [BK-229](https://jira.upexgalaxy.com/browse/BK-229)
**Epic:** [BK-224](https://jira.upexgalaxy.com/browse/BK-224) (Billing & Plans)
**Type:** Story
**Status:** Ready For QA
**Priority:** High
**Story Points:** 8
**Web Link:** https://staging-upexbunkai.vercel.app/settings/account

---

## Overview

## QA Refinements (Shift-Left Analysis)

### Critical Gaps Identified

| # | Gap | Technique | Severity | Decision |
| --- | --- | --- | --- | --- |
| G1 | AC4 tests "member not owner/admin" but business rules say admins CAN view | Decision Table | HIGH | ***Admin CAN view billing.*** AC4 corrected to include admin=shown. |
| G2 | AC2 tests warning at 9/10 but no test for 10/10 (limit-reached) | State-Transition | HIGH | ***Added reached limit (10/10) and exceeded limit (11/10).*** |
| G3 | AC1 shows "8 of 10 seats" but no test for 10/10 or 11/10 (over-limit) | BVA | HIGH | ***Added exceeded seat limit scenario.*** |
| G4 | AC5 says "pending invitations don't consume seat" but no test for suspended members | Boundary | MEDIUM | ***Added suspended members scenario.*** |
| G5 | AC1 expects "per-seat price" but Free plan has no price | State-Transition | MEDIUM | ***Added Enterprise plan scenario with "Custom" price.*** |
| G6 | AC3 says "no renewal date" for Free but doesn't test what IS shown | Edge Case | LOW | ***Added "No active subscription" text.*** |
| G7 | No AC for workspace with 0 active members | Boundary | LOW | ***Added zero active members scenario.*** |
| G8 | No AC for workspace with Enterprise plan | State-Transition | MEDIUM | ***Added Enterprise plan scenario.*** |
| G9 | No AC for loading/error state when billing API fails | Edge Case | MEDIUM | ***Added API failure scenario.*** |
| G10 | No AC for auto-refresh of meters | Edge Case | LOW | ***Decision******:****** Fetch on mount only. No auto-refresh.*** |

### PO/Dev Decisions Applied

1. ***Admin access***: Admins CAN view billing (role IN ('owner', 'admin'))
2. ***Over-limit seats***: Show "11 of 10" in limit-reached state, no block
3. ***Free plan limits***: 3 projects, 5 seats, 30-day retention
4. ***Seat counting***: Only `status = 'active'`. Pending and suspended don't count
5. ***Auto-refresh***: No. Fetch on open only
6. ***Visual tokens***: Existing design system (default <80%, warning 80-99%, destructive 100%+)

### Refined Acceptance Criteria (14 Scenarios)

***AC1******:****** Owner sees plan details and meters (paid workspace)***

- Given Mateo is owner of workspace on Team/Enterprise plan
- When he opens Billing in Settings
- Then he sees plan name, per-seat price, renewal date
- And seat meter shows active members vs limit
- And usage meters show projects and run history retention

***AC2******:****** Usage meter shows correct state***

- Given workspace with used/limit ratio
- When Mateo opens Billing
- Then meter shows normal (<80%), warning (80-99%), or limit-reached (100%+) state

***AC3******:****** Free workspace shows limits and upgrade entry***

- Given workspace on Free plan
- When Mateo opens Billing
- Then he sees plan name "Free" with limits
- And "No active subscription" instead of renewal date
- And option to upgrade to paid plan

***AC4******:****** Access control***

- Owner: billing shown
- Admin: billing shown
- Member: billing NOT shown

***AC5******:****** Seat meter counts active members only***

- Pending invitations do NOT consume seats
- Suspended members do NOT consume seats
- Only `status = 'active'` counts

***AC6******:****** Enterprise plan displays correctly***

- Shows "Custom" price
- Shows "Unlimited" for seat and project limits

***AC7******:****** Error state handling***

- Billing API fails: show error toast + retry button

### ATP DRAFT (14 Outlines)

| # | Outline | Type |
| --- | --- | --- |
| 1 | should show plan name, price, and renewal date for Team workspace | Positive |
| 2 | should show plan name, Custom price, and renewal date for Enterprise workspace | Positive |
| 3 | should show warning state when meter is at 80-99% | Boundary |
| 4 | should show limit-reached state when meter is at 100% | Boundary |
| 5 | should show limit-reached state when meter exceeds 100% | Boundary |
| 6 | should show Free plan limits, "No active subscription", and upgrade entry | Positive |
| 7 | should show billing to owner | Positive |
| 8 | should show billing to admin | Positive |
| 9 | should hide billing from member | Negative |
| 10 | should not count pending invitations in seat meter | Boundary |
| 11 | should not count suspended members in seat meter | Boundary |
| 12 | should show "0 of N seats" when no active members | Boundary |
| 13 | should show limit-reached state when exceeding seat limit | Boundary |
| 14 | should handle billing API failure gracefully | Negative |

***Coverage******:****** 5 Positive / 2 Negative / 7 Boundary = 14 outlines***

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (3)

- [BK-230](https://jira.upexgalaxy.com/browse/BK-230): Billing | Upgrade to a paid plan _(Ready For Dev)_
- [BK-87](https://jira.upexgalaxy.com/browse/BK-87): Settings | Open a settings hub and view my account _(Ready For QA)_
- [BK-232](https://jira.upexgalaxy.com/browse/BK-232): Billing | See plan-limit warnings with an upgrade path _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/16/2026
- **Reporter:** Ely
- **Assignee:** pinto.lucas.nahuel
- **Labels:** shift-left-2026-08-13, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
