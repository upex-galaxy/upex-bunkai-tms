# Topic-Key Conventions for PBI Artifacts

> Cited by: `product-management`, `sprint-development`. Loaded on demand whenever an artifact (spec, implementation plan, code review, compliance matrix, etc.) is created or retrieved, so persistence is deterministic and the optional Engram bridge can mirror without coupling.

## Purpose

Every artifact a workflow skill produces (spec, impl-plan, review, test-report, compliance-matrix, bug-fix, etc.) needs a **deterministic persistence key**. A stable key gives us:

1. **Idempotent writes (UPSERT).** Re-running a workflow on the same ticket overwrites the previous artifact instead of accumulating duplicates.
2. **A predictable retrieval path.** Anyone (human or agent) can guess the key from the ticket number and artifact name.
3. **A mirror to Engram without coupling.** The engram MCP (`mem_save` / `mem_search` / `mem_get_observation`) can mirror the file under the same key. If absent, everything still works file-first; nothing else changes.

This document is the **single source of truth** for the key format and storage layout. Skills cite it (`See agentic-dev-core/references/topic-key-conventions.md`) instead of redefining the convention inline.

## Convention

```
pbi/{ticket}/{artifact}
```

| Segment      | Meaning                                                       | Example                             |
| ------------ | ------------------------------------------------------------- | ----------------------------------- |
| `pbi`        | Fixed prefix. Distinguishes PBI artifacts from other domains. | (always literal `pbi`)              |
| `{ticket}`   | Issue-tracker key, uppercase, hyphen-separated.               | `UPEX-123`, `MYM-7`                 |
| `{artifact}` | Artifact name, kebab-case, open vocabulary.                   | `spec`, `impl-plan`, `bug-fix-plan` |

**Examples:**

- `pbi/UPEX-123/spec` — refined story spec
- `pbi/UPEX-123/impl-plan` — implementation plan from `sprint-development` Stage 1
- `pbi/UPEX-123/review` — code-review notes from `sprint-development` Stage 3
- `pbi/UPEX-456/bug-fix` — bug fix plan + root-cause notes
- `pbi/UPEX-789/compliance-matrix` — Stage 3 AC-vs-code coverage matrix

## Common artifact types

The vocabulary is open — pick whatever name the workflow naturally uses — but the table below covers the names most skills emit today. New names should follow the same kebab-case style and be added here when introduced.

| Artifact name       | Producer                                          | What it is                                                  | File path                                       |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `spec`              | `product-management` (AC refinement)              | Refined story spec (Gherkin AC, business rules, scope)      | `.context/PBI/{ticket}/spec.md`                 |
| `epic`              | `product-management` (epic creation)              | Epic-level scope, child stories, traceability to PRD        | `.context/PBI/{epic-slug}/epic.md`              |
| `impl-plan`         | `sprint-development` Stage 1                      | Story implementation plan (tasks mapped to AC)              | `.context/PBI/{ticket}/impl-plan.md`            |
| `feature-impl-plan` | `sprint-development` Stage 1 (macro)              | Feature-level implementation plan across multiple stories   | `.context/PBI/{epic-slug}/feature-impl-plan.md` |
| `review`            | `sprint-development` Stage 3                      | Code-review findings against AC + standards                 | `.context/PBI/{ticket}/review.md`               |
| `compliance-matrix` | `sprint-development` Stage 3                      | AC-vs-code coverage matrix (which AC each commit closes)    | `.context/PBI/{ticket}/compliance-matrix.md`    |
| `bug-fix`           | `sprint-development` Stage 2 (`bug-fix-workflow`) | Root-cause + fix plan + regression notes                    | `.context/PBI/{ticket}/bug-fix.md`              |
| `edge-cases`        | `product-management` (enumeration)                | Cataloged edge cases with criticality + AC-promote decision | `.context/PBI/{ticket}/edge-cases.md`           |
| `test-report`       | (out of scope here; sister repo)                  | QA test execution report — referenced for traceability      | `.context/PBI/{ticket}/test-report.md`          |

This list is **not exhaustive**. Skills may emit other artifacts (e.g., `staging-deploy-notes`, `rollback-runbook`); they just need to follow the kebab-case-plus-`pbi/{ticket}/{name}` shape.

## UPSERT semantics

The convention is **UPSERT, not append**: writing `pbi/UPEX-123/impl-plan` a second time **overwrites** the previous content. Reasoning:

1. Most artifacts represent the **current state of the work**, not its history. A re-plan after PR feedback should replace the stale plan, not coexist with it.
2. The Engram CLI itself is upsert-by-`topic_key` (matching keys overwrite); we mirror that behavior file-side so the two stay consistent.
3. If you need history, **use git** — that's its job. `git log .context/PBI/UPEX-123/impl-plan.md` shows every revision; the latest commit is the source of truth.

When **not** to UPSERT — start a new artifact name instead:

| Situation                                                 | Wrong                                            | Right                                                |
| --------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Multiple distinct review rounds on the same ticket        | overwrite `review` each time, losing prior notes | `review-r1`, `review-r2`, … (or rely on git history) |
| Spec for the **same ticket** in two different sprints     | reuse `spec`                                     | the ticket changed; UPSERT is fine                   |
| Two completely unrelated bugs filed under the same ticket | reuse `bug-fix`                                  | (don't — file separate tickets)                      |

## 2-step retrieval pattern

When retrieving an artifact (especially via the Engram bridge, where previews are truncated), follow the **2-step pattern**:

1. **Search** for matching topic_keys → get back observation IDs (and short previews).
2. **Fetch** the full content for the chosen ID.

This mirrors the Engram MCP API (`mem_search` → `mem_get_observation`). File-side, the equivalent is:

1. **Search**: `ls .context/PBI/{ticket}/` (or `grep -r 'topic_key: pbi/{ticket}'` if you grep-tag headers).
2. **Read**: `cat .context/PBI/{ticket}/{artifact}.md`.

Either way, never assume the full content from a search result; always do the second fetch when the answer must be authoritative.

## `capture_prompt` rules

The engram MCP exposes a `capture_prompt` parameter on `mem_save`. The default per artifact:

| Artifact origin                                                         | `capture_prompt` | Why                                                                                                         |
| ----------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Auto-generated by a workflow skill (impl-plan, compliance-matrix, etc.) | `false`          | The artifact is the deterministic output of an automated pipeline; the prompt that triggered it adds noise. |
| Human-prompted decision (epic scope, story slicing, AC trade-off)       | `true`           | The user's intent matters; capturing it preserves the rationale behind the decision.                        |

When in doubt, prefer `capture_prompt: true`. Flip to `false` only for auto-generated artifacts (onboarding/state artifacts, local skill-registry script output).

## File-first storage

The **canonical location** of every artifact is its file path under `.context/PBI/`:

```
.context/PBI/{ticket}/{artifact}.md
```

For epic-level artifacts, the layout is:

```
.context/PBI/{epic-slug}/epic.md
.context/PBI/{epic-slug}/feature-impl-plan.md
.context/PBI/{epic-slug}/{ticket}/spec.md
.context/PBI/{epic-slug}/{ticket}/impl-plan.md
…
```

Notes:

- The file is **the** source of truth. Engram is a mirror, not a primary store.
- Files are kebab-case-named; the trailing `.md` is conventional.
- Existing `.context/PBI/` projects already follow this layout (`spec.md`, `implementation-plan.md`, etc.); the only change is the topic-key tag we associate with each file.
- Add a one-line YAML front-matter header to artifacts that need explicit tagging:

  ```markdown
  ---
  topic_key: pbi/UPEX-123/impl-plan
  capture_prompt: false
  ---

  # Implementation plan — UPEX-123
  ```

  The header is optional; the bridge can also derive the key from the file path. The header is useful when the file is moved or renamed.

## Migration from existing PBI structure

Existing projects that already have `.context/PBI/{ticket}/spec.md`, `.context/PBI/{ticket}/implementation-plan.md`, etc. **need no on-disk migration**. The convention is just a tagging discipline applied going forward:

| Existing file                                  | Topic key (new)              | Action                                                                     |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `.context/PBI/UPEX-123/spec.md`                | `pbi/UPEX-123/spec`          | none                                                                       |
| `.context/PBI/UPEX-123/implementation-plan.md` | `pbi/UPEX-123/impl-plan`     | rename file to `impl-plan.md` next time it's edited (kebab-case + shorter) |
| `.context/PBI/UPEX-123/test-analysis.md`       | `pbi/UPEX-123/test-analysis` | none (out of scope here, kept for reference)                               |
| `.context/PBI/UPEX-123/test-report.md`         | `pbi/UPEX-123/test-report`   | none (out of scope here, kept for reference)                               |

The renaming step is **opportunistic** — only do it when you're already editing the file for another reason. Don't run a rename pass for its own sake; the topic-key derivation works either way.

## Cross-references

- **Producers** (skills that emit artifacts): `product-management/SKILL.md`, `sprint-development/SKILL.md`. Both cite this file from the steps that emit artifacts.
- **Engram MCP surface used**: `mem_save` (with `topic_key`, `type`, `scope`, optional `capture_prompt`), `mem_search`, `mem_get_observation`. The file remains the source of truth; the MCP mirror is best-effort.
