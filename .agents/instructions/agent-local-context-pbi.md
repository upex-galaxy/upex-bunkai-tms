---
id: local-context-pbi
title: "Local context (PBI cache)"
load_when: "reading or writing anything under .context/PBI/, syncing Jira issues, resuming a story session, or deciding where story state or evidence lives"
triggers: ["\\bPBI\\b", "\\.context/PBI", "jira:sync", "context:hydrate", "\\bjira\\b", "\\bepic\\b", "[ée]pica", "acceptance criteria", "criterios de aceptaci", "implementation plan", "\\bresume\\b", "retoma"]
paths: [".context/PBI/"]
---

# Local context (PBI cache)

> Section `local-context-pbi` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 9. LOCAL CONTEXT (PBI)

> **`.context/PBI/` is a GITIGNORED CACHE of Jira, owned by `scripts/sync-jira-issues.ts`.** Module = Epic (1:1) for the epics this pipeline creates; an adopted tracker keeps the epic shape it already has. Jira is the source of truth; local `.md` files are a **read-only cache**. NEVER hand-write a Jira-mirrored file: author the plan/content, push it to the Jira field (or fallback), then run the sync. Rebuild the whole tree with `bun run context:hydrate`; on a large or adopted project pull only what the work touches (`pull --epic <KEY>`, `--story <KEY>`, `jql`, below), and the adoption itself never hydrates (`/project-adoption`).
>
> **WHY NOT COMMITTED**: synced content regenerates. Two sessions re-syncing at different times produce conflicting commits of the same generated text; a 3-way merge over a full-file rewrite is meaningless. Jira already IS the versioned, shared, cloud-hosted copy — committing the cache duplicates the database into git and buys nothing.

**THREE TIERS** — every path under `.context/PBI/` is exactly one of these. Check before creating any file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | **Yes** | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered — disposable by design |

`[LOCAL]` files (`context.md`, `progress.md`, `evidence/`) MAY be hand-written, but **NOTHING downstream may depend on one existing**: they live only on the machine that made them. Durable session state → `.session/sprint-development/<KEY>/progress.md` (the resume contract already reads it, NOT the PBI copy); durable evidence → Jira (attachment / comment).

**GITIGNORE LADDER** (in `.gitignore`): `.context/PBI/*` → `!.context/PBI/README.md` → `!.context/PBI/templates/`. NEVER collapse it to a plain `.context/PBI/` — git cannot re-include a file whose parent dir is excluded, so a collapse silently drops the committed exceptions. Verify any change with `git check-ignore -v` on `README.md` (must NOT be ignored) and on a `stories/.../story.md` (must be ignored). <!-- binds-in-section: only edits of the PBI ladder in `.gitignore`, which route here -->

**Canonical tree** (Epic-centric; `<KEY>` = Jira key, `<slug>` from summary):

```
.context/PBI/
  README.md                                      [COMMIT] tier rules + gitignore ladder
  templates/                                     [COMMIT] skeletons
  epic-tree.md                                   [SYNC] master index
  epics/EPIC-<KEY>-<slug>/
    epic.md                                       [SYNC]
    feature-implementation-plan.md                [SYNC ← Jira field / stub]
    feature-test-plan.md                          [SYNC ← Jira field / stub]
    stories/STORY-<KEY>-<slug>/
      story.md                                    [SYNC]
      acceptance-criteria.md  scope.md  out-of-scope.md  business-rules.md  workflow.md
      implementation-plan.md                      [SYNC ← Jira `spec_implementation_plan` / stub]
      comments.md                                 [SYNC, --include-comments]
      context.md  progress.md  evidence/          [LOCAL] machine-local, disposable
  bugs/ defects/ improvements/ tests/             [SYNC - standalone issue types]
  test-plans/ test-executions/ test-sets/ preconditions/   [SYNC - Xray container issues (jira-xray); description holds the ATP/ATR body]
```

**`[SYNC]` files = forbidden to hand-write** (overwritten on every sync: NO file is hard-protected; Jira is the source of truth). The dev/feature implementation plan is authored, **pushed to its Jira field** (`spec_implementation_plan` / `feature_implementation_plan`), then read back from the synced `implementation-plan.md` / `feature-implementation-plan.md`. **Rule of thumb**: file mirrors a Jira field → read the synced copy, never author it locally. File holds info NOT in Jira → decide its tier: another machine or a later session needs it → it does NOT belong here (Jira field/comment, or `.session/`); only this machine, this work → `[LOCAL]`.

**COLD CLONE**: a fresh clone has an almost-empty `.context/PBI/` (this README + `templates/`) — the intended state, not a broken checkout. `bun run context:hydrate` (= `jira:sync-issues pull --include-comments`) rebuilds the cache. Requires `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` in `.env`; host from `.agents/project.yaml` → `issue_tracker.atlassian_url` (`agent-project-variables.md` §7).

> Sprint-level cross-ticket aggregate → `.context/reports/SPRINT-{N}-DEVELOPMENT.md` (generated by `/sprint-development` batch). Lifecycle → `.context/reports/README.md`.
>
> The business maps are NOT part of this tree nor of `.context/`: they are synthesis, held as HTML in the business map context skills and read with `bun run context:map <skill>` (`agentic-dev-core/references/business-context-maps.md`). A story reads the sections its aspect touches; nothing under `.context/PBI/` copies them.

**DETAILED READS via the script** (replaces `acli view` for custom fields: `acli view` returns null for custom fields):
- `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` → batch. `pull --epic <KEY>` / `--story <KEY>` → scoped.

**FALLBACK**: if a custom field a prompt must fill is absent from the instance, write the content as a structured Jira comment (`## <label>`) per `.agents/jira-required.yaml` → `fallback:`. The sync then emits a pointer stub for that field's `.md`. Never block on a missing field.

**ENTRY POINT**: invoke `/sprint-development`: syncs the ticket (`jira:sync-issues get`), explains story, loads the synced PBI, drives plan → code → review → deploy.

**RESUME SESSION**: `/sprint-development` Phase 0 resume contract: reads `.session/sprint-development/<JIRA-KEY>/progress.md` (per `.agents/skills/agentic-dev-core/references/session-management.md`), surfaces last completed phase, offers resume / restart / abort; the synced story folder + engram supply the content context.
