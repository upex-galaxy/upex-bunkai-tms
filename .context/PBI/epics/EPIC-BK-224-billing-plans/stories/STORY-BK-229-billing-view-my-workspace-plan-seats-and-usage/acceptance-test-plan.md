# BK-229 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

## ATP DRAFT — Shift-Left Refinement (2026-08-13)

### Coverage Summary

- ***Original ACs******:*** 5
- ***Refined Scenarios******:*** 17
- ***Outlines******:*** 18
- ***Risk Level******:*** MEDIUM

### PO/Dev Decisions

1. Admin CAN view billing
2. Over-limit shows "11 of 10" in limit-reached state
3. Free plan: 3 projects, 5 seats, 30-day retention
4. Seat counting: only `status = 'active'`
5. No auto-refresh
6. Use existing design system tokens

### Outlines

| # | Outline | Type | Coverage |
| --- | --- | --- | --- |
| 1 | should show plan name, price, and renewal date for Team workspace | Positive | AC1 |
| 2 | should show plan name, Custom price, and renewal date for Enterprise workspace | Positive | AC2 |
| 3 | should show warning state when meter is at 80-99% | Boundary | AC3 |
| 4 | should show warning state when meter is at exactly 80% | Boundary | AC15 |
| 5 | should show limit-reached state when meter is at 100% | Boundary | AC4 |
| 6 | should show limit-reached state when meter exceeds 100% | Boundary | AC5 |
| 7 | should show Free plan limits, "No active subscription", and upgrade entry | Positive | AC6 |
| 8 | should show run history retention meter for paid plan | Positive | AC16 |
| 9 | should show run history retention meter for Free plan | Positive | AC17 |
| 10 | should show billing to owner | Positive | AC7 |
| 11 | should show billing to admin | Positive | AC8 |
| 12 | should hide billing from member | Negative | AC9 |
| 13 | should not count pending invitations in seat meter | Boundary | AC10 |
| 14 | should not count suspended members in seat meter | Boundary | AC11 |
| 15 | should show "0 of N seats" when no active members | Boundary | AC12 |
| 16 | should show limit-reached state when exceeding seat limit | Boundary | AC13 |
| 17 | should handle billing API failure gracefully | Negative | AC14 |
| 18 | should handle billing API timeout gracefully | Negative | AC18 |

***Coverage******:****** 7 Positive / 3 Negative / 8 Boundary = 18 outlines***

---
_Synced from Jira by sync-jira-issues_
