# BK-230 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-230)

## Refined Acceptance Criteria — Shift-Left DRAFT (2026-08-17)

### Original AC1 — Owner compares tiers before choosing

***Scenario 1.1*** (Positive, Critical): Given Mateo is the owner of workspace "Acme QA" on the Free plan, when he opens Billing → Upgrade, then the UI shows 3 columns (Free / Team / Enterprise) each with seats/projects/run-history-retention limits, a price indicator, and Free's column visibly marked "Current plan".

***Scenario 1.2*** (Positive, High): Given "Acme QA" is on the Team plan, when the owner opens Billing → Upgrade, then the Team column is marked "Current plan"; Free is not offered as a downgrade path here (downgrade is BK-233, out of scope).

***Scenario 1.3 — NEEDS PO/DEV CONFIRMATION*** (Edge, High): Team tier price-model rendering — exact copy undecided. AC1's literal text ("each tier shows its... price model") reads as contradicting the PO Ratification comment ("Team pricing stays intentionally unpublished").

### Original AC2 — Successful upgrade from Free to Team unlocks limits immediately

***Scenario 2.1*** (Positive, Critical): Given "Acme QA" is on Free; Mateo selects Team, 10 seats, enters a valid payment method, when he confirms, then `workspaces.plan` = Team immediately (no waiting period), UI reflects it without reload.

***Scenario 2.2*** (Positive, High): Given scenario 2.1 completed, then Mateo receives a confirmation receipt (channel — likely email — TBD exact channel).

***Scenario 2.3 — NEEDS PO/DEV CONFIRMATION**** (Positive, Critical): Given a Free-plan workspace at its 3-project limit, successfully upgraded to Team, when Mateo creates a 4th project, then creation succeeds. ****Depends on confirming project-limit enforcement exists at all today*** — see Critical Question #2 in the ATP DRAFT.

***Scenario 2.4 — NEEDS PO/DEV CONFIRMATION*** (Boundary, Medium): Minimum supported seat count for a Team purchase is not specified anywhere in the Story.

***Scenario 2.5 — NEEDS PO/DEV CONFIRMATION*** (Boundary, Low): Behavior on a 0-seat purchase attempt (block confirm, or force a minimum) is not specified.

### Original AC3 — Payment is declined

***Scenario 3.1*** (Negative, Critical): Given Mateo confirms Team with a card that will be declined, then `workspaces.plan` remains Free, no partial subscription record left behind, no charge recorded.

***Scenario 3.2 — NEEDS PO/DEV CONFIRMATION*** (Negative, High): Exact decline-message copy — generic vs reason-specific — not specified.

***Scenario 3.3 — NEEDS PO/DEV CONFIRMATION*** (Edge, Medium): Whether seat quantity (not just plan choice) is preserved through a decline+retry. The Story text only names "plan choice" as preserved.

***Scenario 3.4*** (Negative, High): Given scenario 3.1's declined state, when Mateo enters a different (valid) card and confirms, then upgrade succeeds per scenario 2.1, without returning to the tier-comparison screen.

### Original AC4 — Enterprise is a contact path, not a checkout

***Scenario 4.1*** (Positive, High): Given Mateo viewing the tier comparison, when he selects Enterprise, then a contact CTA is shown, no payment form renders.

***Scenario 4.2*** (Positive, High): No card field ever mounts for the Enterprise path — restates 4.1's negative assertion explicitly.

***Scenario 4.3 — NEEDS PO/DEV CONFIRMATION*** (Edge, Medium): The Enterprise contact action's destination (mailto, dedicated form, existing lead-capture system) is undefined.

### Original AC5 — Only the owner can complete an upgrade

***Scenario 5.1*** (Positive, Critical): The owner can both view tiers and confirm a purchase — already covered structurally by 1.1/2.1, listed here for AC-traceability completeness.

***Scenario 5.2*** (Negative, Critical): Given an admin (not owner) of "Acme QA", when the admin opens the tier comparison and attempts to confirm a purchase, then the confirm action is blocked (client AND server — both layers required).

***Scenario 5.3*** (Negative, High): The admin is told the workspace owner completes upgrades — exact copy not specified.

***Scenario 5.4 — NEEDS PO/DEV CONFIRMATION*** (Edge, Medium): Behavior for member/viewer roles reaching the upgrade path is not specified anywhere in the Story.

### New scenario surfaced from Phase 2 edge cases

***Scenario E1 — NEEDS PO/DEV CONFIRMATION*** (Edge, High): Given Mateo double-clicks Confirm on a valid payment, when two requests reach the backend near-simultaneously, then exactly one charge, one plan change, one receipt should result. Inferred from this schema's own idempotency precedent (Run creation's idempotency-key pattern) — not stated in the Story.

---

---
_Synced from Jira by sync-jira-issues_
