# ADR-0010 — Real-time transport for live run/step updates: Supabase Realtime

- **Status:** Proposed
- **Date:** 2026-07-31
- **Deciders:** Product owner (delegated technical judgment to AI advisor for this decision, explicit, 2026-07-31 — see BK-35 Jira comment)
- **Tags:** real-time, runs, cross-cutting-invariant, infrastructure
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-35 ("Mark step pass/fail/block") AC4 requires: a second user watching the same run sees verdict
and progress move live, without refreshing. This is the product's first real-time requirement — a
full codebase grep (`app/`, `lib/`, `components/`, `supabase/`) confirmed zero existing usage of any
realtime channel, SSE, or WebSocket mechanism anywhere.

Shift-left refinement (2026-06-08) flagged this as Q5, an open blocker: "which real-time transport
mechanism, and what's the latency SLA?" The story sat in Estimation until this was answered. It was
moved to Ready For Dev on 2026-07-28 with no comment recording an answer to Q5 — Worker C (running
`avalanche-2026-07`) caught this via `/sprint-development`'s Phase 0b live-status check, correctly
treated it as a hard-stop (an architectural, hard-to-reverse decision must not be inferred implicitly
mid-implementation), and escalated rather than picking a transport unilaterally.

The product owner explicitly delegated this specific technical judgment call to an AI advisor
(2026-07-31, mid-`avalanche-2026-07` run) rather than resolve it personally, with the explicit
instruction to decide "as if you were me" and stop only for things that genuinely warrant human
participation. This ADR records that delegated decision under the same governance this repo applies
to every other ADR — proposed by AI, requiring human sign-off before `Accepted`.

Stack facts that bear directly on the choice: Next.js 15 (App Router) + Supabase (Postgres 16),
`@supabase/supabase-js` `^2.106.0` (current, full Realtime support), `@supabase/ssr` `^0.10.3`. No
`supabase_realtime` publication is configured yet — this is genuinely new infrastructure, but it is
infrastructure the platform already provides, not a new vendor or service.

## Decision

We will use **Supabase Realtime** (Postgres Changes on the `run_steps` / `runs` tables, scoped per
`run_id`) as the transport for BK-35's live verdict/progress updates, and as the standing real-time
mechanism for this product going forward — any future story needing a live push update (e.g. BK-90's
live membership changes, BK-209's workspace-event inbox) reuses this same mechanism rather than
introducing a second one.

Mechanically: enable Realtime replication on `run_steps` (and `runs` if run-level status also needs
to push) via a migration (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`), scoped by existing
RLS so a subscriber only receives changes for runs/workspaces they can already read; client
subscribes via `supabase.channel(...).on('postgres_changes', { event: 'UPDATE', schema: 'public',
table: 'run_steps', filter: 'run_id=eq.<id>' }, handler)`.

## Consequences

- **Positive:** zero new vendor/service — reuses infrastructure already paid for and operated
  (Supabase). Matches this stack's own "platform-native before custom infrastructure" default.
  Establishes ONE real-time mechanism the whole product reuses, rather than a bespoke one-off for
  BK-35 that later stories reinvent differently. Lower implementation cost than SSE or a custom
  WebSocket layer, both of which would still need something (polling or Postgres notifications)
  feeding them changes — Supabase Realtime already IS that feed.
- **Negative / trade-offs:** first use of this mechanism in the codebase — no existing test/mocking
  pattern for it; Worker C's Stage 2 will need to establish one (unit-testable logic around the
  subscription handler, not the socket itself). Realtime replication adds a small, ongoing
  Postgres/Supabase resource cost (acceptable at current scale). If the client disconnects/reconnects,
  the UI needs a reconciliation fetch on reconnect — this is a real implementation detail Stage 1
  planning must account for explicitly, not assume away.
- **Neutral / follow-ups:** the original SP estimate concern (8 SP provisional, Benjamin flagged
  ~13 SP if this became the first real-time use case) should be revisited by whoever owns estimation
  — Supabase Realtime is the LOWER-effort real-time option available on this stack, so 13 SP may be
  conservative, but re-estimating is a process step outside this ADR's scope, not blocking
  implementation. The 2026-07-28 Estimation -> Ready For Dev transition's intent (mistake vs.
  deliberate) is not re-litigated here — this ADR answers the technical blocker, which is what
  actually stalled progress.

## Alternatives considered

- **Server-Sent Events (SSE) via a custom Next.js route** — rejected: still needs something to
  detect the underlying Postgres change (polling internally, defeating the point, or Supabase
  Realtime under the hood anyway), so it adds a redundant hop with no benefit over subscribing
  directly.
- **Custom WebSocket (Vercel Functions support it via Fluid Compute)** — rejected: same problem as
  SSE — needs its own change-detection mechanism feeding it; reinvents what Supabase Realtime already
  provides, for more code to own and test.
- **Short-interval client polling** — rejected as the primary mechanism: technically satisfies "no
  manual refresh" loosely, but the story's own framing ("real-time," a dedicated Q5 about transport,
  an SP bump for it) signals push-based behavior was the intended shape, and polling adds needless
  server load / latency versus Realtime at comparable-or-lower implementation cost.

## References

- BK-35 Jira ticket, shift-left comment 2026-06-08 (Q5) and 2026-07-13 (Benjamin Segovia's estimate
  note).
- `.session/sprint-development-queue/avalanche-2026-07/escalation-log.md`, entry `2026-07-31 03:20 —
  BK-35 — Worker C — HARD-STOP` — the original escalation this ADR resolves.
- `@supabase/supabase-js` Realtime docs (Postgres Changes) — current version already in
  `package.json`, no upgrade needed.
