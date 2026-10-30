# `.context/` — Project Memory the AI Reads

This directory is what makes a fresh AI session productive on day one. Every file here is either **auto-generated** by a script or skill, or **source-of-truth** that downstream tooling regenerates from.

## Structure

```
.context/
├── README.md                      This file — index + generator map
│
├── business/                      Authored business knowledge (Constitution + glossary)
│   ├── README.md                  Folder index
│   ├── business-model.md          Business Model Canvas, value prop (/project-foundation Phase 1)
│   ├── market-context.md          Industry, competitors, positioning (/project-foundation Phase 1)
│   ├── project-dev-guide.md       How to build features here         (/project-foundation Phase 4 embedded)
│   └── domain-glossary.md         Canonical domain terminology       (/project-foundation Phase 4 Step 6; hand-maintained, append-only)
│
├── master-implementation-plan.md  High-level dependency-cascaded roadmap — EPIC/strategy (/project-context master-plan)
├── dev-roadmap.md                 Ticket-level dependency execution roadmap — TICKET/sequence (/project-context dev-roadmap; subsumes PBI/sprint-sequence.md)
│
├── reports/                       Sprint-level cross-ticket dev trackers (/sprint-development batch)
│   └── README.md                  Lifecycle rules for SPRINT-{N}-DEVELOPMENT.md
│
├── PRD/                           Output of /project-foundation Phase 2 — Product Requirements
│   └── README.md                  Phase placeholder (see file)
│
├── SRS/                           Output of /project-foundation Phase 2 — Software Requirements
│   └── README.md                  Phase placeholder (see file)
│
├── ADR/                           Architecture Decision Records — important, hard-to-reverse decisions
│   ├── README.md                  When to write one + status lifecycle + index
│   └── ADR-NNNN-template.md       Copy → ADR-NNNN-<slug>.md per decision (append-only; superseded, never deleted)
│
└── PBI/                           Outputs of /product-management + /sprint-development (per epic / per ticket)
    └── README.md                  Backlog layout (see file)
```

The business maps (data, feature, API) are not under `.context/`: they are HTML maps inside the `business-data-context`, `business-feature-context` and `business-api-context` skills under `.agents/skills/`. Read one with `bun run context:map <slug>`.

## Who generates what

Every file in `.context/` has an owner. Do not edit auto-generated files by hand — re-run the owner.

| File / Pattern                                      | Owner                                   | Notes                                                  |
| --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `business/business-model.md`                        | `/project-foundation` (Phase 1)         | Business Model Canvas, value proposition               |
| `business/market-context.md`                        | `/project-foundation` (Phase 1)         | Industry, competitors, positioning                     |
| `business/project-dev-guide.md`                     | `/project-foundation` (Phase 4 Step 4)  | Embedded skill logic; re-run if architecture changes   |
| `business/domain-glossary.md`                       | `/project-foundation` (Phase 4 Step 6); updated when new terms surface (via `/product-management` flag) | Hand-maintained, append-only, never regenerated        |
| `master-implementation-plan.md`                     | `project-context` mode `master-plan`    | Invoked by `/project-foundation` Phase 4 Step 5. EPIC/strategy layer. |
| `dev-roadmap.md`                                    | `project-context` mode `dev-roadmap`    | TICKET/sequence layer. Surgical UPDATE (regenerates §4 Kahn sort, preserves hand-authored §2/§3/§5/§6). Subsumes `PBI/sprint-sequence.md`. Cascaded from `/project-context master-plan` + `/product-management`; bootstrapped by `/sprint-development` Phase 0. |
| `PRD/*.md`                                          | `/project-foundation` (Phase 2)         | Executive summary, personas, MVP scope, user journeys  |
| `SRS/*.md`                                          | `/project-foundation` (Phase 2)         | Functional / non-functional / architecture / API specs |
| `ADR/ADR-NNNN-<slug>.md`                            | Human architect, or `/project-foundation` (SRS) / `/sprint-development` (Stage 1) — AI drafts for human approval | **Exception: append-only, never regenerated.** Superseded by a newer ADR, never overwritten or hand-re-run. See `ADR/README.md`. |
| `reports/SPRINT-{N}-DEVELOPMENT.md`                 | `/sprint-development` (batch mode)      | Cross-ticket sprint tracker; lifecycle → `reports/README.md` |
| `PBI/epic-tree.md`, `PBI/epics/EPIC-<KEY>-<slug>/epic.md`               | **[SYNC]** — content authored in Jira by `/product-management` (epic creation), materialized by `bun run context:hydrate`   | Gitignored cache, not committed. Topic key: `pbi/{epic-slug}/epic`                      |
| `PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/story.md`, `acceptance-criteria.md`, `scope.md`, `out-of-scope.md`, `business-rules.md`, `workflow.md`            | **[SYNC]** — content authored in Jira by `/product-management` (AC refinement), materialized by `bun run context:hydrate`   | Gitignored cache, not committed. Topic key: `pbi/{ticket}/spec`                         |
| `PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md` | **[SYNC]** — pushed to Jira `spec_implementation_plan` field by `/sprint-development` Stage 1, materialized by `bun run context:hydrate`                  | Gitignored cache, not committed. Topic key: `pbi/{ticket}/impl-plan`                    |
| `PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/comments.md`         | **[SYNC]** — `bun run context:hydrate` (`--include-comments`)    | Gitignored cache, not committed.                       |
| `PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/context.md`, `progress.md`, `evidence/` | **[LOCAL]** — dev-authored, hand-written     | Machine-local, disposable; nothing downstream may depend on these existing. Durable session state lives under `.session/` instead; durable evidence goes to Jira. |
| `PBI/README.md`, `PBI/templates/`      | Hand-maintained     | **[COMMIT]** — the only paths under `PBI/` actually tracked in git                  |

The business maps live outside this table: `project-context` modes `data`, `features` and `api` (invoked by `/project-foundation` Phase 4 Steps 1, 2 and 3) write them inside `business-data-context`, `business-feature-context` and `business-api-context`.

Plan history for a story lives in the Jira field's own edit history (plus engram), not in git log — the files above are a regenerable read cache, never a commit target. Full tier rules: `.context/PBI/README.md` and `.agents/instructions/agent-local-context-pbi.md` §9. Full topic-key conventions: `.agents/skills/agentic-dev-core/references/topic-key-conventions.md`.

## Minimum viable context

A brand-new project that wants productive AI sessions should produce, in order:

1. Install the agentic layer — `bunx create-agentic-dev@latest <name>` scaffolds a new project with `.agents/`, scripts, and `AGENTS.md` at the repo root. (An existing app installs it with `bunx create-agentic-dev@latest --adopt`, then `/project-adoption`, whose hand-off writes the business maps and the Discovery-only foundation from its code in place of step 2: no PRD or SRS.)
2. `/project-foundation` — Constitution → PRD → SRS → Discovery outputs.
3. `/product-management` — Seed initial backlog (epics + foundational stories) under `PBI/`.

After that, `/sprint-development` operates per ticket and fills in `PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/*` files as work progresses.

An **existing app** (adopted with `create-agentic-dev --adopt`) has no product to define, and its context is read from its code instead:

1. `/project-adoption` — identity, `stack:` block, tracker catalogs; writes nothing under `.context/`.
2. `/project-context refresh-all` — the data, feature and API maps, then the master plan and the dev roadmap.
3. `/project-foundation` Discovery-only — `business/project-dev-guide.md` and `business/domain-glossary.md` from the code and the maps.

`PRD/`, `SRS/` and the Constitution files stay empty on that path: the maps, the dev guide and the glossary are the app's product docs, and `/sprint-development` accepts them in place of a PRD / SRS.

## References

- Repo architecture: `CONTEXT.md` (root) — canonical Context Engineering map
- Project memory: `AGENTS.md` (root) — kept in step by the change that moves a fact (`agentic-dev-core/references/docs-follow-through.md`)
- Skill cookbook: `.agents/skills/*/SKILL.md` (also indexed in `.agents/skills/REGISTRY.md`)
- Topic keys for engram: `.agents/skills/agentic-dev-core/references/topic-key-conventions.md`
