# Session Management: Long-Skill Resume Contract

> Cited by: every long or medium official workflow skill in this repo. Loaded on demand at the start of every retrofitted skill (Phase 0 resume check) and at the end (Phase N archive).
> Sibling references: `./orchestration-doctrine.md` (mandatory subagent dispatch), `./briefing-template.md` (7-component briefing format), `./dispatch-patterns.md` (Single / Sequential / Parallel / Background), `./topic-key-conventions.md` (file-first artifact tagging, Engram mirror).

## 1. Purpose & scope

Long official workflow skills (project-foundation, project-bootstrap, sprint-development, product-management, design-system, testability-guide) regularly run from 30 minutes to several hours. A terminal close, a network drop, an MCP failure or a user pause in the middle of one would cost the whole run unless its state is on disk: the AI would restart phases, ask the user again, or rebuild state from whichever artifacts happen to exist.

This document is the single source of truth for the session contract every retrofitted skill follows:

1. **Plan first.** Before any phase runs, the skill writes its execution plan to disk.
2. **Document per milestone.** Each finished phase or sub-phase appends a progress entry to one file.
3. **Resume cleanly.** Every invocation starts with Phase 0, which reads the progress file and offers resume, restart or abort when earlier state exists.
4. **Archive on completion.** When the skill finishes successfully, the orchestrator moves the working directory to a dated archive so the next run starts fresh.

The contract wraps the orchestration doctrine and does not replace it. Subagent dispatch stays mandatory per `./orchestration-doctrine.md`; this layer makes the dispatches survive an interruption.

## 2. Relationship to existing doctrine

| Concern | Source of truth | What this doc adds |
|---|---|---|
| Subagent dispatch (when, why, anti-patterns) | `./orchestration-doctrine.md` | Per-phase progress checkpoints around each dispatch |
| Briefing format (7 components per dispatch) | `./briefing-template.md` | An 8th implied component, "Session artifact path": the orchestrator passes the absolute path to `plan.md` / `progress.md` so the subagent can read prior state |
| Pattern selection (Single / Sequential / Parallel / Background) | `./dispatch-patterns.md` | Each phase's pattern is recorded in `plan.md` §"Phase breakdown", so a resume keeps the pattern originally chosen |
| Artifact persistence (file-first + Engram mirror) | `./topic-key-conventions.md` | A top-level topic prefix `session/...` (see §11) beside the existing `pbi/...` |

For its own concern, the sibling doc wins. This file owns the lifecycle (Phase 0 resume, Phase 1 plan, per-phase progress, archive) and the file schemas (`plan.md`, `progress.md`).

## 3. Storage layout

Every retrofitted skill writes its session state under one tree at `<<PRIMARY_ROOT>>`, the primary checkout (`.agents/README.md` §"Checkout roots"). In the primary it is the repo root. In a linked worktree it is not the worktree's root, because everything git ignores inside a worktree is deleted with it. Every `.session/...` path in this document, and in every skill that cites it, resolves under `<<PRIMARY_ROOT>>` and goes to a subagent as an absolute path. Before a worktree is removed, `bun run worktree:audit --rescue` copies any `.session/` file written there by mistake back to the primary.

```
.session/
├── <skill-slug>/
│   └── <scope>/                          # may be omitted for project-scope skills
│       ├── plan.md
│       └── progress.md
└── .archive/
    └── <YYYY-MM-DD>-<skill-slug>-<scope>/
        ├── plan.md
        └── progress.md
```

- `<skill-slug>` matches the skill's directory name under `.agents/skills/`.
- `<scope>` is invocation-specific (§9 gives the naming convention per skill). Project-scope skills omit it, and their files live at `.session/<skill-slug>/{plan.md, progress.md}`.
- `.session/` is gitignored in both repos. Its contents are work-in-progress scaffolding, not committed deliverables. Audit history lives in Engram observations under the `session/...` topic prefix and in the domain artifacts each skill already persists: Jira fields materialized as `[SYNC]` files under `.context/PBI/` (a gitignored cache, recovered by re-sync per `.agents/instructions/agent-local-context-pbi.md` §9) and the committed docs elsewhere under `.context/`.
- `.session/.archive/` is gitignored too. It serves local resume-replay and inspection in the same session; long-term audit is Engram's job.
- A skill writes nowhere else under `.session/`. Sibling directories are reserved for future use.

## 4. Phase 0: Resume contract (mandatory)

Every retrofitted skill runs Phase 0 first, before any subagent dispatch and before any user prompt beyond the initial trigger. The decision tree:

1. Resolve `<scope>` for this invocation (§9 has each skill's rule).
2. Check whether `<<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/progress.md` exists. When the session runs in a linked worktree (`<<REPO_ROOT>>` differs from `<<PRIMARY_ROOT>>`), say so in one line and look in the primary: a check against the worktree's own `.session/` finds nothing and silently restarts work that was already done.
3. If it does not exist, go to Phase 1 and write a new `plan.md`.
4. If it exists:
   1. Read `.session/<skill-slug>/<scope>/plan.md` in full.
   2. Read the tail of `.session/<skill-slug>/<scope>/progress.md` (the last 3 phase entries or so).
   3. Show the user a compact summary: the plan's Goal (one sentence), the last completed phase with its timestamp, the next planned phase, and any blocking notes from the last entry.
   4. Offer three options and wait for the user's answer:
      - **resume**: skip Phase 1, jump to the next planned phase, reuse the existing plan.
      - **restart**: archive the current `.session/<skill-slug>/<scope>/` to `.session/.archive/<YYYY-MM-DD>-<skill-slug>-<scope>-aborted/` (note the `-aborted` suffix), then go to Phase 1 fresh.
      - **abort**: leave the directory untouched and stop the skill.

Phase 0 runs inline, with no subagent: it is one short orchestrator decision, and a dispatch would be pure overhead. It runs on a first invocation too, to confirm the directory does not exist, so that telling resume from fresh never depends on the orchestrator's memory.

### Without a person present

Who answers the resume / restart / abort question depends on who runs the skill (the general rule is `./decision-protocol.md`):

- A person at the keyboard answers it, as above.
- A supervised worker asks its conductor or launcher through the channel it already reports on. A brief that names the choice is the answer.
- An unattended routine takes the delegating brief's answer when the brief covers it. With no brief it resumes, because resuming is the reversible choice. It does not restart or abort on its own, and its report says it found earlier state.

### Skills that opt out

A few short skills skip Phase 0 because they have no meaningful interruption point:

- Command-driven CLI cookbooks: `acli`
- Atomic operators: `git-flow-master`
- Informational walkthroughs: `agentic-dev-onboard`
- Inline TDD slices: `unit-testing`
- Meta or reference-only: `agentic-dev-core`

An opting-out skill has to state that in its SKILL.md, so a reader does not expect a `.session/` directory.

## 5. Phase 1: Plan-first contract

Once Phase 0 confirms there is no prior session (or after restart was chosen), Phase 1 writes `plan.md`. Every later phase reads the plan on resume, so it is written before any execution-phase subagent is dispatched.

| Approach | When |
|---|---|
| **Inline** | The skill is short enough for the orchestrator to draft the plan from the user's trigger and the context docs (typical for skills with 3 phases or fewer) |
| **Single subagent** | The plan needs many context files or external systems read first (typical for project-foundation, project-bootstrap) |

The choice is recorded in the skill's SKILL.md "Subagent Dispatch Strategy" table and is not redecided per invocation.

### Special cases

Some skills already have a canonical plan outside `.session/`, such as `sprint-development`'s story implementation plan. Its canonical copy lives in Jira (the `spec_implementation_plan` field). The local file at `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md` is a `[SYNC]` cache that `bun run jira:sync-issues` materializes, gitignored and rebuilt on every sync. History and recovery go through Jira and a re-sync, not git. For those skills:

- The Jira-held artifact stays canonical, and the synced file is how it is read.
- `.session/<skill-slug>/<scope>/plan.md` may be omitted. The skill writes `progress.md` plus only the working artifacts its own SKILL.md names (§13).
- `progress.md` §"Cross-references" cites the canonical plan by path.

§13 lists the skills that adopt this progress-only variant.

## 6. `plan.md` schema

Every `plan.md` has the same shape, so any subagent (including a different agent on resume) reads it the same way.

### Frontmatter

```yaml
---
topic_key: session/<skill-slug>/<scope>/plan
skill: <skill-slug>
scope: <scope or "project">
created_at: <ISO-8601 UTC>
created_by: <model-id>
status: draft | approved | superseded
capture_prompt: true
---
```

- `topic_key` follows §11 and `./topic-key-conventions.md`.
- `scope` is the literal `<scope>` value, or the string `project` for project-scope skills.
- `status` starts as `draft`, becomes `approved` when the user accepts the plan, and becomes `superseded` if the orchestrator rewrites the plan mid-session (rare; an append-only changelog at the bottom is preferred). Without a person present, the approval comes from the conductor, launcher or delegating brief that covers the plan; a plan nobody approved stays `draft`, and the run does only reversible work.
- `capture_prompt: true` for the initial plan write, because the user's intent matters and Engram should keep it.

### Body: fixed H2 order

Subagents read the plan by H2 header, so the order and exact spelling are required:

1. `## Goal`: one sentence on the outcome the skill must produce.
2. `## Inputs`: files, URLs, Jira refs and env vars the plan was built from.
3. `## Approach`: why this approach was chosen, naming the composable skills loaded (for example `/playwright-cli`, `/acli`).
4. `## Phase breakdown`: a table with columns `Phase | Pattern | Dispatch payload pointer | Exit condition`.
5. `## Risks & open questions`: bullets, each naming the risk and the mitigation.
6. `## Verification checklist`: bullets of observable signals that mean "done" before Archive.
7. `## Cross-references`: sibling artifacts this session reads or writes (for example `.context/PBI/epics/EPIC-UPEX-100-checkout/stories/STORY-UPEX-123-cart/implementation-plan.md`, `DESIGN.md`).

A plan with all seven headers (even if a section is empty) is valid. Missing a header fails the lint check.

### Changelog (optional, append-only)

When the plan needs a revision mid-session (the user adds a risk, scope shifts after Phase 2 finds a blocker), append a `## Changelog` H2 at the bottom with a timestamped bullet per revision. Leave the earlier body sections as written: resume assumes the plan reflects the agreement at session start.

## 7. `progress.md` schema

`progress.md` is append-only. Resume reads "what is the last completed phase?" from it, and a rewrite destroys that signal.

### Frontmatter

```yaml
---
topic_key: session/<skill-slug>/<scope>/progress
skill: <skill-slug>
scope: <scope or "project">
---
```

### Body: one block per phase entry

Each phase writes one H2 block when it starts and another when it ends (status transitions are separate entries). The orchestrator appends; subagents never write to `progress.md` directly.

```
## Phase <N> — <name> — <ISO-8601 UTC>
- status: started | completed | failed | skipped
- dispatched_as: Single | Sequential | Parallel | Background | inline
- subagent_report: <inline summary OR engram observation ID>
- artifacts_touched: [path, path, ...]
- next: <Phase N+1 name | stop>
- notes: <freeform one-liner — blockers, decisions, links>
```

- `status`: `started` at dispatch, then a second entry with `completed`, `failed` or `skipped` after the subagent returns.
- `dispatched_as`: the pattern used. Resume keeps it even if the context changed.
- `subagent_report`: a summary under 200 characters, or a reference to the full report (an Engram observation ID, a report file path). Long reports stay out of `progress.md`.
- `artifacts_touched`: absolute paths of files the phase created or modified, for Archive and audits.
- `next`: the next planned phase, or `stop` for the final phase.
- `notes`: one optional line a later resume will want ("rate-limited by Jira, retried after 90s", "user chose Path B over Path C").

### Why append-only

If a phase fails and the user retries, the retry writes new entries and leaves the failure in place. The resulting `progress.md` is a full execution audit: started, failed, restarted, completed. Resume needs that history to behave correctly across several invocations.

## 8. Archive policy

When the skill's final phase writes a `completed` entry and the orchestrator confirms the Verification checklist (§6, `plan.md` item 6) passes, the orchestrator runs Archive inline as the closing action of that phase:

1. Compute `<archive-name>` as `<YYYY-MM-DD>-<skill-slug>-<scope>` (the literal `project` when there is no scope).
2. Move the whole directory: `mv .session/<skill-slug>/<scope>/ .session/.archive/<archive-name>/`.
3. Call Engram's `mem_session_summary` with the session summary template (§11), including the archive path so a later search finds it.
4. Report the archive path to the user in the closing summary.
5. Rank check candidates first in the summary: each review finding that repeated in the session, with the `guard` lint rule or guard-manifest check that would have caught it (`references/guard-architecture.md` §7). A finding no machine can judge goes after them as a prose candidate.

### What not to archive

- **Failed sessions.** If the final phase is `failed`, the working directory stays in place because the user needs the artifacts to debug. The user, or a later resume, decides when to discard it.
- **User-cancelled sessions.** If the user picked `abort` at Phase 0, nothing moves.

The archive keeps `plan.md` and `progress.md` as a directory, not a concatenated file, so a specific completed phase can be rewound and re-run later.

## 9. Scope-naming convention

The shape of `<scope>` is decided per skill, not per invocation. Each retrofitted skill records its scope rule in its SKILL.md "Subagent Dispatch Strategy" section. The cross-skill conventions:

| Skill | Scope shape | Identifier source |
|---|---|---|
| `sprint-development` | `<JIRA-KEY>` (e.g. `UPEX-123`) | Jira ticket from invocation trigger |
| `project-foundation` | (none, project scope) | n/a |
| `project-bootstrap` | (none, project scope) | n/a |
| `design-system` | (none, project scope) | n/a |
| `testability-guide` | (none, project scope) | n/a |
| `product-management` | `seed` (workflow A); `<epic-slug>` (workflows B/C); workflows D/E/F/G opt out | Workflow selection |

A skill validates that its `<scope>` matches its declared shape before it writes the directory. A mismatch is a lint failure.

## 10. Orchestration enforcement banner

Every retrofitted SKILL.md includes this banner at the top of its "Subagent Dispatch Strategy" section (or a new "Session & Dispatch" section if none exists). `scripts/lint-skills.ts` checks it verbatim, so copy it and do not retype it:

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

The lint checks the prefix up to `archive on completion).`. The tail names the skill's own phase numbers. A skill whose walkthrough already owns a step numbered 1 (for example `project-bootstrap`, whose Phase 1 is the backend) calls its plan phase **Phase 0.5** and writes `Phase 0.5 (plan write)` in the tail, so one number never means two things.

The banner puts both doctrines side by side so a skill author cannot adopt one without the other. Orchestration says how to dispatch; session says how to persist around the dispatch.

A skill that adopts the progress-only variant (§13) replaces the banner's last sentence with:

> Phase 0 (resume check) is NOT optional. Phase 1 plan is delegated to the canonical artifact at `<path>`; this skill writes only `progress.md`.

## 11. Composition with Engram

The session pattern is file-first: resume works when Engram is unavailable. Engram is a best-effort cross-session search index on top of the files.

### Per-phase checkpoint

After each phase writes a `completed` entry to `progress.md`, the orchestrator calls `mem_save` once:

```
topic_key: session/<skill-slug>/<scope>/phase-<N>
type: discovery | architecture | bugfix | pattern   (per phase content)
scope: project
capture_prompt: false
content:
  What: <one line — what the phase did>
  Why: <one line — why this phase exists in the plan>
  Where: <list of artifacts_touched from progress.md>
  Learned: <gotchas, if any>
```

`capture_prompt` is `false` because an automatic checkpoint is not a human decision; the user's intent was captured when the plan was approved in Phase 1.

### Session summary at archive

When Archive runs (§8 step 3), the orchestrator calls `mem_session_summary` with the standard template. The summary includes the archive path so `mem_search "session <skill-slug> <scope>"` can navigate back to the full artifacts.

### When Engram is unavailable

A `mem_save` or `mem_session_summary` failure is logged inline and the run continues: the phase still completes, the user sees a warning in the closing summary, and the files are always enough to resume.

### Engram surface used

`mem_save` for per-phase checkpoints, `mem_session_summary` at archive, and `mem_search` plus `mem_get_observation` when a resume starts from another session.

### Topic-key prefix

`session/...` joins `pbi/...` as a top-level prefix. `./topic-key-conventions.md` §Convention lists the registered prefixes.

## 12. Composition with `briefing-template.md`

For any dispatch that runs inside a session, the 7-component briefing in `./briefing-template.md` gets an implied 8th component: the absolute path of the session directory, so the subagent can read prior state if it needs to.

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts
  - .session/<skill-slug>/<scope>/plan.md           ← session artifact path
  - .session/<skill-slug>/<scope>/progress.md       ← session artifact path

... (remaining 5 components per briefing-template.md)
```

The subagent treats `plan.md` and `progress.md` as read-only context. Only the orchestrator writes to them.

## 13. Migration & exceptions

### Skills retrofitted with the full pattern (plan.md + progress.md)

`project-foundation`, `project-bootstrap`, `product-management` (workflows A/B/C only), `design-system`, `testability-guide`.

### Skills adopting the progress-only variant (no plan.md)

- `project-adoption`: the canonical plan is the committed `.context/reports/project-adoption-plan.md`, which the team reviews in the same PR as the adoption writes (recovery is git). The skill writes only `progress.md` under `.session/project-adoption/`.
- `sprint-development`: the canonical plan lives in the Jira `spec_implementation_plan` field, read locally through its `[SYNC]` cache at `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md` (gitignored; recovery is a re-sync). No `plan.md` is written under `.session/`. Besides `progress.md`, the session folder holds only Stage 2-3 working artifacts (`notes.md`, `bug-fix.md`, `review.md`, `compliance-matrix.md`, `evidence/`), whose durable copies live on the PR or in Jira.

### Skills explicitly excluded

See §4 "Skills that opt out".

### Workflow-level carve-outs

`product-management` retrofits only workflows A (initial backlog seed), B (incremental feature) and C (epic creation). Workflows D (story refinement), E (AC quality), F (edge-case enumeration) and G (sprint reporting) are short, single-actor tasks that nobody interrupts, so session ceremony would add overhead and no resume. The skill's Phase 0 states this carve-out so users do not expect a `.session/` directory for those workflows.

## 14. Lint checks

`scripts/lint-skills.ts` enforces three checks on top of the skill-registry lints:

1. **Banner present** (ERROR): every retrofitted SKILL.md (§13) contains the §10 banner verbatim.
2. **Phase 0 present** (ERROR): every retrofitted SKILL.md has a `## Phase 0` section (or `## Phase -1` where a different gate already holds phase 0) that mentions the `.session/` path read.
3. **Scope shape valid** (WARN): a session directory under `.session/<skill-slug>/` has a name matching the regex registered for that skill in §9.
