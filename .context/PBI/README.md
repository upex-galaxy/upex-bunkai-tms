# `.context/PBI/` — Product Backlog Items

Per-epic and per-ticket workspace shared by `/product-management` (backlog + AC refinement) and `/sprint-development` (story-level dev loop).

## Layout

```
PBI/
├── epic-tree.md                              High-level view of all epics       (/product-management initial seed)
├── ALIGNMENT-REPORT.md                       Optional PRD → Jira mapping
├── {epic-slug}/
│   ├── epic.md                               Epic scope + child stories         (/product-management)
│   └── feature-impl-plan.md                  Feature-level implementation plan  (/sprint-development macro)
└── {ticket}/
    ├── spec.md                               Refined AC (Gherkin) + open questions     (/product-management)
    ├── edge-cases.md                         Cataloged edge cases + criticality          (/product-management)
    ├── impl-plan.md                          Story implementation plan                   (/sprint-development Stage 1)
    ├── review.md                             Code-review findings against AC + standards (/sprint-development Stage 3)
    ├── compliance-matrix.md                  AC-vs-code coverage matrix                  (/sprint-development Stage 3)
    └── bug-fix.md                            Root-cause + fix plan + regression notes    (/sprint-development Stage 2 bug-fix)
```

Folder naming follows Jira IDs verbatim — `{ticket}` is the Jira issue key (e.g. `UPEX-277`). `{epic-slug}` is `EPIC-{PROJ}-{NUM}-{kebab-name}` (e.g. `EPIC-UPEX-13-mentor-discovery`).

## Generation contract

Every file in this tree has an owner skill. The expected flow:

1. `/product-management` (initial backlog seed): writes `epic-tree.md` + per-epic `epic.md` files + initial `spec.md` for foundational stories. Creates Jira tickets in parallel — folder names use the returned Jira IDs.
2. `/product-management` (add feature, refine AC, enumerate edge cases): updates `{ticket}/spec.md` and `{ticket}/edge-cases.md` as backlog evolves.
3. `/sprint-development` (per ticket): writes `{ticket}/impl-plan.md` in Stage 1, then `{ticket}/review.md` + `{ticket}/compliance-matrix.md` in Stage 3. Bug-fix branch produces `{ticket}/bug-fix.md`.

Full topic-key conventions for engram persistence: `.claude/skills/agentic-dev-core/references/topic-key-conventions.md`.

## Jira-first naming

This repo follows a Jira-first flow — issues are created in Jira before the local folder, so folder names always use real Jira IDs. No invented identifiers, no post-hoc renames.

| Component       | Rule                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| Project key     | Uppercase (e.g. `UPEX`, `MYM`)                                         |
| Number          | No leading zeros (`UPEX-13`, not `UPEX-013`)                           |
| Descriptive part| kebab-case, 2-4 words (e.g. `mentor-discovery-search`)                 |

## Cross-session resumability

DEV uses **engram** + **Jira** as canonical sources of cross-session state. `/sprint-development` rehydrates from both automatically — no in-tree `PROGRESS.md` or `ROADMAP.md` files needed.
