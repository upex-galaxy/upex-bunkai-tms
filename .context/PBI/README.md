# `.context/PBI/` — Product Backlog Items

Per-epic and per-story workspace shared by `/product-management` (backlog + AC refinement) and `/sprint-development` (story-level dev loop).

> **This tree is a GITIGNORED CACHE of Jira, owned by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1). **Jira is the source of truth; every `[SYNC]` `.md` here is a read-only cache.** NEVER hand-write a Jira-mirrored file — author the content, push it to the Jira field (or fallback comment), run the sync, then read the materialized file back. Rebuild the whole tree with `bun run context:hydrate`. Authoritative tier rules also live in `AGENTS.md` §9.

## Why the cache is not committed

Synced content regenerates. Two sessions that re-sync at different times produce conflicting commits of the same generated text, and a 3-way merge over a full-file rewrite is meaningless. Jira already is the versioned, shared, cloud-hosted copy — committing it duplicates the database into git and buys nothing.

## The three tiers

Every path under `.context/PBI/` is exactly **one** of these. Check the tier before creating any file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | **Yes** | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered — disposable by design |

`[LOCAL]` files may be hand-written, but **nothing downstream may depend on one existing**: a `[LOCAL]` file lives only on the machine that made it. A skill that needs the content on another machine — or in a later session — must put it somewhere durable instead:

- **Durable session state** → `.session/sprint-development/<JIRA-KEY>/progress.md`. That is what `/sprint-development`'s Phase 0 resume contract reads (per `.agents/skills/agentic-dev-core/references/session-management.md`) — never the PBI copy.
- **Durable evidence** → Jira (attach it to the issue, or a structured comment).

Rule of thumb: if a PM could read it and have an opinion, it goes to Jira. If it drives a resume or a cross-session workflow, it goes to `.session/`. If neither, it is `[LOCAL]` and losing it must cost nothing.

## Layout (canonical, Epic-centric)

```
.context/PBI/
  README.md                                      [COMMIT] this file — tier rules + gitignore ladder
  templates/                                     [COMMIT] skeletons
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                       [SYNC]
    feature-implementation-plan.md                [SYNC ← Jira `feature_implementation_plan` / stub]
    feature-test-plan.md                          [SYNC ← Jira field / stub]
    stories/STORY-<KEY>-<slug>/
      story.md                                    [SYNC]
      acceptance-criteria.md  scope.md  out-of-scope.md  business-rules.md  workflow.md   [SYNC ← Jira fields / stub]
      implementation-plan.md                      [SYNC ← Jira `spec_implementation_plan` / stub]
      comments.md                                 [SYNC, --include-comments]
      context.md  progress.md  evidence/          [LOCAL] machine-local, disposable
  bugs/ defects/ improvements/ tests/             [SYNC — standalone issue types]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC — Xray container issues (jira-xray)]
```

Folder naming follows Jira IDs verbatim — `<KEY>` is the Jira issue key (e.g. `UPEX-277`), `<slug>` is `kebab-case` from the summary. Epic and Story folders are prefixed `EPIC-` / `STORY-`. Every Story lives under its Epic's `stories/` (Module = Epic, 1:1).

## What the `.gitignore` actually does

The whole tree is excluded, then the two committed exceptions are negated back in:

```gitignore
.context/PBI/*
!.context/PBI/README.md
!.context/PBI/templates/
```

Git cannot re-include a file whose parent directory is excluded, so collapsing this ladder to a plain `.context/PBI/` silently drops the committed exceptions from version control. If you touch it, verify with `git check-ignore -v <path>` on this README (must NOT be ignored) and on a `stories/.../story.md` (must be ignored).

## `[SYNC]` vs the rest

- **`[SYNC]` files = forbidden to hand-write.** They are overwritten on every sync — **NO file is hard-protected.** A file that mirrors a Jira field → read the synced copy, never author it locally.
- **Anything else you want to write here** → decide its tier first. Does another machine or a later session need it? Then it does not belong in this tree — push it to Jira, or write it under `.session/`. Only this machine, this work? `[LOCAL]` — write it, and accept it is disposable.

## Jira-first generation contract

Every `[SYNC]` file's content originates in Jira. The flow is always **author → push to Jira field (or fallback comment) → `jira:sync-issues` → read**:

1. `/product-management` creates Epics/Stories **in Jira** (and refines ACs, scope, edge cases into the Story's custom fields). It does NOT hand-write `epic.md` / `story.md` / `epic-tree.md` — `bun run jira:sync-issues pull` materializes them.
2. `/sprint-development` authors the story implementation plan, pushes it to the Story's `{{jira.spec_implementation_plan}}` field (feature plan → the Epic's `{{jira.feature_implementation_plan}}`), runs the sync, then reads back `implementation-plan.md` / `feature-implementation-plan.md`.
3. If a custom field is absent on the instance, the skill writes the content as a structured Jira comment (`## <label>`, per `.agents/jira-required.yaml` → `fallback:`); the sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

Full topic-key conventions for engram persistence: `.agents/skills/agentic-dev-core/references/topic-key-conventions.md`.

## Detailed reads go through the sync

Custom-field content (ACs, plans, comments) is **only** read via the sync — `acli view` returns null for `customfield_*`:

- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped.
- Traceability link-graph + Xray run status stay on `acli` / `xray-cli` — the script only mirrors field content.

## Cold clone

A fresh clone has an almost-empty `.context/PBI/` — this README and `templates/`. **That is the intended state, not a broken checkout.**

```bash
bun run context:hydrate     # jira:sync-issues pull --include-comments
```

Requires `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env` (see `.env.example`); the Atlassian host comes from `.agents/project.yaml` → `issue_tracker.atlassian_url` (`ATLASSIAN_URL` is a last-resort fallback only). Validate the whole setup with `bun run jira:check`. Someone without Jira access cannot hydrate and will keep an empty cache: they can still work on framework code and committed docs, but not per-ticket work. That is a Jira permissions question, not a repo one.

## Jira-first naming

Issues are created in Jira before the local folder, so folder names always use real Jira IDs. No invented identifiers, no post-hoc renames.

| Component        | Rule                                                          |
| ---------------- | ------------------------------------------------------------ |
| Project key      | Uppercase (e.g. `UPEX`, `MYM`)                               |
| Number           | No leading zeros (`UPEX-13`, not `UPEX-013`)                 |
| Descriptive part | kebab-case, 2-4 words (e.g. `mentor-discovery-search`)       |

## Cross-session resumability

DEV uses **Jira** (canonical content, via the sync) + **engram** (session memory) as cross-session state. `/sprint-development` rehydrates from `.session/sprint-development/<JIRA-KEY>/progress.md` (Phase 0 resume check, per `.agents/skills/agentic-dev-core/references/session-management.md`) plus the synced story folder and engram — see `AGENTS.md` §9. Nothing in the resume path reads a `[LOCAL]` file.
