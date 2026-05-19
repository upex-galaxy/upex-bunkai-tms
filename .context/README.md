# `.context/` — Project Memory the AI Reads

This directory is what makes a fresh AI session productive on day one. Every file here is either **auto-generated** by a script or skill, or **source-of-truth** that downstream tooling regenerates from.

## Structure

```
.context/
├── README.md                      This file — index + generator map
│
├── _framework/                    Framework infrastructure (auto-generated)
│   └── skill-registry.md          Compact-rules cache for skills        (scripts/build-skill-registry.ts)
│
├── business/                      Single source of business knowledge (Constitution + Maps)
│   ├── README.md                  Folder index (Constitution + Maps layers)
│   ├── business-model.md          Business Model Canvas, value prop (/project-foundation Phase 1)
│   ├── market-context.md          Industry, competitors, positioning (/project-foundation Phase 1)
│   ├── legacy-analysis.md         Legacy stack + doc-gap analysis    (/project-foundation Phase 1, optional)
│   ├── business-data-map.md       Entities, flows, state machines    (/business-data-map)
│   ├── business-feature-map.md    Feature catalog, CRUD matrix       (/business-feature-map)
│   ├── business-api-map.md        Auth model, critical journeys      (/business-api-map)
│   └── project-dev-guide.md       How to build features here         (/project-foundation Phase 4 embedded)
│
├── master-implementation-plan.md  High-level dependency-cascaded roadmap (/master-implementation-plan)
│
├── PRD/                           Output of /project-foundation Phase 2 — Product Requirements
│   └── README.md                  Phase placeholder (see file)
│
├── SRS/                           Output of /project-foundation Phase 2 — Software Requirements
│   └── README.md                  Phase placeholder (see file)
│
└── PBI/                           Outputs of /product-management + /sprint-development (per epic / per ticket)
    └── README.md                  Backlog layout (see file)
```

## Who generates what

Every file in `.context/` has an owner. Do not edit auto-generated files by hand — re-run the owner.

| File / Pattern                                      | Owner                                   | Notes                                                  |
| --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `business/business-model.md`                        | `/project-foundation` (Phase 1)         | Business Model Canvas, value proposition               |
| `business/market-context.md`                        | `/project-foundation` (Phase 1)         | Industry, competitors, positioning                     |
| `business/legacy-analysis.md`                       | `/project-foundation` (Phase 1, optional) | Legacy stack + doc-gap analysis (legacy projects only) |
| `business/business-data-map.md`                     | `/business-data-map` command            | Invoked by `/project-foundation` Phase 4 Step 1        |
| `business/business-feature-map.md`                  | `/business-feature-map` command         | Invoked by `/project-foundation` Phase 4 Step 2        |
| `business/business-api-map.md`                      | `/business-api-map` command             | Invoked by `/project-foundation` Phase 4 Step 3        |
| `business/project-dev-guide.md`                     | `/project-foundation` (Phase 4 Step 4)  | Embedded skill logic; re-run if architecture changes   |
| `master-implementation-plan.md`                     | `/master-implementation-plan` command   | Invoked by `/project-foundation` Phase 4 Step 5        |
| `PRD/*.md`                                          | `/project-foundation` (Phase 2)         | Executive summary, personas, MVP scope, user journeys  |
| `SRS/*.md`                                          | `/project-foundation` (Phase 2)         | Functional / non-functional / architecture / API specs |
| `PBI/{epic-slug}/epic.md`                           | `/product-management` (epic creation)   | Topic key: `pbi/{epic-slug}/epic`                      |
| `PBI/{ticket}/spec.md`                              | `/product-management` (AC refinement)   | Topic key: `pbi/{ticket}/spec`                         |
| `PBI/{ticket}/impl-plan.md`                         | `/sprint-development` Stage 1                   | Topic key: `pbi/{ticket}/impl-plan`                    |
| `PBI/{ticket}/review.md`                            | `/sprint-development` Stage 3                   | Topic key: `pbi/{ticket}/review`                       |
| `PBI/{ticket}/compliance-matrix.md`                 | `/sprint-development` Stage 3                   | Topic key: `pbi/{ticket}/compliance-matrix`            |
| `PBI/{ticket}/bug-fix.md`                           | `/sprint-development` Stage 2 (bug-fix flow)    | Topic key: `pbi/{ticket}/bug-fix`                      |
| `PBI/{ticket}/edge-cases.md`                        | `/product-management` (enumeration)     | Topic key: `pbi/{ticket}/edge-cases`                   |

Full topic-key conventions: `.claude/skills/agentic-dev-core/references/topic-key-conventions.md`.

## Minimum viable context

A brand-new project that wants productive AI sessions should produce, in order:

1. Clone the full boilerplate — `.agents/`, scripts, and `CLAUDE.md` ship at the repo root. No bootstrap step.
2. `/project-foundation` — Constitution → PRD → SRS → Discovery outputs.
3. `/product-management` — Seed initial backlog (epics + foundational stories) under `PBI/`.

After that, `/sprint-development` operates per ticket and fills in `PBI/{ticket}/*` files as work progresses.

## References

- Repo architecture: `CONTEXT.md` (root) — canonical Context Engineering map
- Project memory: `CLAUDE.md` (root) — generated/synced via `/sync-ai-memory`
- Skill cookbook: `.claude/skills/*/SKILL.md` (also indexed in `.claude/skills/REGISTRY.md`)
- Topic keys for engram: `.claude/skills/agentic-dev-core/references/topic-key-conventions.md`
