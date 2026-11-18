---
id: local-context-pbi
title: "Local context (PBI cache)"
load_when: "reading or writing anything under .context/PBI/, syncing Jira issues, resuming a story session, or deciding where story state or evidence lives"
triggers: ["\\bPBI\\b", "\\.context/PBI", "jira:sync", "context:hydrate", "\\bjira\\b", "\\bepic\\b", "acceptance criteria", "implementation plan", "\\bresume\\b"]
paths: [".context/PBI/"]
---

# Local context (PBI cache)

> Section `local-context-pbi` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 9. LOCAL CONTEXT (PBI)

`.context/PBI/` is a gitignored cache of Jira, owned by `scripts/sync-jira-issues.ts`. Jira is the source of truth, and a module is an Epic (1:1) for the epics this pipeline creates (an adopted tracker keeps the epic shape it already has). Local `.md` files are a read-only copy. A hand-written Jira-mirrored file is overwritten on the next sync, so author the plan or content, push it to the Jira field (or the fallback below), then run the sync.

`bun run context:hydrate` rebuilds the whole tree. On a large or adopted project, pull only what the work touches (`pull --epic <KEY>`, `--story <KEY>`, `jql`, below). The adoption itself never hydrates (`/project-adoption`).

The cache is not committed because it regenerates. Two sessions re-syncing at different times would produce conflicting commits of the same generated text, and a 3-way merge over a full-file rewrite means nothing. Jira is already the versioned, shared, cloud-hosted copy, so committing the cache would duplicate the database into git.

**Three tiers.** Every path under `.context/PBI/` is exactly one of these, so check before creating a file:

| Tier | Source of truth | In git? | Recovered by |
|---|---|---|---|
| `[SYNC]` | Jira | No | `bun run context:hydrate` |
| `[COMMIT]` | This repo | **Yes** | `git checkout` |
| `[LOCAL]` | Nothing durable | No | Not recovered, disposable by design |

A `[LOCAL]` file (`context.md`, `progress.md`, `evidence/`) may be hand-written, but nothing downstream may depend on it existing, because it lives only on the machine that made it. Durable session state goes in `.session/sprint-development/<KEY>/progress.md` (the resume contract reads that one, not the PBI copy), and durable evidence goes in Jira as an attachment or comment.

**Gitignore ladder.** `.gitignore` holds `.context/PBI/*`, then `!.context/PBI/README.md`, then `!.context/PBI/templates/`. Keep all three lines: git cannot re-include a file whose parent directory is excluded, so collapsing the ladder to a plain `.context/PBI/` silently drops the committed exceptions. After any change, run `git check-ignore -v` on `README.md` (it must not be ignored) and on a `stories/.../story.md` (it must be ignored). <!-- binds-in-section: only edits of the PBI ladder in `.gitignore`, which route here -->

**Canonical tree** (Epic-centric; `<KEY>` is the Jira key, `<slug>` comes from the summary):

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

**What to author and what to read.** No `[SYNC]` file is protected: each is overwritten on every sync. The dev or feature implementation plan is written, pushed to its Jira field (`spec_implementation_plan` or `feature_implementation_plan`), then read back from the synced `implementation-plan.md` or `feature-implementation-plan.md`. The rule of thumb: a file that mirrors a Jira field is read from the synced copy and never authored locally. A file that holds information Jira does not have needs a tier. If another machine or a later session needs it, it does not belong here (use a Jira field or comment, or `.session/`). If only this machine needs it for this work, it is `[LOCAL]`.

**Cold clone.** A fresh clone has an almost empty `.context/PBI/` (the README and `templates/`). That is the intended state, not a broken checkout. `bun run context:hydrate` (the same as `jira:sync-issues pull --include-comments`) rebuilds the cache. It needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env`, and the host comes from `.agents/project.yaml` → `issue_tracker.atlassian_url` (`agent-project-variables.md` §7).

> The sprint-level cross-ticket aggregate is `.context/reports/SPRINT-{N}-DEVELOPMENT.md`, generated by the `/sprint-development` batch. Its lifecycle is in `.context/reports/README.md`.
>
> The business maps are not part of this tree or of `.context/`. They are synthesis, held as HTML in the business map context skills and read with `bun run context:map <skill>` (`agentic-dev-core/references/business-context-maps.md`). A story reads the sections its aspect touches, and nothing under `.context/PBI/` copies them.

**Detailed reads through the script.** `acli view` returns null for custom fields, so the script replaces it:

- `bun run jira:sync-issues get <KEY> --include-comments` fetches one issue with all its custom fields and comments; read the generated `.md`.
- `bun run jira:sync-issues jql "<query>"` fetches a batch, and `pull --epic <KEY>` or `--story <KEY>` scopes a pull.

**Fallback.** When a custom field a prompt must fill is absent from the instance, write the content as a structured Jira comment (`## <label>`) per `.agents/jira-required.yaml` → `fallback:`. The sync then emits a pointer stub for that field's `.md`. A missing field never blocks the work.

**Entry point.** `/sprint-development` syncs the ticket (`jira:sync-issues get`), explains the story, loads the synced PBI and drives plan, code, review and deploy.

**Resuming a session.** The `/sprint-development` Phase 0 resume contract reads `.session/sprint-development/<JIRA-KEY>/progress.md` (per `.agents/skills/agentic-dev-core/references/session-management.md`), reports the last completed phase and offers resume, restart or abort. The synced story folder and Engram supply the content context. With nobody at the keyboard, the "With nobody at the keyboard" section of `agent-ticket-work.md` says who answers that offer.
