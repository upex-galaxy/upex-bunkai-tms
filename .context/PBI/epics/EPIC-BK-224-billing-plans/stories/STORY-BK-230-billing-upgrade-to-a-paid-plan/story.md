# Billing | Upgrade to a paid plan

**Jira Key:** [BK-230](https://jira.upexgalaxy.com/browse/BK-230)
**Epic:** [BK-224](https://jira.upexgalaxy.com/browse/BK-224) (Billing & Plans)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 13

---

## Overview

## User story

As Mateo Silva (QA Lead / Quality Engineering Manager), I want to compare plans, pick one, and pay for it inside the workspace, so that my team unlocks the limits it needs the moment I confirm — without a sales call or a support ticket.

## Context

The self-serve conversion path for Bunkai Cloud. From the Billing section (or from a plan-limit warning), the owner opens a tier comparison, chooses a plan, enters a payment method, and confirms. The workspace unlocks the new limits immediately and a confirmation receipt is issued. Enterprise remains sales-assisted — the comparison shows it, but its call to action is a contact path, not a checkout. Activates when the plan/usage view (Billing section) is live.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-17

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Two browser tabs both mid-checkout, both confirmed | No | Medium | Add to AC (PO confirm) — folds into idempotency Scenario E1's broader guard |
| 2 | Session/auth expires mid-checkout during payment entry | No | Low | Test only |
| 3 | Currency/locale display of tier pricing | No | Low | Test only, revisit once pricing display is resolved |
| 4 | Enterprise contact form pre-fills workspace context | No | Low | Test only, not a stated requirement |

### Clarified Business Rules

- Cross-checked against sibling Story BK-229 (already `Ready For Dev`): the Free-plan numeric limits this Story assumes — 3 projects, 5 seats, 30-day retention — are ratified and consistent across both Stories. No numeric contradiction.
- However, BK-229 is purely a ***display**** Story — none of its outlines block or gate an action. Nothing confirms the Free-plan project limit is actually ****enforced*** (blocking creation) today. See Critical Question #2 below.
- Owner-only purchase authorization IS technically feasible today — `bunkai*is*workspace_owner` exists as a real RLS helper per this repo's own data-map discovery — unlike the payment mechanism itself.

### Critical Questions for PO

1. ***Which payment processor will Bunkai Cloud integrate (Stripe or equivalent), and has that decision been made anywhere outside this Story?*** No payment-processor integration exists today — no SDK dependency, no API endpoint, no env var, confirmed independently across three separate discovery docs. Dev cannot estimate this Story without an answer — likely a hard blocker for `estimation`.
2. ***Does Free-plan project-limit enforcement (blocking creation at the limit) exist today, or is it itself an unbuilt dependency of this Story?*** AC2 implies a currently-blocked 4th project that upgrade unblocks. Sibling BK-229 only displays meter states; the Story that would own the actual gate (BK-232) is still Backlog. AC2's "before/after" framing may be untestable as written.
3. ***Is Team-tier pricing shown as a real number on the comparison screen, or hidden until checkout?*** AC1's text ("each tier shows its... price model") reads as contradicting the PO Ratification comment ("Team pricing stays intentionally unpublished").
4. ***What role does a plain ****`member`**** or ****`viewer`**** get when reaching the Billing → Upgrade path?*** ACs specify owner (full access) and admin (view-only) but say nothing about member/viewer — an entire role tier has undefined behavior at a money-adjacent surface.

### Technical Questions for Dev

1. ***PCI-compliance approach*** — client-side tokenizing SDK (card data never touches app servers), or another approach?
2. ***Idempotency-key strategy for the confirm action*** — this schema already has a precedent (Run creation's 24h idempotency guard). Should the same pattern apply to checkout confirm?
3. ***Enterprise contact-path destination*** — mailto, dedicated form, or existing lead-capture system?
4. ***Exact decline-reason copy*** — one generic app string, or pass-through of the processor's own decline-reason messaging?

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (3)

- [BK-231](https://jira.upexgalaxy.com/browse/BK-231): Billing | Manage billing details and download invoices _(Backlog)_
- [BK-229](https://jira.upexgalaxy.com/browse/BK-229): Billing | View my workspace plan, seats, and usage _(Ready For QA)_
- [BK-233](https://jira.upexgalaxy.com/browse/BK-233): Billing | Downgrade or cancel the subscription _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/19/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-08-17, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
