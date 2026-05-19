# reports/ — Sprint Reports

Historical home for sprint-level development trackers. One file per sprint, generated and maintained by the `/sprint-development` skill in batch-sprint mode.

Sprint reports are cross-ticket aggregates; they sit here so they don't get buried inside the per-ticket content in `.context/PBI/`.

## Naming convention

`SPRINT-{N}-DEVELOPMENT.md`, where `{N}` is the sprint number.

Examples: `SPRINT-9-DEVELOPMENT.md`, `SPRINT-10-DEVELOPMENT.md`.

## What each file contains

- In-Flight / Queue ticket roadmap for the sprint.
- Per-ticket status: `PENDING` / `IN_PROGRESS` / `IN_REVIEW` / `MERGED` / `STAGING_DEPLOYED` / `PROD_DEPLOYED` / `BLOCKED` / `ABORTED`.
- Impl Plan link, PR number, Delivery Strategy, Forecast Risk per ticket.
- Carryover tickets from the previous sprint.
- Tech Lead assignment and unassigned counts.
- Sprint stats (totals, in-flight, merged, deployed, blocked, LOC delivered, Path A vs Path B split).

## Lifecycle

| Stage | Trigger | Actor |
|-------|---------|-------|
| **Created** | `/sprint-development` Session Start step 0.5, batch mode detected and file missing (or stale > 24h) | `/sprint-development` orchestrator |
| **Updated** | After each Jira transition per ticket (Stage 1 → Stage 4); Stage 5 only when invoked per-ticket | `/sprint-development` orchestrator |
| **Retained** | Never deleted — old sprint reports stay for retro + audit | — |

The framework file is the single source of truth for sprint progress.

## How to consume

- Open the latest file to see in-flight sprint state.
- Diff consecutive files to detect recurring carryovers.
- Feed into retro-prep tools or dashboards.

## Related

- Ticket-level artifacts (impl-plan, context, evidence) → `.context/PBI/`.
- PM-facing sprint snapshot → `/product-management` G workflow (read-only inline render — not persisted; no collision with this file).
