# Model routing: `model_preferences` advisory convention

> Cited by: every workflow `SKILL.md` that carries a `model_preferences` advisory block.
> Status: advisory. Claude Code does not auto-route; dispatchers, OpenCode profiles and future tooling may parse the block and apply it.

---

## Purpose

A workflow skill declares a `model_preferences` block right after its YAML frontmatter. The block is YAML wrapped in an HTML comment, and it says which model tier suits each broad phase of the workflow.

It is documentation only. Claude Code reads `name`, `description` and `phase` from the frontmatter and ignores the comment. The block is structured so that a dispatcher (this repo's orchestrators, an OpenCode profile, cross-agent tooling) can parse it and pass `model:` when it launches a subagent.

Most workflow skills carry the same default block (below). A skill whose work has different phases may declare its own keys instead: an unattended dispatcher or a generator, for example. Read the skill's own block before assuming the five default keys.

---

## Default mapping

| Phase | Model | Rationale |
|---|---|---|
| `foundation` | `opus` | High-leverage architectural work: Constitution, PRD/SRS, infra blueprints. |
| `planning` | `sonnet` | Structured writing: implementation plans, AC refinement, story breakdown. |
| `implementation` | `sonnet` | The default for code work: writing code, tests, fixes. |
| `review` | `opus` | Critical analysis: code review, AC quality audits, judgment calls. |
| `archive` | `haiku` | Mechanical close-out: Jira transitions, doc updates, status reports. |

The five phases are a generic life-cycle that fits most workflow skills: define, plan, build, review, close.

---

## Why HTML-comment-wrapped YAML

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

Three alternatives lost:

- **Inline in the YAML frontmatter.** agentskills.io and other strict frontmatter parsers may reject an unknown top-level key, and Claude Code's own loader could reject the skill.
- **A separate `MODEL.yml` file.** It is one more file to keep in sync, and a dispatcher would have to load both. The block sits in `SKILL.md`, so loading the skill already gives the dispatcher the data.
- **A markdown table in the body.** It is harder to grep and parse, and it mixes prose with config.

The comment form works on every side:

- Markdown rendering hides it, so a reader of `SKILL.md` on GitHub or agentskills.io sees no clutter.
- Frontmatter parsers ignore it, so `SKILL.md` still parses.
- It is greppable: `grep -l "^model_preferences:" .agents/skills/*/SKILL.md` lists every skill that declares the convention.
- Strip the `<!--` and `-->` delimiters and any YAML parser reads the rest.

---

## How dispatchers use it (advisory)

No dispatcher in this repo enforces the block, but its shape is fixed so tooling can rely on it. A dispatcher can:

1. Resolve a skill at dispatch time (`/sprint-development` is `sprint-development/SKILL.md`).
2. Identify the current phase (Stage 3 Code Review is `review`).
3. Parse the comment block and look up `review`, which gives `opus`.
4. Pass `model: opus` when it invokes the subagent for that stage.

An OpenCode profile can do the same by loading the skill, reading the block and selecting the profile model for the current phase. Cursor, Codex and Copilot ignore the block and use whatever model the user configured globally. That asymmetry is fine: the block declares intent, and consumers opt in.

To override the default for one skill, keep a project-level `model-overrides.yaml` that the dispatcher merges over the skill's defaults. Editing the block inside `SKILL.md` would diverge from the boilerplate template.

---

## Primary phases of the default-block skills

A skill spends most of its time in a subset of the five phases. A dispatcher or a human skimming a skill can use this table to see which keys fire:

| Skill | Primary phases | Notes |
|---|---|---|
| `agentic-dev-core` | `foundation` | One-time setup. All five keys are present for completeness; `foundation` is the active one. |
| `project-foundation` | `foundation`, `planning` | `foundation` (Constitution) and `planning` (PRD / SRS) are the active keys. |
| `project-bootstrap` | `foundation`, `implementation` | Bootstrap decisions are foundation work; scaffolding is implementation. |
| `product-management` | `planning`, `review` | Backlog work is planning, plus reviewing AC quality and INVEST. |
| `sprint-development` | `planning`, `implementation`, `review`, `archive` | The per-story loop hits all four in order: plan, code, review, close-out. |
| `unit-testing` | `implementation` | TDD is implementation. `planning` is light because test design lives inside the implementation loop. |

A dispatcher can use this table to pre-select the model before each stage of `sprint-development`, for example.

---

## Cross-agent compatibility

| Agent | Behaviour |
|---|---|
| Claude Code | Reads frontmatter only and ignores the comment block. Uses the user's configured model. |
| OpenCode profiles | A profile can parse the block and select the matching model per phase. |
| Cursor / Codex / Copilot | Ignore the block. The skill loads correctly and only the routing hint goes unused. |
| This repo's tooling | The orchestrator scripts under `scripts/` can parse the block once a dispatch entry-point is standardised. |

The block is safe to ship in every skill: it never breaks a consumer and only adds value where a consumer knows how to read it.

---

## Adding a skill

1. Copy the default block verbatim from an existing skill.
2. Insert it after the closing `---` of the YAML frontmatter and before the first `# Heading` of the body, with blank lines around it.
3. Add the skill to the primary-phases table above.

That is all: consumers that understand the convention pick it up. If the skill genuinely needs other defaults (rare), use the project-level `model-overrides.yaml` route and keep the block uniform, which keeps the grep and parse contract clean.

---

## Verification

```bash
# Every workflow skill declares the convention
grep -l "^model_preferences:" .agents/skills/*/SKILL.md

# A default-block skill has exactly five keys
grep -c "^  \(foundation\|planning\|implementation\|review\|archive\):" \
  .agents/skills/sprint-development/SKILL.md
# -> 5

# Frontmatter still parses
head -10 .agents/skills/sprint-development/SKILL.md
```

If a default-block skill fails one of these checks in CI, treat it as structural drift and re-sync from the canonical block in this file.
