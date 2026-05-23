---
name: sprint-development
description: "Orchestrates the per-story dev loop end-to-end: Planning -> Implementation -> Code Review -> Staging deploy -> (gated) Production deploy. Mega-orchestrator on the dev side. Drives the 12-step workflow: epic precheck, Jira transitions (Ready For Dev -> In Progress -> In Review -> Ready For QA), impl plan, code, PR, review, docs, merge, staging deploy, optional production deploy with rollback. Triggers on: implementar esta historia, implement this story, trabajar el ticket UPEX-XXX, plan to code to review to deploy, fix this bug and merge, deploy a staging, code review for PR, production deployment, rollback, continue implementation, story-level dev workflow, sprint-development, process sprint N, continue sprint, implement sprint N, sprint-file. Do NOT use for: foundational product definition (use /project-foundation), infrastructure scaffolding (use /project-bootstrap), backlog seeding / AC refinement (use /product-management), unit-testing TDD (use /unit-testing), formal QA testing (out of scope here)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: implementation
complementary_categories:
  - frontend-ui
  - frontend-framework
  - forms-validation
  - backend-db
  - testing-e2e
  - accessibility
  - seo
  - ci-cd
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Sprint Dev — Plan, Code, Review, Deploy per Story

Drive the per-story development loop from Jira ticket to deployed code. Five stages, always in this order: **Stage 1 Planning -> Stage 2 Implementation -> Stage 3 Code Review -> Stage 4 Staging Deploy -> Stage 5 Production Deploy (gated, optional)**.

The same pipeline runs whether the input is a new story, a bug fix, or a resume of an interrupted implementation. Only the entry point and the dispatch payload per stage differ.

---

## When to use

Common scenarios this skill handles:

- **New user story** (most common) -> Stage 1 (story-plan) -> Stage 2 (implement-story) -> ... -> Stage 4
- **New feature with multiple stories** -> Stage 1 macro (feature-plan) -> loop Stage 1+2 per story -> Stage 4 per merge
- **Bug fix** -> skip to Stage 2 with `bug-fix-workflow.md` (root cause first), then Stage 3+4
- **Resume from interruption** -> Stage 2 entry via `continue-implementation.md`
- **PR feedback / code review iteration** -> Stage 3 with `fix-issues.md`, fix-and-iterate loop
- **Production deploy** (separate event) -> Stage 5, only after QA green + business approval

Trigger phrases: "implementar esta historia", "implement this story", "trabajar el ticket UPEX-XXX", "plan to code to review to deploy", "fix this bug and merge", "deploy a staging", "code review for PR", "production deployment", "rollback", "continue implementation", "story-level dev workflow", "sprint-development".

---

## Pre-requisites

- `.agents/project.yaml` populated. If missing, clone the full boilerplate — foundation files ship with the repo.
- Story exists in the issue tracker with refined Acceptance Criteria. If backlog is empty or AC are unclear, run `/product-management` first.
- Branch policy clear and CI configured. First-time-only setup lives in `references/setup-linting.md` and `references/ci-cd-setup.md`.
- Working directory is the **target project repo**. Sprint-dev runs there, not in the boilerplate.
- `.env` populated with environment URLs and credentials. Never hardcode credentials.

If any of the above is missing, fast-fail and hand off to the appropriate setup skill before continuing.

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a sprint-development workflow. Read in order; stop earlier when the ticket is small enough that later inputs add no signal.

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (custom fields, statuses, link types) for the active workspace.
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping for `{{jira.<slug>}}` resolution.
4. `.agents/jira-workflows.json` — workflow + transition catalog (resolves Ready For Dev → In Progress → In Review → Ready For QA).
5. `.context/master-implementation-plan.md` — Master Sprint roadmap for the parent feature (priority + dependency context).
6. `.context/PBI/{module}/{TICKET}-{slug}/context.md` — story-level context: ACs, session notes, open questions.
7. `.context/PBI/{module}/{TICKET}-{slug}/implementation-plan.md` — canonical story-level technical plan (read before Stage 2 resume).
8. `.context/SRS/` architecture-specs — only when the story touches a cross-cutting concern (auth, data model, infra).
9. `.context/business/business-data-map.md` · `business-feature-map.md` · `business-api-map.md` — impact assessment when the story touches multiple domains.

**Optional inputs.** Business maps (9) frequently arrive after `/business-*-map` runs and may be absent. Proceed without them when missing; surface a `missing_input` note in the Stage 1 plan so a later pass can fill the gap.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) is NOT optional. Phase 1 plan is delegated to the canonical artifact at `.context/PBI/<JIRA-KEY>/impl-plan.md`; this skill writes only `progress.md`.

This skill is **per-ticket scope**: `<scope>` = `<JIRA-KEY>` (e.g. `UPEX-123`), resolved from the invocation trigger. Session state lives at `.session/sprint-development/<JIRA-KEY>/progress.md` per `agentic-dev-core/references/session-management.md` §3 + §9. This skill adopts the **progress-only variant** (§5 special cases + §13) — no `plan.md` is written under `.session/`; the canonical plan stays committed at `.context/PBI/<JIRA-KEY>/impl-plan.md`.

This skill is compliant with the doctrine in `agentic-dev-core/references/orchestration-doctrine.md`. Every dispatch follows the 6-component briefing format defined in `agentic-dev-core/references/briefing-template.md`, and the pattern selected per stage matches the decision guide in `agentic-dev-core/references/dispatch-patterns.md`.

| Stage / step                              | Pattern                | Subagent role                                                                                 |
| ----------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| Trigger / context-load (epic precheck)    | inline                 | orchestrator reads epic artifacts + ticket; no subagent yet                                   |
| Stage 1 — Plan creation                   | Single                 | dedicated planner subagent: read story + AC, decompose tasks, output `implementation-plan.md` |
| Stage 2 — Implementation (multi-file)     | Sequential or Parallel | impl agent(s); split by file or feature slice per the implementation plan                     |
| Stage 2 — Verification (lint+types+tests) | Parallel cap=3         | three verifiers in parallel: `bun run lint:check`, `bun run build` / `tsc`, unit tests        |
| Stage 3 — Code review                     | Single                 | reviewer subagent: static review against the AC + code-standards checklist                    |
| Stage 3 — Fix-and-iterate (if review red) | Sequential             | impl agent picks up review notes via `fix-issues.md`; re-runs verification                    |
| Stage 4 — Deploy to staging               | Single + Background    | deploy agent kicks off; background monitor watches health/smoke                               |
| Pre-prod gate                             | inline                 | orchestrator gates with the user; never auto-promote                                          |
| Stage 5 — Deploy to production            | Single + Background    | same pattern as staging, prod target, plus rollback ready                                     |

> **Sequential, not Parallel, across stages**: each stage feeds the next (Stage 1's plan is read by Stage 2; Stage 2's diff is read by Stage 3; Stage 3's approval gates Stage 4). Parallelism happens _inside_ a stage (e.g., parallel verification, multi-file impl).

> **On any subagent failure**: STOP, report partial state (which stages completed, what artifacts landed, which Jira transitions fired), present retry / skip-step / abort options. Do NOT auto-fix nor auto-rollback. See `agentic-dev-core/references/orchestration-doctrine.md`.

---

## Sprint roadmap checkpoint (batch-sprint mode only — skip in single-ticket mode)

Detect batch mode from the user invocation ("process sprint N", "implement sprint N",
"continue sprint", a `sprint-file` parameter, or any phrase that implies a sprint loop).

Check whether `.context/reports/SPRINT-{N}-DEVELOPMENT.md` exists for the target sprint.

- **Missing** → generate it before entering the ticket loop. Delegate to
  `references/sprint-report.md` §Part 1 — Sprint Roadmap Generator.
- **Present but older than 24h, OR the user explicitly asks for a refresh** →
  regenerate (warn + confirm overwrite, preserve Session Log entries).
- **Present and fresh** → proceed.

Single-ticket and bug-only invocations skip this step entirely. The orchestrator reads
the latest sprint report (if present) at Stage 1 entry for queue/dependency context
awareness, but does NOT update it. In batch mode, the orchestrator updates the report
row at each Jira transition (Stage 1 → Stage 4). Stage 5 (production deploy) is
**always** manual per ticket — batch mode loops Stages 1–4 only.

### Composable callees

Per `complementary_categories` in this skill's frontmatter and the matching rule in `agentic-dev-core/references/skill-composition-strategy.md` §3:

- **UI work in any stage** → `frontend-ui` category match (T3 or T4 — ASK if T4).
- **Next.js / React patterns** → `frontend-framework` category match (T3 silent if matched).
- **Forms work** → `forms-validation` category match (T3 silent).
- **DB work** → `backend-db` category match (T3 silent).
- **E2E tests if in scope** → `testing-e2e` category match (T4 — ASK before load).

When delegating to a sub-agent, inject a `## Composable Skills` block into the sub-agent prompt listing the resolved skills + project standards per `agentic-dev-core/references/skill-composition-strategy.md` §6.2.

---

## Main workflow

```
[Story in Jira: Ready For Dev]
       |
       v
   +--------------------------+
   | Epic precheck (PASO 0)   |   inline; verify feature-plan + feature-implementation-plan exist
   +--------------------------+
       |
       v
   +--------------------------+
   | Stage 1: PLANNING        |   references/feature-plan.md, story-plan.md
   |  - Read story + AC       |
   |  - Discover ATP (if any) |
   |  - Decompose into tasks  |
   |  - Output: impl-plan.md  |
   |  - Jira: -> In Progress  |
   +--------------------------+
       |
       v
   +--------------------------+
   | Stage 2: IMPLEMENTATION  |   references/implement-story.md, bug-fix-workflow.md,
   |  - TDD optional          |       continue-implementation.md, fix-issues.md,
   |    (-> /unit-testing)    |       code-standards.md, error-handling.md, data-testid-standards.md
   |  - Multi-file edits      |
   |  - Lint+types+tests      |
   |    in parallel (cap=3)   |
   |  - Iterate on red signal |
   +--------------------------+
       |
       v
   +--------------------------+
   | Stage 3: CODE REVIEW     |   references/review-pr.md, setup-linting.md
   |  - Push branch + open PR |
   |    (-> /git-flow-master) |
   |  - Jira: auto -> In Review
   |  - Static review checklist
   |  - Fix-and-iterate loop  |
   |  - Update docs in branch |
   +--------------------------+
       |
       v
   +--------------------------+
   | Stage 4: STAGING DEPLOY  |   references/staging-deploy.md, ci-cd-setup.md, environment-config.md
   |  - Merge -> CI green     |
   |  - Auto-deploy staging   |
   |  - Jira: auto -> Ready For QA
   |  - Notify QA in ticket   |
   +--------------------------+
       |
       v
[QA verifies on staging — out of scope here]
       |
       v (gate: QA green + business approval)
   +--------------------------+
   | Stage 5: PRODUCTION (opt)|   references/pre-deploy-checklist.md, production-deploy.md, rollback-plan.md
   |  - Pre-deploy checklist  |
   |  - Deploy to prod        |
   |  - Monitor + rollback ready
   +--------------------------+
```

---

## Phase 0 — Resume check (MANDATORY, inline)

Before Epic precheck and Stage 1 — Planning, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Resolve `<scope>` for this invocation: `<JIRA-KEY>` from the trigger (e.g. `UPEX-123`).
2. Check whether `.session/sprint-development/<JIRA-KEY>/progress.md` exists.
3. If it does NOT exist → proceed to Epic precheck and Stage 1. The orchestrator creates the directory and writes the first `progress.md` entry once Stage 1 begins. **No `plan.md` is written under `.session/`** — `.context/PBI/<JIRA-KEY>/impl-plan.md` remains canonical.
4. If it DOES exist:
   1. Read `.session/sprint-development/<JIRA-KEY>/progress.md` in full (tail of last ~3 entries minimum).
   2. Read the cross-referenced `.context/PBI/<JIRA-KEY>/impl-plan.md` (canonical plan).
   3. Surface to the user: ticket Goal (from impl-plan), last completed stage + timestamp, next planned stage, any blocking notes (e.g. "PR opened but CI red — last review note unresolved").
   4. Offer three options and WAIT for input: **resume** (jump to the next planned stage — Stage 2 chunk, Stage 3 fix-iterate, etc.) / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-sprint-development-<JIRA-KEY>-aborted/`, then re-enter Epic precheck) / **abort**.

Phase 0 is inline — no subagent dispatch. The check fires even on first invocation so resume-vs-fresh is deterministic.

**`progress.md` Cross-references contract**: when the orchestrator writes the first entry, the file's `## Cross-references` section MUST cite both `.context/PBI/<JIRA-KEY>/impl-plan.md` (canonical plan) and `.context/reports/SPRINT-<N>-DEVELOPMENT.md` (cross-ticket sprint tracker, when batch mode is active). These two pointers replace the `plan.md` that the full variant would write.

> **Progress checkpoint**: the orchestrator appends a `progress.md` entry per `agentic-dev-core/references/session-management.md` §7 at each of: Stage 1 done (impl-plan committed + Jira → In Progress), every Stage 2 implementation chunk completed (multi-file edit pass + verification cap=3 green), each Stage 3 review iteration (review pass red → fix-issues loop → re-review), Stage 4 staging merged (Jira → Ready For QA), Stage 5 prod deployed (or rollback). Failed phases emit `status: failed` entries; retries emit fresh entries (append-only mandate, never rewrite).

## Stage walkthroughs

### Epic precheck (inline, before Stage 1)

Confirm the parent epic has the macro artifacts: `feature-test-plan.md` (from product-management / shift-left) and `feature-implementation-plan.md` (macro tech plan). If either is missing, surface the warning and offer to (a) generate via `references/feature-plan.md` or hand off to `/product-management`, or (b) proceed without — user choice.

### Stage 1: Planning

When to do macro feature plan vs micro story plan: a feature spanning 3+ stories merits a macro `feature-plan.md` first; otherwise jump straight to `story-plan.md`.

The story-level plan must map every Acceptance Test Plan test case to an implementation step. **Source-of-truth order for the ATP**: (1) Jira comments containing "Test Case" / "TC-" / "Scenario:", (2) Jira custom field for the Acceptance Test Plan, (3) local `test-cases.md` / `acceptance-test-plan.md` (fallback only).

Read for guidance:

- `references/feature-plan.md` — macro plan (epic-level, multiple stories)
- `references/story-plan.md` — micro plan (single story, recommended starting point)

Output: `implementation-plan.md` per story (or `feature-implementation-plan.md` per feature). Lives alongside the story folder in the project repo. Commit it before Stage 2 starts. Transition Jira `Ready For Dev -> In Progress`.

**Sprint report**: if batch mode is active, update the in-flight row for this ticket: Status PENDING → IN_PROGRESS; fill Owner, Path (A or B), Impl Plan link, Forecast Risk from the Workload Forecast block. See `references/sprint-report.md` §Part 2.

Persistence: story plans persist at `.context/PBI/{ticket}/impl-plan.md` with topic_key `pbi/{ticket}/impl-plan`; macro feature plans use `pbi/{epic-slug}/feature-impl-plan`. Auto-generated, so `capture_prompt: false`. See `agentic-dev-core/references/topic-key-conventions.md`.

#### Workload Forecast (required output of Stage 1)

After the impl-plan is written, the planner emits a forecast block at the bottom of `implementation-plan.md` and into the orchestrator turn-summary:

```
## Review Workload Forecast

Estimated: <X> additions + <Y> deletions = <Z> total lines
400-line budget risk: Low | Medium | High
Chain strategy: stacked-to-main | feature-branch-chain | size-exception | pending
Decision needed before apply: Yes | No
```

Algorithm (per-file multipliers, 20% test+docs buffer), risk thresholds (`<200` Low, `200-400` Medium, `>400` High), and chain-strategy options live in `references/workload-forecast.md`. The block is emitted by the planner; the **gate** is enforced by the orchestrator at the Stage 1 → Stage 2 boundary (see Stage 2 below).

### Stage 2: Implementation

**Gate (workload forecast)**: Stage 2 does NOT start if the Stage 1 forecast block reports `risk=High` AND `chain_strategy=pending`. Resolve the strategy by handing off to the `/git-flow-master` skill (Step 4 — chained-PR decision tree + concrete branch plan), then return: update the forecast block in `implementation-plan.md` with the chosen strategy and proceed. See `references/workload-forecast.md` for full gate behavior.

Pick the right entry point based on ticket type:

- **New story** -> `references/implement-story.md` (main flow). Walk the impl plan step-by-step.
- **Bug fix** -> `references/bug-fix-workflow.md` (root-cause first; reproduce; fix; regression check). Root-cause notes persist at `.context/PBI/{ticket}/bug-fix.md` with topic_key `pbi/{ticket}/bug-fix`. See `agentic-dev-core/references/topic-key-conventions.md`.
- **Resuming after interruption** -> `references/continue-implementation.md` (re-orient, identify last completed step, resume).
- **PR feedback / lint or CI red** -> `references/fix-issues.md` (address comments without rewriting history).

Read inline for style + standards:

- `references/code-standards.md` — TS patterns, imports, error handling
- `references/error-handling.md` — public-method fail-fast vs utility silent-fail
- `references/data-testid-standards.md` — naming + placement of test ids

Verification runs in **parallel cap=3**: lint, typecheck/build, unit tests. Each subagent reports red/green; the orchestrator iterates only when something is red. **Atomic commits**: one commit per logical step, never one giant dump.

If the work needs TDD on a specific function, hand off to `/unit-testing` mid-implementation. The hand-off is composable: come back to Stage 2 once the unit is green.

### Stage 3: Code Review

Push the feature branch and open the PR via the `/git-flow-master` skill (it auto-detects the project's branching strategy — typically `staging` base for the main+integration pattern — and uses title format `feat({{PROJECT_KEY}}-N): <short>`). Jira automation rule should auto-transition the ticket from `In Progress -> In Review` within ~30s of PR creation; if it doesn't, surface a manual-transition warning.

**Sprint report**: update the row: Status IN_PROGRESS → IN_REVIEW; fill PR (#NNN); set Delivery Strategy from the chain decision recorded in the impl-plan forecast block.

Review checklist (driven by `references/review-pr.md`):

- All Acceptance Criteria covered by code paths
- Lint + build green; types clean
- Code-standards conformance (imports via aliases, no relative paths, parameter limits, etc.)
- Security checks (no secrets in diff, auth handled, input validation)
- UI/UX adherence to design system (where applicable)

Review notes persist at `.context/PBI/{ticket}/review.md` with topic_key `pbi/{ticket}/review`. Auto-generated review summaries use `capture_prompt: false`; human-prompted architectural decisions use `capture_prompt: true`. See `agentic-dev-core/references/topic-key-conventions.md`.

Findings loop back to Stage 2 with `fix-issues.md`. Architectural rework loops back to Stage 1 with a new spec (rare).

**Docs update before merge**: update `shift-left-status-report.md` and (optional) `release-notes.md` **inside the same PR branch** — never push docs straight to `staging`.

Hand-off: `/git-flow-master` for PR creation, merge ops, and conflict resolution.

#### Spec Compliance Matrix (required output of Stage 3)

After the static code review checklist passes, the reviewer/orchestrator generates a Spec Compliance Matrix — one row per AC scenario from the story, mapping each scenario to the evidence that proves it works:

```
| AC scenario (Gherkin) | covered_by | evidence | status |
|---|---|---|---|
| <one row per AC scenario from the story> | <type:id> | <link or path> | <status> |
```

`covered_by` accepts: `test:<id>`, `manual:<evidence-path>`, `exempt:<reason>`, `review-approved:<reviewer>`. Status legend: `covered` | `manual` | `exempt` | `review-approved` | `uncovered`.

**Gate**: PR cannot merge if any row is `uncovered` without justification. Resolve by adding a test, adding manual evidence, or reclassifying to `exempt:<specific reason>` (vague reasons are rejected). If the scenario truly cannot be verified, loop back to Stage 1 and re-spec the AC.

Algorithm, four `covered_by` shapes with examples, full status legend, the 2FA-login worked example, and persistence (`.context/PBI/{ticket}/compliance-matrix.md`, topic_key `pbi/{ticket}/compliance-matrix`): see `references/spec-compliance-matrix.md`.

### Stage 4: Staging Deploy

Merge the PR (`gh pr merge --squash`) to `staging`. CI runs end-to-end; if green, the staging environment auto-deploys (per the project's CI/CD setup — first-time setup in `references/ci-cd-setup.md`). Jira automation rule should auto-transition the ticket from `In Review -> Ready For QA` within ~30s; if it doesn't, transition manually and surface the gap.

Read for guidance:

- `references/staging-deploy.md` — staging deploy steps
- `references/ci-cd-setup.md` — first-time CI setup (run once per project)
- `references/environment-config.md` — env vars per environment, source-of-truth in `.env`

After deploy: post a QA notification comment on the ticket with PR URL, branch name, and an `@`-mention of the QA owner who did the Shift-Left.

Sync `staging` locally (`git pull origin staging`) and clean up the merged branch. Wait for the user to indicate the next ticket.

**Sprint report**: Status IN_REVIEW → MERGED once the squash-merge lands, then MERGED → STAGING_DEPLOYED after CI smoke passes. Move the row to "Done — This Sprint" once Jira reaches Ready For QA. Append a Session Log entry with date + ticket + transition.

**Hand-off**: QA verification on staging is **out of scope here**. A separate QA workflow picks up from `Ready For QA`.

On successful completion of Stage 4 (Jira reaches `Ready For QA` and staging smoke passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/sprint-development/<JIRA-KEY>/` to `.session/.archive/<YYYY-MM-DD>-sprint-development-<JIRA-KEY>/` and calls `mem_session_summary` with the archive path included (so future `mem_search "session sprint-development <JIRA-KEY>"` finds it). Stage 5 (optional production deploy) is a separate event — when invoked later, Phase 0 reopens the archived session by recreating `.session/sprint-development/<JIRA-KEY>/progress.md` and appends the Stage 5 entries on top of the archived progress (or the user can start fresh and link forward).

### Stage 5: Production Deploy (optional, gated)

Only proceed after QA green on staging **and** explicit business approval. This is a separate, gated event — never chained automatically from Stage 4.

Read for guidance:

- `references/pre-deploy-checklist.md` — go/no-go checks (DB migrations, env vars, feature flags, comms)
- `references/production-deploy.md` — deploy steps + monitoring window
- `references/rollback-plan.md` — runbook if KPIs go red post-deploy

Dispatch is **Single + Background**: one subagent runs the deploy, a background monitor watches the health window. The orchestrator stays on the line for at least the rollback decision window before declaring success.

**Sprint report**: on successful prod deploy, Status STAGING_DEPLOYED → PROD_DEPLOYED. On rollback, Status → BLOCKED with a Blocking note pointing to the rollback runbook entry. NOTE: Stage 5 never runs in batch mode — only per-ticket manual invocation.

---

## Decision tree

### Ticket type

- New story -> Stage 1 (story-plan.md)
- New feature (3+ stories) -> Stage 1 macro (feature-plan.md) -> loop Stage 1+2 per story
- Bug -> Stage 2 directly with `bug-fix-workflow.md` (root cause first; Stage 1 plan optional and lightweight)
- Continue from interrupted -> `continue-implementation.md` (Stage 2 resume; reuse existing plan)

### Code review feedback

- All green -> Stage 4 (merge + deploy)
- Comments to address -> loop back to Stage 2 via `fix-issues.md`
- Architectural rework -> back to Stage 1 with a new spec

### Staging deploy result

- Smoke green -> hand off to QA (out of scope here)
- Smoke red -> back to Stage 2 with `bug-fix-workflow.md` or `fix-issues.md`

### Production deploy

- Optional. Only after QA green + business approval.
- If deploy KPIs go red: execute `rollback-plan.md` inline; do not start a new feature until rolled back.

---

## Specific tasks — which reference to read

| User intent                                          | Read                                    |
| ---------------------------------------------------- | --------------------------------------- |
| "plan this feature (epic-level)"                     | `references/feature-plan.md`            |
| "plan this story"                                    | `references/story-plan.md`              |
| "implement this story"                               | `references/implement-story.md`         |
| "fix this bug"                                       | `references/bug-fix-workflow.md`        |
| "continue where I left off"                          | `references/continue-implementation.md` |
| "address PR feedback"                                | `references/fix-issues.md`              |
| "code style / TS patterns"                           | `references/code-standards.md`          |
| "error handling pattern"                             | `references/error-handling.md`          |
| "data-testid naming / placement"                     | `references/data-testid-standards.md`   |
| "review this PR"                                     | `references/review-pr.md`               |
| "setup eslint+prettier+typecheck for the first time" | `references/setup-linting.md`           |
| "setup CI (first time)"                              | `references/ci-cd-setup.md`             |
| "deploy to staging"                                  | `references/staging-deploy.md`          |
| "configure env vars"                                 | `references/environment-config.md`      |
| "pre-deploy-to-prod checklist"                       | `references/pre-deploy-checklist.md`    |
| "deploy to production"                               | `references/production-deploy.md`       |
| "rollback production deploy"                         | `references/rollback-plan.md`           |
| "process sprint N" / "continue sprint"               | `references/sprint-report.md`           |

---

## Hand-offs

### Project-owned (T1)

- **TDD on a function** -> `/unit-testing` skill (composable mid-implementation)
- **PR creation / merge / branch ops / conflict resolution / chained-PR planning** -> `/git-flow-master` skill
- **Backlog item missing or AC unclear** -> `/product-management` skill (refine first, then come back)
- **Foundation/infrastructure missing** -> `/project-foundation` or `/project-bootstrap`

### Composable category matches (T3/T4 — auto-discovered, ASK if T4)

See `complementary_categories` in this skill's frontmatter. Discovery and threshold rules: `agentic-dev-core/references/skill-composition-strategy.md` §3.

### Out of scope

- **QA verification on staging** -> out of scope here; a separate QA workflow picks up from `Ready For QA`.

If the prerequisite check at the top of this skill fails (no `.agents/project.yaml`, no story, no AC), STOP and hand off — do not continue.

---

## Pseudocode tags used here

| Tag                    | Resolves to                                       | Defined in                  |
| ---------------------- | ------------------------------------------------- | --------------------------- |
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[DB_TOOL]`            | DBHub MCP, Supabase MCP, or raw SQL               | `CLAUDE.md` Tool Resolution |
| `[API_TOOL]`           | OpenAPI MCP, Postman, or `curl`                   | `CLAUDE.md` Tool Resolution |

Concrete tools (`bun`, `git`, `gh`) are used literally. Project variables resolve from `.agents/project.yaml` (env-scoped vars resolve to the active environment).

---

## Variables consumed

- `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}`, `{{ATLASSIAN_URL}}` — issue tracker
- `{{WEB_URL}}`, `{{API_URL}}` — env-scoped, active env from `.agents/project.yaml`
- `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, `{{DB_TYPE}}` — stack-specific patterns
- `{{jira.*}}` — story custom fields (acceptance_criteria, business_rules, acceptance_test_plan, etc.)

If any required var is unset, ensure `.agents/project.yaml` exists (clone the full boilerplate — foundation files ship with the repo) and run `/project-foundation` to fill in stack values.

---

## Gotchas — inline rules you must apply every invocation

1. **Credentials**: always from `.env`. Never hardcode. Never guess passwords.
2. **Plan before code**: never skip Stage 1. Even bug fixes get a one-paragraph root-cause analysis before the diff.
3. **Atomic commits**: one commit per logical step. Lint + build must pass before each push.
4. **No AI attribution in commits**: never include "Generated with Claude Code", "Co-Authored-By: Claude", or similar lines.
5. **Confirm before push to main**: never push to `main`/`master` without explicit user confirmation. PR flow targets `staging`; production promotions are a separate gated event (Stage 5).
6. **Docs travel with the PR**: status-report and release-notes updates go in the feature branch, not pushed direct to `staging`.
7. **Jira automation verification**: after PR open and after merge, wait ~30s and verify the auto-transition fired. If not, transition manually and surface the gap.
8. **ATP source-of-truth**: Jira comments first, then custom field, then local file fallback. Never assume the local file is authoritative.
9. **Verification cap=3**: lint + types + unit tests in parallel; do not balloon to 5+ verifiers.
10. **No automation tests in this skill**: E2E / integration test automation is out of scope. Unit tests live in Stage 2 via `/unit-testing`. Anything QA-side is out of scope here.
11. **Language**: artifacts, code, and commit messages in English. Mirror the user's language only in conversation.

---

## Pre-flight checklist

- [ ] Pre-requisites green (project.yaml, story exists, AC clear, .env populated)
- [ ] **Batch mode resolved**: if the trigger phrase implies a sprint loop, sprint report (`SPRINT-{N}-DEVELOPMENT.md`) exists or has been generated
- [ ] Sprint report row updated at each Jira transition (IN_PROGRESS / IN_REVIEW / MERGED / STAGING_DEPLOYED / PROD_DEPLOYED)
- [ ] Session Log entry appended for any blocking / aborting / sprint-spanning event
- [ ] Epic precheck: `feature-plan.md` + `feature-implementation-plan.md` exist or user confirmed proceeding without
- [ ] Stage 1 plan committed; Jira transitioned to `In Progress`
- [ ] ATP discovered (Jira comments -> custom field -> local fallback) and mapped into the plan
- [ ] Stage 2 verification (lint + types + tests) green; commits atomic
- [ ] Stage 3 PR opened via `/git-flow-master`; Jira auto-transition to `In Review` verified
- [ ] Stage 3 docs (status-report + release-notes) updated in the PR branch
- [ ] Stage 4 PR merged to `staging`; CI green; auto-deploy fired; Jira to `Ready For QA`; QA notified in comment
- [ ] Stage 5 (only if applicable): pre-deploy checklist green; rollback plan loaded; monitoring window observed
- [ ] Hand-off identified for next step (QA workflow, or next story)

---

## Anti-patterns — NEVER do these

- **S1.** NEVER push to `main` without explicit user confirmation. PR flow targets `staging`; production is gated Stage 5.
- **S2.** NEVER skip the Stage 1 impl-plan and jump straight to code. Plan → Code → Review is a hard order; even bug fixes get a one-paragraph root-cause analysis first.
- **S3.** NEVER declare a story done without verification green across tests + types + lint (parallel cap=3). No "I'll fix the lint after merge".
- **S4.** NEVER bypass code review on a PR that touches production behavior. Review checklist + Spec Compliance Matrix gate the merge.
- **S5.** NEVER include "Generated with Claude Code", "Co-Authored-By: Claude", or similar AI-attribution lines in commit messages or PR bodies.
- **S6.** NEVER force-push, amend, or rewrite history on pushed commits in shared branches (`main`, `staging`, any branch with an open PR).
- **S7.** NEVER commit credentials, secrets, or `.env` content. Read credentials from `.env` at runtime; never inline them in code, plans, or commit messages.
- **S8.** NEVER touch files outside the story's stated scope. No "while I'm here" refactors — open a separate ticket instead.
- **S9.** NEVER mark a story `Ready For QA` without verifying the staging deploy succeeded (CI green + smoke passed). A premature transition burns QA cycles.
- **S10.** NEVER suppress failing pre-commit / pre-push hooks with `--no-verify`. If a hook is wrong, fix the hook in a separate commit; never silence it to ship.
- **S11.** NEVER hardcode `customfield_NNNNN` IDs in plans, references, or AI output. Resolve every Jira field via `{{jira.<slug>}}` against `.agents/jira-required.yaml`.
- **S12.** NEVER assume the local `acceptance-test-plan.md` is authoritative. ATP source-of-truth order: Jira comments → Jira custom field → local file fallback.

---

## Notes

- This skill ASSUMES `/project-foundation`, `/project-bootstrap`, and `/product-management` have run already (or are not needed for this project). Fast-fail if PRD/SRS missing or no story exists.
- Iterate. Don't try to ship through all 5 stages in one pass. Each PR is one Stage 4. Production (Stage 5) is a separate, gated event triggered by business approval.
- Orchestration: use the briefing template in `agentic-dev-core/references/briefing-template.md` whenever dispatching subagents (multi-file edits, parallel verification, deploy + monitor, etc.).
- Dispatch discipline: at each stage, re-evaluate Single / Sequential / Parallel / Background per the work shape. See `agentic-dev-core/references/dispatch-patterns.md`.
- On any subagent failure: STOP, report, present options. Never auto-fix or auto-rollback. See `agentic-dev-core/references/orchestration-doctrine.md`.
