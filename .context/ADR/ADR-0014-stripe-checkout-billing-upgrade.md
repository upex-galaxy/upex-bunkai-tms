# ADR-0014 — Stripe Checkout (hosted) for the self-serve plan upgrade, provisioned by env vars

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** AI Product Owner / AI Tech Lead (BK-230, per Critical Rule #18) — payment-processor choice ratified by the human PO/dev pair on 2026-08-17 (Jira comment); this ADR formalizes the ratification and adds the provisioning-mechanism decision
- **Tags:** billing, payments, api, auth, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-230 (Billing | Upgrade to a paid plan) needs a real payment mechanism — the first one anywhere in
this codebase. `lib/billing/plan-tiers.ts` (BK-229) already has the tier ladder as typed constants;
nothing in the schema or the app touches a payment processor, an API key, or card data.

Two decisions had to be made, independently:

1. **Payment mechanism.** The 2026-08-17 Jira comment on BK-230 (PO/Dev ratification) already answered
   this: Stripe Checkout, hosted, not an embedded card form. Rationale recorded there: zero PCI scope
   for the app (card data never touches our servers), well-documented sandbox/test-card conventions,
   and it reduces "build a checkout" to "integrate a redirect + webhook."
2. **How the integration is provisioned.** Not previously decided. This repo runs on Vercel; the
   `marketplace` skill's standing instruction is "categorize → discover → install → build" via
   `vercel integration add <provider>` BEFORE writing any application code against an external service.
   For `payments`, that skill's own preferred-provider table names Stripe — consistent with decision 1 —
   but the Marketplace flow for Stripe is a *connectable* integration: the CLI cannot drive the claim
   step, a human must finish it at a dashboard/browser (`vercel integration open stripe`). This Story
   was executed by an unattended, headless worker session with no dashboard access and no human present
   to complete that handshake.

## Decision

We will integrate Stripe **directly** via the `stripe` npm SDK, server-side, credentialed by plain
environment variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CLOUD_PRICE_ID`) — the same
pattern this repo already uses for every other external service (Resend: `RESEND_API_KEY` in
`.env.example`, no Marketplace claim anywhere in this codebase). We will **not** run
`vercel integration add stripe` as part of shipping this Story.

The flow itself: a Checkout Session (`mode: 'subscription'`) is created server-side and the owner is
redirected to Stripe's hosted page; Stripe's `checkout.session.completed` webhook — not the redirect
response, not the success-page load — is the only trigger that writes `workspaces.plan`. The webhook
route (`app/api/v1/billing/webhook/route.ts`) is `auth: 'public'` (no Supabase session exists on a
Stripe-originated request) and is authenticated instead by verifying the Stripe signature
(`stripe.webhooks.constructEvent`) over the raw request body before anything else runs. Plan activation
itself goes through a new `SECURITY DEFINER` RPC
(`bunkai_apply_billing_checkout_webhook_event`, migration `0077`) — the one legitimate case in this
codebase for `SECURITY DEFINER` per `rpc-authorization.md` §2 ("reading/writing a boundary the caller's
role legitimately cannot reach"): a webhook request has no `auth.uid()` to ride RLS with at all. That
RPC takes **no caller-supplied actor or tenant parameter** (only Stripe-controlled `event_id` /
`event_type` / `checkout_session_id`), so the actor-bind checklist in `rpc-authorization.md` §3 does not
apply to it; its authorization model is instead "only `service_role` may execute it at all"
(`REVOKE ... FROM authenticated, anon`), verified by a live-DB test
(`lib/billing/checkout-guards-isolation.test.ts`) that an ordinary signed-in session is rejected outright.

Idempotency is required at two independent layers, because they guard against two different failure
modes:

- **HTTP-level** (ADR-0002's existing `Idempotency-Key` contract) — a client's own network retry of
  `POST .../billing/checkout` replays the stored response instead of starting a second checkout.
- **DB-level** (a partial unique index, `billing_checkout_sessions_one_open_per_workspace`) — two
  *different* Idempotency-Keys (two browser tabs) racing for the same workspace can create at most one
  open Stripe session between them; the loser of the insert race gets 409, never a second Stripe
  session. On the receiving side, `stripe_webhook_events` (keyed by Stripe's own event id) makes the
  webhook RPC idempotent against Stripe's own at-least-once redelivery guarantee.

Invariant: any future payment-processor-backed feature in this repo follows the same shape — env-var
credentials (not a Marketplace claim, unless a human explicitly re-opens that question), a hosted
redirect over an embedded card form wherever the processor offers one, webhook-driven state changes
authenticated by signature (never by trusting the redirect), and the RPC that applies a webhook's effect
carries no caller-supplied actor parameter.

## Consequences

- **Positive:** zero PCI scope; the webhook is the single source of truth for "did the payment actually
  succeed" (a compromised or spoofed success-page hit can never flip `workspaces.plan`); the two
  idempotency layers are independently testable and independently reasoned about; provisioning a real
  Stripe account is a config change (setting three env vars), not a code change — Vercel Marketplace
  provisioning remains available later without touching this code, since it still lands as the same env
  var names.
- **Negative / trade-offs:** plan activation has webhook latency (typically sub-second, but genuinely
  asynchronous) — the success page shows a "confirming your upgrade" state rather than an instant flip.
  Deviating from the marketplace skill's standing "Marketplace-first" instruction means this Story does
  not benefit from Marketplace's unified billing/observability for the Stripe spend — acceptable given
  the integration is test-mode-first and the human operator can migrate to Marketplace-managed
  credentials later without a code change.
- **Neutral / follow-ups:** a human must set the three `STRIPE_*` env vars in Vercel (Preview/Production)
  before this processes a real payment — not a merge blocker, the checkout route answers
  `payment_processor_unavailable` (503) cleanly until then. BK-231 (billing details + invoices) will need
  its own read of Stripe's customer/subscription objects — this ADR's env-var-provisioning decision
  applies there too, not just to this Story.

## Alternatives considered

- **Vercel Marketplace `vercel integration add stripe`** — rejected for THIS worker session: the claim
  step needs a human at a dashboard/browser, which an unattended, headless session cannot provide. Not
  rejected permanently — a human operator may still connect Marketplace-managed Stripe later; the code
  built here does not preclude it.
- **Stripe Elements (embedded card form)** — rejected by the 2026-08-17 PO/Dev ratification: keeps full
  PCI scope on our servers for no product benefit over a hosted redirect, and the story's own shift-left
  QA had already flagged "which payment processor, has a decision been made" as a hard estimation
  blocker specifically because of the PCI-scope question.
- **Synchronous plan activation inside the checkout-creation route (no webhook)** — rejected: payment
  confirmation is asynchronous by construction the moment Stripe hosts the page; the checkout route
  returns before the owner has even seen a card field, so it structurally cannot know whether payment
  will succeed.
- **A caller-supplied `workspace_id` parameter on the webhook-apply RPC, trusted directly from the
  webhook payload's metadata** — rejected: `billing_checkout_sessions.stripe_checkout_session_id` (a
  value WE generated when creating the Checkout Session, looked up server-side) is the trust anchor
  instead, so the RPC never has to trust an identifier that merely rode along in Stripe's payload
  metadata, even though Stripe's metadata is itself already signature-protected.

## References

- BK-230 Jira ticket, 2026-08-17 PO/Dev ratification comment (Q1/T1/T2) and the AI Tech Lead decision
  comment published alongside this Story's implementation plan.
- `supabase/migrations/0077_billing_upgrade_checkout.sql`
- `lib/billing/checkout.ts`, `lib/billing/stripe.ts`, `app/api/v1/billing/webhook/route.ts`
- ADR-0002 — Idempotency-Key scoping (the HTTP-level layer this reuses)
- ADR-0012 — RPC authorization invariant
- `.claude/skills/sprint-development/references/rpc-authorization.md` (the actor-bind / DB-integration-test
  checklist this RPC's design is checked against)
- `.claude/skills/agentic-dev-core` / Vercel `marketplace` skill — the Marketplace-first instruction this
  ADR deliberately departs from, and why
