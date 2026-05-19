# Model routing — `model_preferences` advisory convention

> Cited by: every workflow `SKILL.md` in this boilerplate carries a `model_preferences` advisory block.
> Status: **advisory** — Claude Code does not auto-route. Dispatchers, OpenCode profiles, and future tooling may parse and apply.

---

## Purpose

Every workflow skill in this boilerplate (`agentic-dev-core`, `project-foundation`, `project-bootstrap`, `product-management`, `sprint-development`, `unit-testing`) declares a `model_preferences` block immediately after its YAML frontmatter. The block is HTML-comment-wrapped YAML and documents which model tier is most appropriate for each broad **phase** of the workflow.

This is **pure documentation today**. Claude Code reads `SKILL.md` frontmatter for `name` / `description` / `phase` and ignores the comment block. But the block is structured so that dispatchers (this repo's orchestrators, OpenCode profiles, future cross-agent tooling) can parse it and use it to pass `model:` when launching subagents.

The block is identical across all six workflow skills — the same default mapping applies everywhere. Per-skill nuance lives in the **Per-skill primary phases** table below, not inside each `SKILL.md`.

---

## Default mapping

| Phase            | Model    | Rationale                                                                   |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `foundation`     | `opus`   | High-leverage architectural work — Constitution, PRD/SRS, infra blueprints. |
| `planning`       | `sonnet` | Structured writing — implementation plans, AC refinement, story breakdown.  |
| `implementation` | `sonnet` | Default for code work — writing code, tests, fixes.                         |
| `review`         | `opus`   | Critical analysis — code review, AC quality audits, judgment calls.         |
| `archive`        | `haiku`  | Mechanical close-out — Jira transitions, doc updates, status reports.       |

The five phases form a generic life-cycle that maps onto every workflow skill: define -> plan -> build -> review -> close.

---

## Why HTML-comment-wrapped YAML

The format is:

```markdown
<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus
  planning: sonnet
  implementation: sonnet
  review: opus
  archive: haiku
-->
```

Considered alternatives and why this won:

- **Inline in YAML frontmatter** (`model_preferences: { ... }`). Rejected: agentskills.io and other strict frontmatter parsers may not accept unknown top-level keys, and Claude Code's own loader could reject the skill.
- **Separate `MODEL.yml` file**. Rejected: extra file to keep in sync; dispatchers would need to load both. The block lives where `SKILL.md` is, so loading `SKILL.md` already gives dispatchers the data.
- **Markdown table inside the body**. Rejected: harder to grep / parse programmatically; mixes prose with config.

HTML comments are:

- **Invisible to markdown rendering** — readers of `SKILL.md` on GitHub or agentskills.io see no clutter.
- **Ignored by frontmatter parsers** — `SKILL.md` continues to parse cleanly.
- **Greppable** — `grep -l "^model_preferences:" .claude/skills/*/SKILL.md` lists every skill that declares the convention.
- **Parseable as YAML** — strip the `<!--` / `-->` delimiters and feed the remainder to any YAML parser.

---

## How dispatchers use it (advisory)

Today, no dispatcher in this repo enforces `model_preferences`. The block is documentation. But the **shape** is fixed so that future tooling can rely on it. A future orchestrator (or this repo's own scripts) could:

1. Resolve a skill at dispatch time (e.g. `/sprint-development` -> `sprint-development/SKILL.md`).
2. Identify the current phase (e.g. Stage 3 Code Review -> `review`).
3. Parse the comment block, look up `review`, get `opus`.
4. Pass `model: opus` when invoking the subagent for that stage.

OpenCode profiles can do similar mapping by loading the skill, reading the block, and selecting the configured profile model for the current phase. Cursor / Codex / generic Copilot ignore the block entirely — they always use whatever model the user has configured globally. That asymmetry is fine: **the block declares intent; consumers opt in**.

If a project wants to override the default for one skill, the recommended path is **not** to mutate the block inside `SKILL.md` (which would diverge from the boilerplate template) but to maintain a project-level `model-overrides.yaml` that the dispatcher merges on top of the skill's defaults.

---

## Per-skill primary phases

The metadata block is identical in all six skills, but each skill spends most of its time in a subset of phases. Dispatchers and humans skimming a skill should consult this table to know which keys actually fire for that skill:

| Skill                | Primary phases                                    | Notes                                                                                       |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `agentic-dev-core`   | `foundation`                                      | One-time setup. All five keys present for completeness; `foundation` is the active one.     |
| `project-foundation` | `foundation`, `planning`                          | All five keys; `foundation` (Constitution) and `planning` (PRD / SRS) are the active ones.  |
| `project-bootstrap`  | `foundation`, `implementation`                    | Bootstrap decisions are foundation-y; scaffolding is implementation-y.                      |
| `product-management` | `planning`, `review`                              | Backlog work is planning + reviewing AC quality and INVEST.                                 |
| `sprint-development` | `planning`, `implementation`, `review`, `archive` | The per-story loop hits all four phases sequentially (plan -> code -> review -> close-out). |
| `unit-testing`       | `implementation`                                  | TDD is implementation-phase. `planning` is light (test design lives inside the impl loop).  |

A dispatcher that wants to be smart can use this table to pre-cache the right model before each stage of `sprint-development`, for example.

---

## Cross-agent compatibility

| Agent                    | Behaviour                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Claude Code              | Reads frontmatter only. The comment block is ignored. Always uses the user's configured model.             |
| OpenCode profiles        | Profiles can be authored to parse the block and select the matching model per phase.                       |
| Cursor / Codex / Copilot | Ignore the block. The skill still loads correctly; only the routing hint is unused.                        |
| Future this-repo tooling | The orchestrator scripts under `scripts/` can parse the block once a dispatch entry-point is standardised. |

The block is therefore **safe to ship in every skill**: it never breaks a consumer; it only adds value where consumers know how to read it.

---

## How to add a new skill

When adding a new workflow skill to this boilerplate:

1. Copy the metadata block verbatim from any existing skill (they are all identical).
2. Insert it **after** the closing `---` of the YAML frontmatter and **before** the first `# Heading` of the body, separated by blank lines.
3. Add the new skill to the **Per-skill primary phases** table above.
4. No other changes are needed — consumers that understand the convention will pick it up automatically.

If a skill genuinely needs different defaults (rare), prefer the project-level `model-overrides.yaml` route over editing the block in place. Keeping the block uniform across skills keeps the `grep` / parse contract clean.

---

## Verification

```bash
# Every workflow skill declares the convention
grep -l "^model_preferences:" .claude/skills/*/SKILL.md

# Each block has exactly five keys
grep -c "^  \(foundation\|planning\|implementation\|review\|archive\):" \
  .claude/skills/sprint-development/SKILL.md
# -> 5

# Frontmatter still parses
head -10 .claude/skills/sprint-development/SKILL.md
```

If any of those checks fail in CI, treat it as a structural drift and re-sync from the canonical block in this file.
