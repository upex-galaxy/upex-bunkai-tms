# ADR-0021 — Effective plan: `workspaces.plan` is the stored plan, the limits that apply come from `bunkai_effective_plan`

- **Status:** Proposed <!-- Implemented by BK-231 (migration 0113). Not marked Accepted: the decision was taken by the AI Tech Lead under Bunkai rule AI-LED-DECISIONS and no human has ratified it yet. -->
- **Date:** 2026-11-02
- **Deciders:** AI Tech Lead / AI Product Owner (BK-231, Jira comments 13337 and 13338, per Critical Rule #18 and `decision_authority.product: decide`)
- **Tags:** billing, plans, limits, cross-cutting-invariant, database
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Until BK-231, `workspaces.plan` (`community` | `cloud` | `enterprise`) was both the label of what a workspace bought and the input to every limit: the project-limit trigger (BK-230, migration 0077) and the billing overview read it directly, and the UI ladder in `lib/billing/plan-tiers.ts` is keyed by it.

BK-231 adds a failed-renewal grace period. The 2026-11-01 PO/Dev ruling says a Cloud workspace keeps its paid limits for 14 x 24 hours after the first failed renewal, and drops to Free limits at the exact expiry instant, with all data retained. Two things follow:

1. Something has to make the limits change at that instant. A cron sweep that rewrites `workspaces.plan` can only be as precise as its schedule (the repo's Vercel crons are daily), and it destroys the record of what the workspace actually bought.
2. Every consumer that reads `workspaces.plan` for a limit would silently keep the paid limits unless it also learns about the grace window.

## Decision

We will keep `workspaces.plan` as the **stored plan** and compute the **effective plan** at read time with one pure SQL function:

```sql
bunkai_effective_plan(p_plan text, p_grace_ends_at timestamptz, p_now timestamptz default now()) returns text
-- 'cloud' with p_grace_ends_at is not null and p_now >= p_grace_ends_at  ->  'community'
-- anything else                                                         ->  p_plan
```

The grace deadline lives in `workspace_grace_periods` (one row per workspace with an unpaid renewal), readable by every active member so SECURITY INVOKER callers can evaluate it without a privileged helper. Only the two service_role-only webhook RPCs write it.

**Invariant:** any code that enforces a plan limit MUST derive the plan through `bunkai_effective_plan` (in SQL) or `deriveSubscriptionState` / the overview's `plan` field (in TypeScript), never from `workspaces.plan` alone. `workspaces.plan` is only for "what did this workspace buy". BK-231 applies it to the project-limit trigger and `bunkai_workspace_billing_overview` (whose `plan` is now the effective plan, with `stored_plan` beside it).

## Consequences

- **Positive:** the switch happens at the exact instant with no job to schedule, run or monitor; it is deterministic and testable at the boundary (`p_now` is a parameter); recovery restores the paid limits instantly because nothing was rewritten; no data and no purchase record is ever lost.
- **Negative / trade-offs:** `workspaces.plan` can no longer be trusted as "the limits that apply". Every future limit (seats, retention, anything BK-232 or BK-233 enforces) must remember to go through the function. The "over-limit resources become read-only" half of the ruling is NOT enforced by this ADR: it needs a write lock on every project-scoped table and is a follow-up story. Until then an over-limit workspace cannot create new projects but can still edit existing ones.
- **Neutral / follow-ups:** a workspace past its grace end reads as Community in the billing overview while `workspaces.plan` stays `cloud`; the owner can still replace the payment method and retry, and checkout refuses a second subscription while a renewal is unpaid. A workspace timezone does not exist, so the window is UTC.

- **Stripe settings this design depends on (not provable without a Stripe account, so stated here instead of assumed):** the account's dunning settings must leave a failed-renewal subscription **past due** and keep retrying for at least the 14-day grace window (do not cancel the subscription or mark the invoice uncollectible earlier), because the state machine assumes the subscription and the failed invoice outlive the window. The webhook handles only `invoice.payment_failed`, `invoice.paid` and the setup session; `customer.subscription.*`, `invoice.voided` and `invoice.marked_uncollectible` are deliberately not handled here (subscription lifecycle belongs to BK-233). If dunning cancels the subscription anyway, the retry refuses a void or uncollectible invoice (`retry_not_available`, reason `invoice_not_payable`) instead of charging it, and a cancelled subscription never takes a new default method. Tracking more than one failed invoice at a time is also out of scope: the first failed renewal governs the window.

## Alternatives considered

- **Daily cron that flips `workspaces.plan` to `community`** — rejected: cannot honour "Free at the exact instant", loses what was bought, and needs a recovery path that remembers the old plan.
- **Flip `workspaces.plan` from the webhook only** — rejected: no Stripe event fires at the grace deadline, so nothing would run at the instant.
- **A `SECURITY DEFINER` helper `bunkai_effective_plan(workspace_id)` that reads the grace row itself** — rejected: a DEFINER function taking a caller-supplied workspace id is the spoofable shape ADR-0012 forbids; keeping the function pure and the grace table member-readable removes the class.
- **A `plan_tiers` / `subscriptions` table owning the limits** — rejected for now (same reasoning as D34): no second consumer yet; revisit when BK-232 or BK-233 need DB-side limits beyond projects.

## References

- BK-231 (Jira comments 13337 and 13338; PO/Dev readiness decisions of 2026-11-01), migration `supabase/migrations/0113_billing_details_invoices.sql`
- ADR-0014 (Stripe Checkout and the webhook), ADR-0012 (RPC authorization invariant), master design plan D34 / D36 / D51
- `lib/billing/billing-state.ts` (`deriveSubscriptionState`, mirrors the SQL function)
