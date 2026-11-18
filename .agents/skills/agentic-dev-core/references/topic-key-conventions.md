# Topic-Key Conventions for PBI and Session Artifacts

> Cited by: `product-management`, `sprint-development`, and every retrofitted workflow skill that uses `./session-management.md` (through the `session/...` prefix). Loaded on demand whenever an artifact (spec, implementation plan, code review, compliance matrix, session plan, session progress) is created or retrieved, so persistence is deterministic and the optional Engram bridge can mirror without coupling.

## Purpose

Every artifact a workflow skill produces (spec, implementation-plan, review, test-report, compliance-matrix, bug-fix) needs a deterministic persistence key. A stable key gives three things:

1. **Idempotent writes (UPSERT).** Re-running a workflow on the same ticket overwrites the previous artifact and does not pile up duplicates.
2. **A predictable retrieval path.** Anyone, human or agent, can guess the key from the ticket number and the artifact name.
3. **A mirror to Engram without coupling.** The Engram MCP (`mem_save`, `mem_search`, `mem_get_observation`) can mirror the file under the same key. Without it, everything still works file-first.

This document is the single source of truth for the key format and the storage layout. Skills cite it (`See agentic-dev-core/references/topic-key-conventions.md`) and do not redefine the convention inline.

## Convention

Two top-level prefixes are registered:

```
pbi/{ticket}/{artifact}                         # ticket-scoped artifacts (specs, impl plans, reviews)
session/{skill-slug}/{scope}/{phase-or-name}    # skill-session state (per ./session-management.md)
```

### `pbi/...`: PBI artifacts

| Segment | Meaning | Example |
|---|---|---|
| `pbi` | Fixed prefix. Separates PBI artifacts from other domains. | always the literal `pbi` |
| `{ticket}` | Issue-tracker key, uppercase, hyphen-separated. | `UPEX-123`, `MYM-7` |
| `{artifact}` | Artifact name, kebab-case, open vocabulary. | `spec`, `implementation-plan`, `bug-fix-plan` |

### `session/...`: long-skill session state

| Segment | Meaning | Example |
|---|---|---|
| `session` | Fixed prefix. Separates session state from PBI artifacts. | always the literal `session` |
| `{skill-slug}` | Slug of the skill emitting the state. Matches the directory under `.agents/skills/`. | `project-bootstrap`, `sprint-development` |
| `{scope}` | Invocation scope per the skill's rule in `./session-management.md` §9. | `UPEX-123`, `project` |
| `{phase-or-name}` | `plan`, `progress`, or `phase-<N>` for per-phase checkpoints. | `plan`, `progress`, `phase-3` |

Session-state keys mirror the file layout under `.session/<skill-slug>/<scope>/{plan.md, progress.md}` and the per-phase `mem_save` checkpoints in `./session-management.md` §11. The file stays canonical; Engram is a best-effort mirror.

Examples:

- `pbi/UPEX-123/spec`: refined story spec
- `pbi/UPEX-123/implementation-plan`: implementation plan from `sprint-development` Stage 1
- `pbi/UPEX-123/review`: code-review notes from `sprint-development` Stage 3
- `pbi/UPEX-456/bug-fix`: bug fix plan and root-cause notes
- `pbi/UPEX-789/compliance-matrix`: Stage 3 AC-vs-code coverage matrix

## Common artifact types

The vocabulary is open: pick the name the workflow naturally uses. The table covers the names most skills emit. A new name follows the same kebab-case style and is added here when introduced.

| Artifact name | Producer | What it is | File path |
|---|---|---|---|
| `spec` | `product-management` (AC refinement) | Refined story spec (Gherkin AC, business rules, scope) | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/spec.md` |
| `epic` | `product-management` (epic creation) | Epic-level scope, child stories, traceability to PRD. Jira-synced. | `.context/PBI/epics/EPIC-<KEY>-<slug>/epic.md` |
| `implementation-plan` | `sprint-development` Stage 1 | Story implementation plan (tasks mapped to AC). Jira-synced. | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md` |
| `feature-implementation-plan` | `sprint-development` Stage 1 (macro) | Feature-level implementation plan across several stories. Jira-synced. | `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-implementation-plan.md` |
| `review` | `sprint-development` Stage 3 | Code-review findings against AC and standards | `.session/sprint-development/<KEY>/review.md` |
| `compliance-matrix` | `sprint-development` Stage 3 | AC-vs-code coverage matrix (which AC each commit closes). Session working copy: nothing downstream may depend on the file persisting (the durable copy, and the one the merge gate reads, is the PR body) | `.session/sprint-development/<KEY>/compliance-matrix.md` |
| `bug-fix` | `sprint-development` Stage 2 (`bug-fix-workflow`) | Root cause, fix plan and regression notes | `.session/sprint-development/<KEY>/bug-fix.md` |
| `edge-cases` | `product-management` (enumeration) | Cataloged edge cases with criticality and the AC-promote decision | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/edge-cases.md` |
| `test-report` | (out of scope here) | QA test execution report, referenced for traceability | `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-report.md` |

The list is not exhaustive. A skill may emit other artifacts (for example `staging-deploy-notes`, `rollback-runbook`) as long as they follow the kebab-case `pbi/{ticket}/{name}` shape.

## UPSERT semantics

The convention is UPSERT, not append: writing `pbi/UPEX-123/implementation-plan` a second time overwrites the first. Three reasons:

1. Most artifacts are the current state of the work, not its history. A re-plan after PR feedback should replace the stale plan.
2. The Engram CLI upserts by `topic_key` (matching keys overwrite), and the file side mirrors that so the two stay consistent.
3. History lives elsewhere. `.context/PBI/` is a gitignored cache (`.agents/instructions/agent-local-context-pbi.md` §9), so `git log` on a file there shows nothing. For Jira-synced artifacts (`implementation-plan`, `epic`) the Jira field's own edit history is the record: the field is the source of truth and a re-sync materializes the latest. For everything else, give each round its own Engram topic key (`review-r1`, `review-r2`) so prior states survive.

When not to UPSERT, start a new artifact name:

| Situation | Wrong | Right |
|---|---|---|
| Several review rounds on the same ticket | overwrite `review` each time and lose the earlier notes | `review-r1`, `review-r2`, ... as distinct topic keys (the PBI cache is gitignored, so git history does not exist) |
| Spec for the same ticket in two sprints | reuse `spec` | the ticket changed; UPSERT is fine |
| Two unrelated bugs filed under the same ticket | reuse `bug-fix` | file separate tickets |

## 2-step retrieval pattern

Search results from the Engram bridge are truncated previews, so retrieve in two steps:

1. **Search** for matching topic keys, which returns observation IDs and short previews.
2. **Fetch** the full content of the chosen ID.

This is the Engram MCP API (`mem_search`, then `mem_get_observation`). On the file side:

1. **Search**: `ls .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`, or `grep -r 'topic_key: pbi/<KEY>'` when headers are tagged.
2. **Read**: `cat .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/{artifact}.md`.

When the answer must be authoritative, always do the second step. A search preview is not the artifact.

## `capture_prompt` rules

The Engram MCP takes a `capture_prompt` parameter on `mem_save`. The default per artifact:

| Artifact origin | `capture_prompt` | Why |
|---|---|---|
| Generated by a workflow skill (implementation-plan, compliance-matrix, and so on) | `false` | The artifact is the deterministic output of an automated pipeline, and the prompt that triggered it adds noise. |
| Human-prompted decision (epic scope, story slicing, AC trade-off) | `true` | The user's intent matters, and capturing it preserves the rationale. |

When in doubt, use `true`. Use `false` only for generated artifacts (onboarding and state artifacts, local skill-registry script output).

## File-first storage

The canonical location of an artifact is its file path under `.context/PBI/`:

```
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/{artifact}.md
```

The PBI tree is rooted at the epic (Module = Epic, 1:1). Epic-level files live in the epic folder and story-level files in the story folder. Per-ticket session state (the `session/...` prefix) lives under `.session/sprint-development/<KEY>/` per `./session-management.md`:

```
.context/PBI/epics/EPIC-<KEY>-<slug>/epic.md
.context/PBI/epics/EPIC-<KEY>-<slug>/feature-implementation-plan.md
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/spec.md
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md
.session/sprint-development/<KEY>/progress.md
…
```

- The file is the local read surface, and Engram is a mirror, not a primary store. Tier discipline follows `.agents/instructions/agent-local-context-pbi.md` §9. The whole PBI tree is gitignored. A `[SYNC]` file recovers by re-sync (its truth is the Jira field). A non-synced artifact written there (`spec.md`, `edge-cases.md`) is `[LOCAL]`: machine-local and disposable, and nothing downstream may depend on it existing. Content that must survive the machine goes to a Jira field or comment. Durable session state goes to `.session/`, where `sprint-development` keeps `review.md`, `compliance-matrix.md` and `bug-fix.md`.
- File names are kebab-case, with a conventional `.md` suffix.
- Existing `.context/PBI/` projects already follow this layout (`spec.md`, `implementation-plan.md`). The only change is the topic-key tag each file carries.
- `implementation-plan.md` and `feature-implementation-plan.md` are Jira-synced caches. The plan is authored, written to the Jira `spec_implementation_plan` or `feature_implementation_plan` field (fallback: a comment), then materialized read-only by `bun run jira:sync-issues get <KEY>`. Edit the Jira field and re-sync; do not edit the materialized file.
- Artifacts that need explicit tagging carry a one-line YAML front-matter header:

  ```markdown
  ---
  topic_key: pbi/UPEX-123/implementation-plan
  capture_prompt: false
  ---

  # Implementation plan — UPEX-123
  ```

  The header is optional, because the bridge can derive the key from the file path. It helps when the file is moved or renamed.

## Migration from existing PBI structure

Projects that already have `spec.md`, `implementation-plan.md` and the rest under the story folder need no on-disk migration. The convention is a tagging discipline applied going forward:

| Existing file | Topic key (new) | Action |
|---|---|---|
| `…/STORY-UPEX-123-<slug>/spec.md` | `pbi/UPEX-123/spec` | none |
| `…/STORY-UPEX-123-<slug>/implementation-plan.md` | `pbi/UPEX-123/implementation-plan` | none (`implementation-plan.md` is the canonical Jira-synced name) |
| `…/STORY-UPEX-123-<slug>/test-analysis.md` | `pbi/UPEX-123/test-analysis` | none (out of scope here, kept for reference) |
| `…/STORY-UPEX-123-<slug>/test-report.md` | `pbi/UPEX-123/test-report` | none (out of scope here, kept for reference) |

No rename is needed: `implementation-plan.md` is already the canonical filename (the old short `impl-plan.md` is retired). The topic key derives from the existing file path.

## Cross-references

- **Producers** (skills that emit artifacts): `product-management/SKILL.md` and `sprint-development/SKILL.md`. Both cite this file from the steps that emit artifacts.
- The Engram MCP surface used is `mem_save` (with `topic_key`, `type`, `scope`, optional `capture_prompt`), `mem_search` and `mem_get_observation`. The file stays the source of truth, and the MCP mirror is best-effort.
