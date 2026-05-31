# `.context/PBI/` — Product Backlog Items

Per-epic and per-story workspace shared by `/product-management` (backlog + AC refinement) and `/sprint-development` (story-level dev loop).

> **This tree is OWNED by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1). **Jira is the source of truth; every `[SYNC]` `.md` here is a read-only cache.** NEVER hand-write a Jira-mirrored file — author the content, push it to the Jira field (or fallback comment), run the sync, then read the materialized file back. Authoritative tree + ownership rules live in `CLAUDE.md` §9.

## Layout (canonical, Epic-centric)

```
.context/PBI/
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                       [SYNC]
    feature-implementation-plan.md                [SYNC ← Jira `feature_implementation_plan` / stub]
    feature-test-plan.md                          [SYNC ← Jira field / stub]
    module-context.md  ROADMAP.md  PROGRESS.md  SESSION-PROMPT.md   [dev — non-Jira, OK]
    stories/STORY-<KEY>-<slug>/
      story.md                                    [SYNC]
      acceptance-criteria.md  scope.md  out-of-scope.md  business-rules.md  workflow.md   [SYNC ← Jira fields / stub]
      implementation-plan.md                      [SYNC ← Jira `spec_implementation_plan` / stub]
      comments.md                                 [SYNC, --include-comments]
      context.md  progress.md  evidence/          [dev — non-Jira, OK]
  bugs/ defects/ improvements/ tests/             [SYNC — standalone issue types]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC — Xray container issues (jira-xray)]
```

Folder naming follows Jira IDs verbatim — `<KEY>` is the Jira issue key (e.g. `UPEX-277`), `<slug>` is `kebab-case` from the summary. Epic and Story folders are prefixed `EPIC-` / `STORY-`. Every Story lives under its Epic's `stories/` (Module = Epic, 1:1).

## `[SYNC]` vs dev-authored

- **`[SYNC]` files = forbidden to hand-write.** They are overwritten on every sync — **NO file is hard-protected.** A file that mirrors a Jira field → read the synced copy, never author it locally.
- **Dev-authored, non-Jira files** (`module-context.md`, `ROADMAP.md`, `PROGRESS.md`, `SESSION-PROMPT.md`, `context.md`, `progress.md`, `evidence/`) are authored locally as usual — they hold info that is NOT in Jira.

## Jira-first generation contract

Every `[SYNC]` file's content originates in Jira. The flow is always **author → push to Jira field (or fallback comment) → `jira:sync-issues` → read**:

1. `/product-management` creates Epics/Stories **in Jira** (and refines ACs, scope, edge cases into the Story's custom fields). It does NOT hand-write `epic.md` / `story.md` / `epic-tree.md` — `bun run jira:sync-issues pull` materializes them.
2. `/sprint-development` authors the story implementation plan, pushes it to the Story's `{{jira.spec_implementation_plan}}` field (feature plan → the Epic's `{{jira.feature_implementation_plan}}`), runs the sync, then reads back `implementation-plan.md` / `feature-implementation-plan.md`.
3. If a custom field is absent on the instance, the skill writes the content as a structured Jira comment (`## <label>`, per `.agents/jira-required.yaml` → `fallback:`); the sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

Full topic-key conventions for engram persistence: `.claude/skills/agentic-dev-core/references/topic-key-conventions.md`.

## Detailed reads go through the sync

Custom-field content (ACs, plans, comments) is **only** read via the sync — `acli view` returns null for `customfield_*`:

- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped.
- Traceability link-graph + Xray run status stay on `acli` / `xray-cli` — the script only mirrors field content.

## Jira-first naming

Issues are created in Jira before the local folder, so folder names always use real Jira IDs. No invented identifiers, no post-hoc renames.

| Component        | Rule                                                          |
| ---------------- | ------------------------------------------------------------ |
| Project key      | Uppercase (e.g. `UPEX`, `MYM`)                               |
| Number           | No leading zeros (`UPEX-13`, not `UPEX-013`)                 |
| Descriptive part | kebab-case, 2-4 words (e.g. `mentor-discovery-search`)       |

## Cross-session resumability

DEV uses **Jira** (canonical content, via the sync) + **engram** (session memory) as cross-session state. `/sprint-development` rehydrates from the synced PBI plus the Epic-level `ROADMAP.md` / `PROGRESS.md` / `SESSION-PROMPT.md` (dev-authored, non-Jira) — see `CLAUDE.md` §9.
