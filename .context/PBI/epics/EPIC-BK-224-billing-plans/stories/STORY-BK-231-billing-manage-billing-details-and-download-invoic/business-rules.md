# BK-231 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-231)

- Only the workspace owner can edit billing details or the payment method; admins can view the Billing section but not modify payment state.
- Issued invoices are immutable; corrected details apply only to invoices issued afterward.
- One active payment method per workspace; replacing it takes effect from the next charge.
- A failed renewal starts a 14-day grace period: the workspace keeps its paid limits during the grace window, the workspace owner sees a persistent warning banner for the whole period, and the workspace drops to the Free plan's limits if the grace period ends unpaid (nothing is deleted; over-limit resources become read-only).
- Every invoice carries: company billing details, billing period, seat count, and amount.

### Design intent

- Billing details and payment method as stacked cards under the plan card in the Billing section.
- Invoice history as a table (period, amount, status, download action) reusing the current design-system table component.
- Failed payment surfaced as a warning banner at the top of the Billing view with the retry action inline.

---
_Synced from Jira by sync-jira-issues_
