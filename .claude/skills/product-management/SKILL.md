---
name: product-management
description: "Orchestrates continuous product management work — initial backlog seed from PRD, incremental feature addition, epic creation, story refinement (INVEST + 3-amigos), AC quality refinement (Gherkin), edge-case enumeration, and sprint reporting (PM visibility snapshot). Triggers on: 'create epic', 'crear épica', 'agregar historia al backlog', 'add feature', 'refine acceptance criteria', 'enumerar edge cases', 'INVEST a esta historia', '3 amigos', 'story refinement', 'product backlog seed', 'epic creation', 'ready for development checklist', 'sprint report', 'reporte de sprint', 'estado del sprint', 'reporte de épicas y stories', 'qué hay en el sprint', 'progress report', 'dashboard del backlog', 'in-flight stories snapshot'. Do NOT use for: foundational product definition (use `/project-foundation`), infrastructure scaffolding (use `/project-bootstrap`), per-story implementation (use `/sprint-development`), unit testing (use `/unit-testing`), or formal QA test cases / TMS workflows (out of scope here)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: management
complementary_categories:
  - issue-tracker
  - creativity
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

# Product Management

Orchestrates the continuous product management lifecycle: turning a fresh PRD into an initial Jira backlog, adding new features incrementally as the product evolves, structuring epics, and refining individual stories until they are truly "ready for development". Unlike `/project-foundation` (one-time, foundational), product management is **ongoing work** — re-invoke this skill any time backlog work surfaces.

## Tool abstraction — hard rule

This skill describes methodology — *what* to do at each phase. It NEVER hardcodes the *how* (specific CLI flags, MCP call shapes, REST endpoints). All tool interactions are expressed as `[ISSUE_TRACKER_TOOL]`, `[DB_TOOL]`, `[AUTOMATION_TOOL]` pseudo-code variables that resolve via `CLAUDE.md` Tool Resolution table. When the AI executes an operation, it loads the matching tool's own skill (e.g. `/acli` for Jira). Methodology persists across tool changes; this skill must too. See `references/jira-operations.md` for the operation-by-operation decision table.

## When to use

Use this skill whenever you are doing backlog or refinement work after the foundational PRD/SRS exists:

- A new feature or epic needs to be added to the backlog
- A story has rough or ambiguous acceptance criteria that need sharpening
- A story needs INVEST validation or a 3-amigos session before development starts
- You're systematically enumerating edge cases / failure modes for a feature
- You're seeding the very first product backlog from a freshly minted PRD

The skill is reference-driven: each workflow points to a specific reference file with the exact protocol.

## Pre-requisites

- `/project-foundation` should have produced `.context/PRD/` and `.context/SRS/` (required for the initial backlog-seed workflow; useful context for all others)
- `.agents/project.yaml` populated with `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}`, `{{ATLASSIAN_URL}}` — these ship with the cloned boilerplate; if missing, clone the full repo
- Atlassian / Jira tooling reachable (Atlassian CLI `acli` preferred, MCP Atlassian as fallback) for any workflow that writes to Jira

### Inputs — read these first

Canonical reading order for any AI starting cold on a product-management workflow. Read in order; stop earlier when the workflow is small enough that later inputs add no signal.

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping.
4. `.agents/jira-workflows.json` — workflow + transition catalog.
5. `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
6. `.context/master-implementation-plan.md` — Master Sprint roadmap.
7. `.context/PRD/mvp-scope.md` — what's in vs out of the MVP.
8. `.context/PRD/user-personas.md` — actor model.
9. `.context/PRD/user-journeys.md` — flow-level expectations.
10. `.context/SRS/functional-specs.md` — FR catalog (source of `**Source spec:**` references).
11. `.context/SRS/non-functional-specs.md` — NFRs (perf, security, a11y).
12. `.context/business/business-data-map.md` — entity graph (source of entity-level dependencies).
13. `.context/business/business-feature-map.md` — CRUD matrix.
14. `.context/business/business-api-map.md` — endpoint catalog (auth model, journey breakdown).
15. `.context/PBI/epic-tree.md` — current backlog state.

**Optional inputs.** Business maps (12–14) frequently arrive after `/business-*-map` runs and may be absent at seed time. Proceed without them when missing; surface a `missing_input` note in the workflow output so a later refinement pass can fill the gap.

## Glossary

Two layers share the noun "Sprint". Disambiguate when ambiguity matters; otherwise use the bare term.

- **Master Sprint** — strategic / architectural grouping (Master Sprint 1–7 typical) sourced from `.context/master-implementation-plan.md` §5. Locked at PRD time; updates rarely. A single Master Sprint contains multiple Execution Sprints internally.
- **Execution Sprint** — operational / dependency-driven grouping (Execution Sprint 1, 2, 3 …) produced by `references/sprint-sequencing.md` via topological sort of the dependency-link graph. Recomputed whenever stories or links change.

Use the bare word **Sprint** only when the layer is obvious from context. When ambiguity matters, qualify.

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any workflow below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`issue-tracker`, `creativity`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this PM workflow? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents (backlog seeding, story refinement, AC enumeration, sprint reporting), inject a `## Composable Skills` block per strategy doc §6.2.

Expected matches (illustrative — actual list depends on what the user has installed):

| Category        | Likely matches                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `issue-tracker` | `acli` (T1 sister — silent; primary Jira CLI). Atlassian MCP is the fallback declared above, not a skill |
| `creativity`    | T4 ASK: `brainstorming` — useful for edge-case enumeration, persona expansion, Three Amigos session prep |

Skip step only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

Session management applies **only to workflows A, B, C** below. Short, single-actor, non-interruptible workflows opt out:

| Workflow                          | Session-managed?           |
| --------------------------------- | -------------------------- |
| A — Initial backlog seed          | Yes — scope `seed`         |
| B — Incremental feature           | Yes — scope `<epic-slug>`  |
| C — Epic creation                 | Yes — scope `<epic-slug>`  |
| D — Story refinement              | No (short, non-interruptible) |
| E — AC quality refinement         | No                         |
| F — Edge-case enumeration         | No                         |
| G — Sprint reporting              | No (read-only)             |
| H — Sprint sequencing             | No (one-shot derivation, no scope) |

When the user invokes any of D / E / F / G / H, do NOT create a `.session/product-management/` directory and do NOT run Phase 0. Skill the carve-out is documented here so users don't expect a session directory for those workflows.

## Phase 0 — Resume check (MANDATORY for A / B / C only, inline)

Before dispatching any subagent or invoking workflow A / B / C below, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Resolve `<scope>` for this invocation:
   - Workflow A → `<scope>` = `seed`
   - Workflows B / C → `<scope>` = `<epic-slug>` (kebab-case epic identifier resolved from user input)
2. Check whether `.session/product-management/<scope>/progress.md` exists.
3. If it does NOT exist → proceed to Phase 1 (write `plan.md`).
4. If it DOES exist:
   1. Read `.session/product-management/<scope>/plan.md` in full.
   2. Read the tail of `.session/product-management/<scope>/progress.md` (last ~3 phase entries).
   3. Surface to the user: plan Goal (one sentence), last completed phase + timestamp, next planned phase, any blocking notes.
   4. Offer three options and WAIT for input: **resume** / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-product-management-<scope>-aborted/`) / **abort**.

Phase 0 is inline — no subagent dispatch.

## Phase 1 — Write `plan.md` (A / B / C only)

After Phase 0 confirms no prior session exists, write `.session/product-management/<scope>/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6:

- Frontmatter: `topic_key: session/product-management/<scope>/plan`, `skill: product-management`, `scope: <scope>`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` (PRD / SRS paths, Jira project key, existing epic list when applicable) · `## Approach` · `## Phase breakdown` (per workflow — A enumerates epics-to-seed; B routes single-story / full-epic / multi-epic; C decomposes epic into stories) · `## Risks & open questions` · `## Verification checklist` · `## Cross-references` (cite `.context/PBI/<scope>/` epic + story files).

Dispatch: inline draft for B / C when scope is one epic; Single planner subagent for A when the PRD has 5+ epics to seed.

After `plan.md` is written and the user approves, transition `status: draft → approved` and proceed to the workflow's first execution phase.

> **Progress checkpoint**: per-epic-created (A), per-story-added (B), per-section-of-epic decomposed (C). The orchestrator appends an entry to `.session/product-management/<scope>/progress.md` per `agentic-dev-core/references/session-management.md` §7 at each checkpoint.

## Main workflows

### A. Initial backlog seeding (one-time, from PRD)

When you have a fresh PRD/SRS and zero issues in Jira, generate the initial backlog tree (epics + their foundational stories) and persist it both in Jira and under `.context/PBI/`.

Read `references/product-backlog-seed.md`.

Output: `.context/PBI/epic-tree.md` + per-epic folders + initial stories created in Jira under `{{PROJECT_KEY}}`. Each epic file persists with topic_key `pbi/{epic-slug}/epic`; per-story files use `pbi/{ticket}/spec`. See `agentic-dev-core/references/topic-key-conventions.md`.

### B. Incremental feature addition (continuous)

When a new feature emerges mid-flight (PO ask, market opportunity, post-MVP work, customer feedback). The reference first analyzes complexity — single story, full epic, or multi-epic — then routes accordingly.

Read `references/add-feature.md`.

Output: new epic or stories appended to the backlog, with the complexity decision documented.

### C. Epic creation (from scratch or from add-feature workflow)

When you need to formally structure a new epic — naming, scope boundaries, decomposition into stories, traceability back to PRD goals.

Read `references/epic-creation.md`.

Output: epic folder under `.context/PBI/{epic-slug}/` + `epic.md` + decomposed child stories. Topic_key: `pbi/{epic-slug}/epic` (UPSERT semantics; see `agentic-dev-core/references/topic-key-conventions.md`).

### D. Story refinement (per story)

When a story exists in Jira but is not yet "ready for development". Validates INVEST, optionally runs a 3-amigos session, ensures story slicing is appropriate, and confirms the ready-for-development checklist passes.

Read `references/story-refinement.md`.

Output: refined story with INVEST validated, optional 3-amigos notes appended, ready-for-dev checklist confirmed.

### E. AC quality refinement (per story)

When a story has rough acceptance criteria — vague conditions, missing data, no error scenarios, no boundaries — and you need to sharpen them into concrete Gherkin scenarios (Scenario / Given–When–Then).

Read `references/acceptance-criteria.md`.

Output: refined AC in Gherkin with concrete data, error scenarios, and boundary scenarios; ambiguities surfaced as open questions if not resolvable from PRD/SRS. Persists at `.context/PBI/{ticket}/spec.md` with topic_key `pbi/{ticket}/spec`. See `agentic-dev-core/references/topic-key-conventions.md`.

### F. Edge-case enumeration (per feature/epic)

When designing or refining a feature and you need to systematically enumerate failure modes, boundary conditions, integration risks, and unusual user paths. Includes the decision rule for what becomes AC vs what stays as a test-only concern.

Read `references/edge-cases-enumeration.md`.

Output: cataloged edge cases with criticality + decision (high-criticality + clearly-defined behavior → promote into AC; otherwise → test-only, hand off to QA). Persists at `.context/PBI/{ticket}/edge-cases.md` with topic_key `pbi/{ticket}/edge-cases`. See `agentic-dev-core/references/topic-key-conventions.md`.

### G. Sprint reporting (read-only PM snapshot)

When the user wants a development-oriented view of the current sprint and backlog — epics, stories, PRs grouped by status (BLOCKED, In Progress, In Review, Ready For Dev, Backlog, Done) with metrics and alerts. This is **read-only** — it does not change Jira state, does not create issues, and does not write to `.context/`. Its job is to gather state from `[ISSUE_TRACKER_TOOL]` (and optionally `gh` for PRs) and render a structured markdown report in the conversation.

Read `references/sprint-report.md`.

Output: a markdown sprint report rendered inline (epics + stories + PRs + status summary + per-epic progress + alerts). Not persisted by default — persist only if the user explicitly asks.

### H. Sprint sequencing (topological execution order)

When the user asks "what do we work on first?", "qué historias trabajamos primero", "execution order", "sprint plan", or "topological order". Compute Execution Sprints by topologically sorting the dependency-link graph across the in-scope epics + stories.

Read `references/sprint-sequencing.md`.

Output: `.context/PBI/sprint-sequence.md` (always persisted, overwrite on re-run) + an inline summary table. Session-managed: NO (one-shot derivation, no plan.md required).

## Archive (A / B / C only)

On successful completion of workflow A / B / C (Verification checklist from the workflow's `plan.md` passes), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/product-management/<scope>/` to `.session/.archive/<YYYY-MM-DD>-product-management-<scope>/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back. Workflows D / E / F / G never write `.session/` directories and therefore have nothing to archive.

## Specific tasks — which reference to read

| User intent                                                                                                                        | Read                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| "create initial backlog from PRD" / "seed the product backlog"                                                                     | `references/product-backlog-seed.md`   |
| "add new feature" / "agregar feature al backlog" / "incremental story creation"                                                    | `references/add-feature.md`            |
| "create epic" / "crear épica" / "epic structure" / "epic vs feature flag"                                                          | `references/epic-creation.md`          |
| "refine this story" / "INVEST" / "ready for development" / "3 amigos" / "story slicing"                                            | `references/story-refinement.md`       |
| "refine AC" / "acceptance criteria quality" / "Gherkin scenarios" / "AC ambiguities"                                               | `references/acceptance-criteria.md`    |
| "enumerate edge cases" / "boundary scenarios" / "failure modes" / "what could go wrong"                                            | `references/edge-cases-enumeration.md` |
| "sprint report" / "reporte de sprint" / "estado del sprint" / "qué hay en el sprint" / "progress report" / "dashboard del backlog" | `references/sprint-report.md`          |
| "what do we work on first?" / "qué historias trabajamos primero" / "execution order" / "sprint plan" / "topological order"         | `references/sprint-sequencing.md`      |

## Optional: Delta Specs Pattern

For projects with concurrent devs on the same feature, compliance/audit requirements, or capabilities that need an explicit history of behavioral change, an opt-in formal change-tracking pattern is available. Instead of editing acceptance criteria in place on each story, you maintain:

- **Source-of-truth specs** at `.context/PBI/specs/{capability}/{feature}.md` (canonical, always-current behavior — RFC 2119 + Gherkin)
- **Delta specs** per change at `.context/PBI/{ticket}/spec.md` with explicit `## ADDED Requirements`, `## MODIFIED Requirements`, and `## REMOVED Requirements` sections
- **Archive process** that merges deltas back into the source-of-truth on story close and moves the change folder under `.context/PBI/archive/YYYY-MM-DD-{ticket}/`

See `references/delta-specs.md` for the full pattern: when to adopt it, requirement format, the **copy-full-then-edit rule** for MODIFIED requirements, the archive protocol, and migration guidance.

**Default flow remains in-place AC editing** (lower overhead, fits solo developers and small teams). Adopt delta specs only when one of the conditions in the reference document actually holds — the overhead is real.

## Hand-offs

When PM artifacts are ready, the natural downstream skills are:

- **Per-story implementation** → `/sprint-development` (planning → code → review → deploy loop)
- **TDD on a single function** → `/unit-testing` (composable inside `/sprint-development`)
- **Formal QA test cases, exploratory testing, automation, regression** → out of scope here; handled by a separate QA workflow

## Anti-patterns — NEVER do these

- **I1.** NEVER hardcode `customfield_NNNNN` IDs in skill or AI output. Resolve via `{{jira.<slug>}}`.
- **I2.** NEVER prefix story summaries with `FR-XXX —`. Use `**Source spec:** FR-XXX` as the first body line.
- **I3.** NEVER copy AC / Scope / Out-of-Scope content into the description. Those live exclusively in their custom fields.
- **I4.** NEVER let two stories in the same epic share a literal Scope bullet. Surface as `overlap_alert` and ask the user to resolve.
- **I5.** NEVER invent acceptance criteria, scope items, or business rules. Source must be PRD / SRS / business map / explicit user input. If missing → report `gap`, halt that field, continue with the rest.
- **I6.** NEVER batch multiple ADF custom fields in a single MCP update call. Split per field, or pre-convert with `md-to-adf.ts`.
- **I7.** NEVER nest inline `` `code` `` inside `**bold**` markdown destined for ADF — the converter combines incompatible marks and Jira rejects HTTP 400.
- **I8.** NEVER create stories without immediately running the dependency-linking phase. Local declarations are not enough; Jira links must exist.
- **I9.** NEVER hardcode `acli`, `mcp__atlassian__`, or REST URL examples in this skill. Use `[ISSUE_TRACKER_TOOL]` pseudo-code. The tool skill owns the syntax.
- **I10.** NEVER use "Wave" terminology. Use "Sprint" (or "Master Sprint" / "Execution Sprint" when ambiguity matters).
- **I11.** NEVER skip sprint-sequencing after creating multiple linked stories.
- **I12.** NEVER hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Use `{{jira.link_types.<slug>}}`.
- **I13.** NEVER use `Relates` for ordering-sensitive dependencies. Symmetric → direction is lost. Use `Dependencies` (or flag fallback explicitly as degradation).
- **I14.** NEVER ignore cycle detection in sprint-sequencing. A cycle in the `dependencies` graph is a bug — halt and report.

## Variables consumed

This skill uses standard `.agents/project.yaml` variables resolved at runtime:

- `{{PROJECT_KEY}}` — Jira project key (e.g., `MYM`, `UPEX`)
- `{{ISSUE_TRACKER}}` — issue tracker name (typically `Jira`)
- `{{ATLASSIAN_URL}}` — workspace URL

In addition, every Jira-side identifier (custom field, status, link type) is resolved via slug indirection. `.agents/jira-required.yaml` is the canonical slug catalog:

- `{{jira.<slug>}}` — custom-field IDs resolved via `.agents/jira-required.yaml` + `.agents/jira-fields.json`. Examples: `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, `{{jira.business_rules_specification}}`, `{{jira.workflow}}`, `{{jira.weblink}}`, `{{jira.mockup}}`.
- `{{jira.statuses.<slug>}}` — default statuses for newly-created items. Examples: `{{jira.statuses.epic_default}}` (default literal `Planning`), `{{jira.statuses.story_default}}` (default literal `Shift-Left QA`).
- `{{jira.link_types.<slug>}}` — link-type names resolved via `.agents/jira-link-types.json`. Sub-fields: `.outward`, `.inward`, `.fallback`. Examples: `{{jira.link_types.dependencies}}`, `{{jira.link_types.dependencies.outward}}` (`depends on`), `{{jira.link_types.dependencies.inward}}` (`is dependency for`), `{{jira.link_types.dependencies.fallback}}` (`relates`).

If unset, clone the full boilerplate — these foundation files ship with the repo.

## Notes

- Refinement is a **continuous activity**, not a one-time gate. Re-invoke this skill any time AC questions emerge, edge cases surface during design, or a story is found to violate INVEST mid-sprint.
- The 3-amigos protocol is **optional** in story refinement — recommended for stories larger than ~5 SP, integration-heavy stories, or anything touching unfamiliar areas of the system.
- Edge cases that don't make it into AC are not lost — they live in QA test cases (out of scope here).
- Orchestration: for parallel research tasks (e.g., competitive analysis on a feature, prior-art review, persona impact study), dispatch via the briefing template at `.claude/skills/agentic-dev-core/references/briefing-template.md`.
