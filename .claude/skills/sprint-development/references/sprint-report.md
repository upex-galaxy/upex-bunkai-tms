# Sprint Report — Batch-Sprint Mode

Use this reference when iterating multiple tickets across a sprint. Covers: generating the `SPRINT-{N}-DEVELOPMENT.md` framework file, the per-stage update rules, status state machine, stale handling, trigger phrases, single-ticket mode boundaries, and coupling with `/product-management`.

The orchestrator delegates here from `SKILL.md` whenever:

- A batch-mode invocation is detected (`"process sprint N"`, `"continue sprint"`, `"implement sprint N"`, `sprint-file` parameter, or a phrase implying a sprint loop), AND
- `.context/reports/SPRINT-{N}-DEVELOPMENT.md` is missing or stale (>24h), OR
- A per-stage update needs to apply during Stage 1 → Stage 4.

Single-ticket runs do NOT update this report. They may read the latest report at Stage 1 entry for queue / dependency awareness, but they never write.

---

## Part 1 — Sprint Roadmap Generator

Auto-invoked by `SKILL.md` §Sprint roadmap checkpoint in batch-sprint mode whenever the report file is missing or stale (>24h). Not a standalone command — it is a precondition of the batch loop.

### Inputs

| Parameter              | Required | Description                                        | Example                                    |
| ---------------------- | -------- | -------------------------------------------------- | ------------------------------------------ |
| `sprint_number`        | YES      | Sprint to generate                                 | `10`                                       |
| `tech_lead`            | NO       | Defaults to `git config user.name`, ask if missing | `Jane Doe`                                 |
| `previous_sprint_file` | NO       | For carryover detection                            | `.context/reports/SPRINT-9-DEVELOPMENT.md` |

### Output path

`.context/reports/SPRINT-{sprint_number}-DEVELOPMENT.md`.

If the file already exists, warn and ask before overwriting. On regenerate, the Session Log section is **preserved verbatim** (append-only) — never overwrite manual notes.

> **Prerequisite**: Load `/acli` skill before the `[ISSUE_TRACKER_TOOL]` call in Step 1. The Roadmap Generator runs before per-ticket Session Start, so the standard pre-flight has not yet executed — load it explicitly here.

### Steps

1. **Query tickets** via `[ISSUE_TRACKER_TOOL]` for `Sprint {N}` with fields: Ticket ID, Type, Title, Priority, Status, Dev Assignee, Project/Epic. Sort by Priority DESC, Status ASC.
2. **Classify** each ticket's board status by canonical slug (resolve via `.agents/jira-workflows.json`):

   | Canonical Status (Story)                                                                                                    | Dev Category               | Section            |
   | --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------ |
   | `{{jira.status.story.in_progress}}`                                                                                         | Active implementation      | In-Flight          |
   | `{{jira.status.story.in_review}}`                                                                                           | PR open, awaiting review   | In-Flight          |
   | `{{jira.status.story.ready_for_dev}}`                                                                                       | Queue head — pull next     | Queue              |
   | `{{jira.status.story.ready_for_qa}}` / `{{jira.status.story.qa_approved}}` / `{{jira.status.story.deployed_to_production}}` | Done from dev's POV        | Done — This Sprint |
   | `{{jira.status.story.blocked}}`                                                                                             | Blocking issue (monitor)   | Blocked            |
   | `{{jira.status.story.backlog}}` / `estimation` / `shift_left_qa`                                                            | Not pulled into sprint yet | Pipeline           |
   | `{{jira.status.story.aborted}}`                                                                                             | Cancelled (terminal)       | Cancelled          |

   If the project's substrate lacks a slug (e.g. no `blocked` status), drop that row gracefully and continue.

3. **Detect carryovers** if `previous_sprint_file` was provided. Scan it for tickets whose status is NOT `PROD_DEPLOYED` / `ABORTED`. For each, check whether it appears in the current sprint; if yes, mark as carryover with prior context; if no, note as "dropped from sprint" and inform the user.
4. **Build Board Summary** counts (Ready For Dev / In Progress / In Review / Ready For QA / Deployed to Prod / Blocked / Total).
5. **Build In-Flight table** with the 11-column shape below (`#`, Ticket, Type, Title, Priority, Owner, Impl Plan, PR, Delivery Strategy, Forecast Risk, Status). Status column is the canonical state machine value, not the Jira label.
6. **Populate Stats** section from the counts (in-flight, merged, staging-deployed, prod-deployed, blocked, cancelled, carryovers, estimated total LOC from impl-plan forecasts).
7. **Write the file** using the framework structure below.
8. **Append Session Log entry** for the setup pass — date, totals, in-flight IDs, assigned/unassigned counts, carryover IDs, "Created SPRINT-{N}-DEVELOPMENT.md tracker".
9. **Report** a short board summary back to the user: totals, in-flight count, carryovers.

### Framework file structure (full template)

```markdown
# Sprint {N} — In-Sprint Development Tracker

> Purpose: track dev progress per ticket; cross-ticket aggregate for AI session resume.
> Sprint: {N} | Tech Lead: {tech_lead} | Started: {YYYY-MM-DD} | Last Updated: {date}

## Board Summary

| Status           | Count   | Dev Relevant            |
| ---------------- | ------- | ----------------------- |
| Ready For Dev    | {n}     | YES — queue head        |
| In Progress      | {n}     | YES — being implemented |
| In Review        | {n}     | YES — PR open           |
| Ready For QA     | {n}     | NO — handed to QA       |
| Deployed to Prod | {n}     | NO — done               |
| Blocked          | {n}     | YES — needs resolution  |
| Total Sprint {N} | {total} |                         |

## Development Queue (Priority Order)

### In-Flight — Active Work

> Tickets currently in `In Progress` or `In Review`.

| #   | Ticket | Type               | Title   | Priority   | Owner | Impl Plan | PR        | Delivery Strategy                   | Forecast Risk    | Status                                |
| --- | ------ | ------------------ | ------- | ---------- | ----- | --------- | --------- | ----------------------------------- | ---------------- | ------------------------------------- |
| 1   | {ID}   | {Story\|Bug\|Task} | {title} | {priority} | {dev} | {link\|-} | {#NNN\|-} | {stacked\|chain\|single\|exception} | {Low\|Med\|High} | {IN_PROGRESS\|IN_REVIEW\|MERGED\|...} |

#### In-Flight Notes

- {Ticket ID}: {context, blockers, impl-plan highlights}

#### Dependencies

- {Ticket A} blocks {Ticket B} — {reason}

### Queue — Ready For Dev

| Ticket | Type | Title | Priority | Owner | Notes |
| ------ | ---- | ----- | -------- | ----- | ----- |

### Pipeline — Pending Refinement

> Backlog / Estimation / Shift-Left-QA — not yet pulled into the sprint.

### Done — This Sprint

| Ticket | Title | Owner | PR  | Merged | Staging | Prod | TCs (QA hand-off) |
| ------ | ----- | ----- | --- | ------ | ------- | ---- | ----------------- |

### Blocked

| Ticket | Owner | Blocking | Since | Decision Pending |
| ------ | ----- | -------- | ----- | ---------------- |

### Cancelled (Aborted)

| Ticket | Reason | Decided By | Date |
| ------ | ------ | ---------- | ---- |

## Sprint Carryovers from Sprint {N-1}

{include ONLY if previous_sprint_file was provided}

| Ticket | Sprint {N-1} Status | Sprint {N} Status | Notes |

## Sprint {N} Stats

| Metric                              | Value                          |
| ----------------------------------- | ------------------------------ |
| Total Sprint Tickets                | {total}                        |
| In-Flight (In Progress + In Review) | {count}                        |
| Merged this sprint                  | {count}                        |
| Staging-deployed                    | {count}                        |
| Prod-deployed                       | {count}                        |
| Blocked                             | {count}                        |
| Cancelled                           | {count}                        |
| Carryovers from Sprint {N-1}        | {count or 0}                   |
| Estimated total LOC delivered       | {sum from impl-plan forecasts} |

## Session Log

### {YYYY-MM-DD} — Sprint {N} Setup & Triage

- Queried {{ISSUE_TRACKER}}: {total} tickets in Sprint {N}
- {inflight_count} in-flight tickets ({list IDs})
- {assigned_count} assigned to {tech_lead}, {unassigned_count} unassigned
- {carryover_count} carryovers from Sprint {N-1}: {list}
- Created SPRINT-{N}-DEVELOPMENT.md tracker

### {YYYY-MM-DD} — {Ticket} {transition}

- {brief note on transition + decision drivers}
```

### Framework file conventions

1. **Dates**: ISO 8601 (`YYYY-MM-DD`). Last Updated is bumped on every write.
2. **Status column** (In-Flight table): one of `PENDING` / `IN_PROGRESS` / `IN_REVIEW` / `MERGED` / `STAGING_DEPLOYED` / `PROD_DEPLOYED` / `BLOCKED` / `ABORTED`. State machine details below.
3. **Impl Plan / PR / Delivery Strategy / Forecast Risk columns**: initialized as `-`; filled at the matching stage (see Part 2). Never delete the row even when the ticket becomes irrelevant — move it to `Done — This Sprint` or `Cancelled (Aborted)` instead.
4. **Priority order** inside In-Flight: the `#` column drives queue ordering — pick the lowest-numbered non-terminal ticket when the user asks "next".
5. **Session Log**: every state-changing event appends an entry. Entries are NEVER deleted on regenerate (append-only). The Roadmap Generator only adds new entries; it never rewrites historical ones.

---

## Part 2 — Per-stage update rules

The orchestrator updates the report row at every Jira transition in batch mode. Single-ticket mode never updates.

### Stage 1 — Planning entry

Triggered when sprint-dev transitions Jira `Ready For Dev → In Progress`.

- **Status**: `PENDING` → `IN_PROGRESS`.
- **Owner**: fill with the dev driving the ticket (defaults to `git config user.name`).
- **Impl Plan**: link to `.context/PBI/{ticket}/impl-plan.md` (or topic key `pbi/{ticket}/impl-plan`).
- **Forecast Risk**: `Low` / `Medium` / `High`, read from the Workload Forecast block in the impl-plan.
- **Session Log**: append `### {date} — {ticket} IN_PROGRESS` with a one-line note (forecast risk + any salient context).

### Stage 3 — Code Review (PR open)

Triggered when sprint-dev opens the PR via `/git-flow-master` and Jira auto-transitions `In Progress → In Review`.

- **Status**: `IN_PROGRESS` → `IN_REVIEW`.
- **PR**: fill `#NNN`. Construct the link as `<repo-url>/pull/NNN`, where `<repo-url>` is obtained at runtime via `git remote get-url origin` (strip a trailing `.git` if present). Do NOT hardcode the repo URL or read it from `.agents/project.yaml`.
- **Delivery Strategy**: read from the chain decision recorded in the impl-plan forecast block (`stacked-to-main` / `feature-branch-chain` / `single-pr` / `size-exception`). Normalize to `stacked` / `chain` / `single` / `exception` for the column.
- **Session Log**: append `### {date} — {ticket} IN_REVIEW` with PR number + delivery strategy.

### Stage 4 — Merge + Staging Deploy

Two sub-transitions: merge and CI smoke.

- On `gh pr merge --squash` landing: **Status** `IN_REVIEW` → `MERGED`. Session Log entry `### {date} — {ticket} MERGED`.
- On staging CI smoke passing + auto-deploy fired: **Status** `MERGED` → `STAGING_DEPLOYED`. Session Log entry `### {date} — {ticket} STAGING_DEPLOYED`.
- When Jira auto-transitions to `Ready For QA`: **move the row** from In-Flight to `Done — This Sprint` (preserve all column values; fill `Merged` / `Staging` date columns). Session Log entry confirming the hand-off.

If any transition skips (manual merge, CI red, deploy failure), append a Session Log entry explaining what happened and pause the loop — do not auto-advance.

### Stage 5 — Production Deploy

**Stage 5 NEVER runs in batch mode.** Production deploys are always per-ticket manual invocations, gated by QA green + business approval.

- On successful prod deploy: **Status** `STAGING_DEPLOYED` → `PROD_DEPLOYED`. Session Log entry with deploy timestamp and monitoring window outcome.
- On rollback: **Status** → `BLOCKED`. Fill the row's `Blocking` field with a pointer to the rollback runbook entry. Session Log entry summarizing the rollback decision.

---

## Status state machine

```
PENDING → IN_PROGRESS → IN_REVIEW → MERGED → STAGING_DEPLOYED → PROD_DEPLOYED
                                      ↘ ABORTED
              BLOCKED (sideways from any active state)
```

State definitions:

- **`PENDING`** — Ticket is in the sprint and queued; not yet pulled. Default state for Queue rows.
- **`IN_PROGRESS`** — Sprint-dev Stage 1 entered; impl-plan being authored or code being written.
- **`IN_REVIEW`** — PR opened; reviewer running.
- **`MERGED`** — PR squash-merged into `staging`; CI not yet green.
- **`STAGING_DEPLOYED`** — Staging CI smoke passed; staging environment auto-deployed; Jira at `Ready For QA`.
- **`PROD_DEPLOYED`** — Stage 5 succeeded; production live.
- **`BLOCKED`** — Any active state can move sideways to `BLOCKED` (deploy failure, rollback, dependency block). Fill the row's Blocking column with the cause.
- **`ABORTED`** — Terminal cancellation. Move row to `Cancelled (Aborted)` section with reason + decision date.

State changes are append-only in the Session Log. Never rewrite a past transition — add a new entry that supersedes it.

---

## Stale handling

- **>24h since Last Updated** → regenerate with user confirmation. Warn that Jira may have moved past the report state and offer to refresh.
- **Manual edits to the Session Log** → ALWAYS preserved on regenerate. The Roadmap Generator appends new entries; it never touches existing ones.
- **Manual edits to tables** → preserved when the Jira state matches; overwritten only when Jira disagrees and the user confirms. If the user wants to lock a manual override, they note it in the Session Log.

When in doubt: append a Session Log entry explaining the change rather than silently overwriting.

---

## Trigger phrases (batch mode detection)

Batch mode activates on any of:

- `"process sprint N"` (e.g. "process sprint 12")
- `"continue sprint"` / `"continue sprint N"`
- `"implement sprint N"` / `"implementar sprint N"`
- `sprint-file` parameter explicitly provided
- `"work the sprint"` / `"loop through the sprint"` / any phrase that implies a multi-ticket loop

Single-ticket mode activates on:

- A bare ticket ID (`"trabajar UPEX-277"`)
- Bug-only invocations (`"fix UPEX-301"`)
- `"resume implementation"` / `"continue where I left off"`
- Anything without a sprint scope

If the invocation is ambiguous, ASK once before generating the report.

---

## Single-ticket mode

When the orchestrator is in single-ticket mode:

1. At Stage 1 entry, **read** the latest `SPRINT-{N}-DEVELOPMENT.md` (if present) for queue / dependency context. Look for: same-sprint blocking tickets, related epic threads, prior carryovers from previous sprint.
2. Do NOT update the report. Single-ticket runs leave no trace in `.context/reports/`.
3. Per-ticket artifacts still live under `.context/PBI/{module}/{TICKET}-{title}/`.

This keeps the report a sprint-scoped artifact owned by batch mode and avoids stale half-updates from one-off invocations.

---

## Batch mode boundaries

- **Loop runs Stage 1 → Stage 4 only.** After Stage 4 completes for a ticket, the orchestrator presents a per-ticket summary + remaining queue and **waits for the user OK** before pulling the next ticket.
- **Stage 5 (production deploy) is NEVER chained in batch mode.** Production promotion is a separate, per-ticket manual invocation. Even if every ticket in the sprint is `STAGING_DEPLOYED`, prod requires explicit per-ticket dispatch.
- **Auto-skip on red signal**: if a ticket lands in `BLOCKED` mid-stage, append a Session Log entry, surface the blocker to the user, and DO NOT auto-advance to the next ticket. Wait for instructions.
- **TDD on a function** is handed off per-ticket to `/unit-testing`; batch mode does not override TDD decisions.

---

## Coupling with `/product-management` G workflow

- `/product-management` G renders a **read-only PM-facing inline snapshot** of the current sprint state. It queries Jira live and does NOT write to `.context/`.
- This skill (`/sprint-development` batch mode) **writes** to `.context/reports/SPRINT-{N}-DEVELOPMENT.md` for the dev audience.
- The two consume the same Jira data but serve different purposes (PM visibility vs dev session-resume context) and write to different surfaces. **No collision.**
- If both run in the same session, the PM snapshot reflects whatever was last persisted by sprint-dev; sprint-dev updates the file on its own cadence (per Jira transition).

---

## Variables consumed

- `{{ISSUE_TRACKER}}` — Jira instance label
- `{{PROJECT_KEY}}` — Jira project key
- `{{jira.status.story.*}}` / `{{jira.transition.story.*}}` — canonical Jira slugs from `.agents/jira-workflows.json`
- `git config user.name` — default `tech_lead` and `Owner` values

---

## Error protocol recap

| Signal                                        | Action                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sprint file missing on batch trigger          | Generate via Part 1 before entering the ticket loop.                                        |
| Sprint file stale (>24h)                      | Warn + ask before regenerating. Preserve Session Log entries.                               |
| Ticket in `BLOCKED` during loop               | Append Session Log entry, surface blocker, pause loop, wait for user.                       |
| Jira transition fails                         | Append Session Log entry with the failure, leave row in its current state, surface to user. |
| User says "next" but every ticket is terminal | Report sprint-complete summary, do not invent work.                                         |

Never silently advance past a red signal.
