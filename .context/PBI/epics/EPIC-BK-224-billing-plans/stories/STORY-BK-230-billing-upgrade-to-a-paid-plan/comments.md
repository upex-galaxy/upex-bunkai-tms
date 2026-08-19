# Comments for BK-230

[View in Jira](https://jira.upexgalaxy.com/browse/BK-230)

---

### Ely - 7/11/2026, 12:52:50 PM

## PO Ratification — 2026-07-11

- B1 ratified: tier ladder Free / Team / Enterprise is final; Enterprise stays sales-assisted.
- B2 note: Team pricing stays intentionally unpublished; per-seat billing confirmed.
- B3 confirmed: only the workspace owner completes a purchase; admins view the comparison read-only.

---

### Ely - 7/30/2026, 1:30:20 PM

Mockup — Billing — plan comparison + checkout. Source: .context/designs/bunkai-test-management-tool/bk-224-billing/plan-comparison-checkout.html · spec: master-design-plan §4.15



---

### Carlos C - 8/17/2026, 8:13:54 PM

Waiting for PO and Dev input before proceeding.

---

### Carlos C - 8/17/2026, 8:23:44 PM

## PO/Dev Ratification — 2026-08-17

Answers to the 4 Critical Questions + 4 Technical Questions raised by Shift-Left QA (see `Acceptance Test Plan (ATP)` field and comment above). This unblocks `estimation` — the two hard feasibility blockers QA flagged are resolved below.

### Critical Questions (PO)

***Q1 — Payment processor****: ****Stripe Checkout (hosted)****, not Stripe Elements embedded. Rationale: zero PCI scope for the app (card data never touches our servers), well-documented sandbox/test-card conventions for QA, and it reduces "build a checkout" to "integrate a redirect + webhook." ****This changes the flow design***: Confirm moves from an in-app modal action to a redirect to Stripe → webhook-driven plan activation. AC2/AC3 need a rewrite pass by Dev during implementation planning to reflect the redirect + async webhook instead of a synchronous in-app confirm. Recording this as an ADR.

***Q2 — Free-plan project-limit enforcement****: ****Does not exist today — build it as part of BK-230***, do not wait on BK-232. It is a small, necessary precondition (a CHECK/RPC-level gate on project count vs. `workspaces.plan` limit) — without it, AC2's "before/after" claim has nothing to unblock. BK-232 remains a separate Story, scoped to the plan-limit-warning UI only, not the enforcement itself.

***Q3 — Team-tier pricing visibility****: ****Hidden on the comparison screen***, consistent with PO Ratification B2. Team's column shows a qualitative indicator ("From $X/seat — see checkout for your rate" or similar), with the real number revealed at Stripe Checkout. AC1's "price model" wording will be corrected to match this at implementation time.

***Q4 — member/viewer role behavior****: ****Same as admin — can view the comparison, cannot confirm.*** No role below owner can purchase. Full nav-hiding was considered and rejected — it generates "where is Billing?" support tickets for no security benefit, since plan/limit information isn't sensitive.

### Technical Questions (Dev)

***T1 — PCI approach***: resolved by Q1 — Stripe Checkout hosted means no PCI scope on our side at all.

***T2 — Idempotency***: same pattern as Run creation's existing 24h idempotency-key guard. Client generates an idempotency key when opening checkout; it's passed through to Stripe's Payment Intent / Checkout Session.

***T3 — Enterprise contact destination***: `mailto:` to a sales alias for v1. A dedicated form or lead-capture system is premature without real volume — revisit once we have data.

***T4 — Decline-reason copy***: pass through Stripe's own `decline*code` (insufficient*funds, card*declined, expired*card, etc.), mapped to friendly copy per reason — not one generic string. A specific reason produces fewer support tickets than a vague one.

---

Dev: please re-pass Phase 3's refined ACs (in the `acceptance_criteria` field) once implementation planning starts, incorporating the Stripe-redirect flow change from Q1. QA's outline coverage (22 outlines in the ATP DRAFT) stays valid at the behavior level; only the payment-integration outlines' exact mechanics change from "in-app confirm" to "redirect + webhook callback."

---


_Synced from Jira by sync-jira-issues_
