# `.context/ADR/` — Architecture Decision Records

Append-only log of the **important, hard-to-reverse** architectural decisions made on this project. One file per decision. Decisions are never deleted — they are **superseded** by newer ADRs that link back, so the history of _why the system is the way it is_ stays intact.

The point: a future human or AI session can read these instead of re-litigating a settled decision or silently violating an invariant it didn't know existed.

---

## What an ADR is (and is not)

An ADR captures a single decision: the context that forced it, the option chosen, the alternatives rejected, and the consequences the team accepted. It is a **source-of-truth document**, not a cache — nothing regenerates it, and it is committed to git like code.

It is the right artifact when a decision passes **both** gates:

| Gate                  | Question                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **1 — Architectural** | Does it shape system structure, a cross-cutting concern, or a system-wide invariant?                 |
| **2 — Hard to reverse** | Would changing it later mean touching many files, migrating data, or coordinating across the team? |

Examples that earn an ADR: auth/authorization model, data-access pattern, error/response contract, multi-tenancy model, state-management approach, API style (REST vs RPC vs GraphQL), a framework/library choice with real lock-in, deployment topology, a cross-cutting invariant every feature must uphold.

**NOT an ADR** (these have other homes):

- Bug fixes and their root causes → engram `mem_save` + the story's `bug-fix.md`.
- Local refactors, naming tweaks, formatting → just the commit.
- Single-use code or speculative abstraction → no record needed.
- **Story-local technical decisions** (which hook, which component, a one-file trade-off) → they stay in that story's `implementation-plan.md` under `## Technical Decisions`. Promote one to an ADR **only** when it passes both gates above.

---

## Status lifecycle

```
Proposed ──→ Accepted ──→ Superseded   (by ADR-NNNN, which links back)
                   └────→ Deprecated   (no longer applies; nothing replaces it)
```

- **Proposed** — drafted, under discussion, not yet binding.
- **Accepted** — binding. Downstream work must honor it.
- **Superseded** — a newer ADR replaces it. Set `Superseded by: ADR-NNNN`; the new ADR sets `Supersedes: ADR-MMMM`. **Do not edit the old decision body** — leave it as the historical record.
- **Deprecated** — the decision no longer applies and nothing replaces it (e.g. the feature was removed).

**Append-only.** Never delete an ADR file. Never rewrite a decision after it is Accepted — supersede it with a new one. The only in-place edit allowed on an Accepted ADR is flipping its `Status` line and adding the `Superseded by` / `Deprecated` pointer.

---

## How to write one

1. Copy [`ADR-NNNN-template.md`](./ADR-NNNN-template.md) to `ADR-<NNNN>-<slug>.md`.
   - `<NNNN>` = next free 4-digit number, zero-padded (`0001`, `0002`, …). Numbers are never reused.
   - `<slug>` = short kebab-case summary (`unified-api-authentication`, `event-sourced-orders`).
2. Fill every section. If a decision is still open, set `Status: Proposed` and say what's unresolved.
3. Add a row to the **Index** below.
4. If it supersedes an existing ADR, wire both directions (`Supersedes` / `Superseded by`) and flip the old one's `Status`.

Who authors: a human architect directly, **or** an AI workflow that detected an ADR-worthy decision and drafted it for human approval — `/project-foundation` (SRS architecture phase, seeds the first batch) and `/sprint-development` (Stage 1 planning, promotes a story/feature decision that passes both gates). Either way, the human approves before `Status: Accepted`. The detection + authoring procedure for AI workflows lives in `.claude/skills/agentic-dev-core/references/adr-doctrine.md`.

---

## Index

| ADR | Title | Status | Supersedes | Superseded by |
| --- | ----- | ------ | ---------- | ------------- |
| [ADR-0001](./ADR-0001-unified-api-authentication.md) | Unified API Authentication | Accepted | — | — |
| [ADR-0002](./ADR-0002-idempotency-key-scoping.md) | Idempotency-Key Scoping for the Headless Write Surface | Accepted — Implemented | — | — |
| [ADR-0003](./ADR-0003-app-shell-route-driven-workbench-tabs.md) | Persistent Project Shell & Route-Driven Workbench Tabs | Accepted | — | — |
| [ADR-0004](./ADR-0004-run-snapshot-and-environments.md) | Run Snapshot Model & Project Environments Entity | Accepted | — | — |
| [ADR-0005](./ADR-0005-pat-issuance-role-gate.md) | Role-gated PAT issuance; no global `workspace:admin` tokens | Accepted | — | — |
| [ADR-0006](./ADR-0006-consumption-side-scope-enforcement.md) | Consumption-side scope enforcement: TS capability gate + workspace context match | Accepted | — | — |
| [ADR-0007](./ADR-0007-password-auth-and-email-otp.md) | Password-Primary Auth & Mandatory Email-OTP Verification | Accepted — Implemented | — | — |
| [ADR-0008](./ADR-0008-oauth-csrf-state-strategy.md) | OAuth CSRF state strategy and sign-in flow | Accepted — Implemented | — | — |
| [ADR-0009](./ADR-0009-atc-edit-propagation-contract.md) | ATC edit propagation contract: no layer-policy gate, immutable anchors, reference-based cascade | Accepted — Implemented | — | — |
| [ADR-0010](./ADR-0010-realtime-transport-supabase-realtime.md) | Real-time transport for live run/step updates: Supabase Realtime | Accepted — Implemented | — | — |
| [ADR-0011](./ADR-0011-activity-feed-actor-resolution.md) | Activity Feed Actor Resolution: peer-visible `auth.users` lookup, scoped by co-membership | Accepted | — | — |
| [ADR-0012](./ADR-0012-rpc-authorization-invariant.md) | RPC authorization invariant: actor bind and result scoping on every DEFINER function | Proposed | — | — |
| [ADR-0013](./ADR-0013-workspace-deletion-semantics.md) | Workspace deletion: soft-delete with a grace period, sole-owner gate, and no member eviction | Superseded | — | ADR-0015 |
| [ADR-0014](./ADR-0014-stripe-checkout-billing-upgrade.md) | Stripe Checkout (hosted) for the self-serve plan upgrade, provisioned by env vars, activated by a signature-verified webhook | Accepted — Implemented | — | — |
| [ADR-0015](./ADR-0015-workspace-deletion-revised.md) | Workspace deletion, revised: soft-delete with grace, immediate access revocation, no member veto | Accepted — Not yet implemented | ADR-0013 | — |
| [ADR-0017](./ADR-0017-system-cron-principal-class.md) | System/cron principal class for scheduled internal jobs | Proposed | — | — |

> ADR-0016 is taken by other in-flight work not yet present in this branch — confirmed by the Conductor 2026-08-28/30. BK-214 took the next free number, 0017.

> Keep this table in sync whenever an ADR is added or its status changes. It is the fast index every session reads first.

---

## References

- Template: [`ADR-NNNN-template.md`](./ADR-NNNN-template.md)
- AI detection + authoring doctrine: `.claude/skills/agentic-dev-core/references/adr-doctrine.md`
- Where this folder sits in the bigger map: `.context/README.md` and root `CONTEXT.md` §6
- Decisions about _the framework itself_ (why the repo is structured this way) live in `CONTEXT.md` §6, not here. This folder is for decisions about **the product you are building** with the boilerplate.
