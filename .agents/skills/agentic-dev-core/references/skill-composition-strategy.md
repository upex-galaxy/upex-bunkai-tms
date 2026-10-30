# Skill Composition Strategy

> **Purpose**: Contract for how this repo's AI orchestrator composes project-owned skills with community skills (project-level and user-level) without duplication, conflicts, or false negatives.
>
> **Home**: `.agents/skills/agentic-dev-core/references/skill-composition-strategy.md` — meta-doctrine consumed by all T1 skills, sibling to `briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`, `skill-resolver.md`.
>
> **Status**: v2.0 — T2 (gentle-ai 15-skill bundle) removed. Installer (`cli/install.ts`) now wires only Engram (persistent memory), with the engram binary's own `engram setup <agent>`; gentle-ai is no longer invoked (its `minimal` preset also carried the SDD skills). The SDD bundle, judgment-day, cognitive-doc-design, comment-writer, issue-creation, and skill-registry are no longer installed. Document collapses from 4 tiers to 3 (T1 + T3 + T4) and drops the Sprint-Dev ↔ SDD integration contract that v1.x maintained.
>
> **Companion files**:
>
> - `AGENTS.md` (project memory — top-level rules and skill mentions)
> - `.agents/skills/*/SKILL.md` (per-skill instructions; reference this doc relatively as `agentic-dev-core/references/skill-composition-strategy.md`)
> - `cli/install.ts` (installer — declares project-level vs user-level skill installs)
> - `.agents/skills/agentic-dev-core/references/{briefing-template,dispatch-patterns,orchestration-doctrine,skill-resolver}.md` (sibling meta-doctrine references)

---

## 1. Problem Statement

The repo ships the project-owned skills `.agents/skills/REGISTRY.md` lists (`.agents/skills/`). The installer (`cli/install.ts`) also installs:

- **Community skills (project-level)**: the `PROJECT_LEVEL_SKILLS` array in `cli/install.ts`: the stack skills, plus the builder skills a T1 workflow depends on (`skill-creator`, the builder of every skill this repo scaffolds, `skill-scaffold.md`).
- **Community skills (user-level / global)**: the `USER_LEVEL_SKILLS` array in `cli/install.ts`.
- **Engram (persistent memory)**: wired per agent by `engram setup <agent>`. Not a workflow skill — it is the persistent-memory MCP referenced from AGENTS.md §12 (proactive memory triggers).

Gaps the protocol addresses:

1. Community skills get deprecated / replaced / renamed by their authors. Naming them in AGENTS.md is fragile.
2. No formal contract for when a project-owned skill should "borrow" capabilities from a sister skill (project-level community or user-level community).
3. T4 user-level skills may or may not be installed in any given environment. Naive references break for users who have not installed them.

---

## 2. Skill Tier Model

Three tiers. Different discovery and load rules per tier.

| Tier                              | Location                                                          | Examples                                                                                                                                                                                                          | Discovery                                                                                                     | Load behavior                                                                                |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **T1 — Project-owned**            | `.agents/skills/` (committed)                                     | every committed skill `.agents/skills/REGISTRY.md` lists | Named in `.agents/instructions/agent-skills-and-mcps.md` §5 "Skills T1" table; a skill the project created for itself, in the "Project context skills" table of `.agents/instructions/agent-project.md` | Silent (load on trigger, no ask)                                                             |
| **T3 — Community project-level**  | `.agents/skills/` (installed by `install.ts:PROJECT_LEVEL_SKILLS`) | `PROJECT_LEVEL_SKILLS` in `cli/install.ts` (stack skills + builder skills such as `skill-creator`)                                                            | Named **by category** in AGENTS.md (not by skill name). Discovered at runtime by the §3.1 scan (session skill list + `.agents/skills/` on disk), never from `REGISTRY.md` | Silent if matched by category (e.g. user tunes a Next.js route's caching → load `next-cache-components-optimizer`) |
| **T4 — Community user-level**     | `~/.claude/skills/` (installed by `install.ts:USER_LEVEL_SKILLS`) | `USER_LEVEL_SKILLS` in `cli/install.ts`                                                                                                       | **NOT named in AGENTS.md**. Discovered at runtime from the session skill list (§3.1). Auto-match by task domain  | **ASK user before load** (may not be installed, or user may not want it for this task)       |

### Tier decision rule

```
IF skill is committed in .agents/skills/         → T1
ELIF skill is in install.ts PROJECT_LEVEL_SKILLS → T3
ELIF skill is in install.ts USER_LEVEL_SKILLS    → T4
ELSE → T4 (unknown community)
```

**Orchestration vendor stubs are T4 but NOT in `USER_LEVEL_SKILLS`.** `orca-cli` and `orchestration` are guides bundled with the orchestration binary, which installs them user-level itself. They are optional and never required: T1 `orca-orchestration` loads the stubs named in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside itself, and asks the binary for its grammar when none is installed, so the availability gate is the binary plus a reachable runtime and never an installed stub. Do not add them to `cli/install.ts`; per-machine setup lives in `orca-orchestration/references/orca-machine-setup.md`.

**Builder skills are T3, not T4.** A community skill that a T1 workflow DEPENDS on (not one it merely borrows by category) is installed at project level, so a clone never silently skips it. `skill-creator` sits there because `project-context` mode `context-skill` and every new T1 skill are built through it (`skill-scaffold.md`). A user-level install of the same skill still satisfies it. A builder joins `PROJECT_LEVEL_SKILLS` in the same change as the T1 flow that loads it: an install nothing loads should not exist.

---

## 2b. Purpose Axis (`metadata.kind`)

A skill carries three independent labels. Each answers one question, is declared in one place, and has one gate. Collapsing any two of them is the wrong turn: `acli` is T1 **and** utility, `skill-creator` is T3 and nothing here labels its kind (the project does not author community frontmatter).

| Axis | Question it answers | Where declared | Gate |
|---|---|---|---|
| **Ownership** (T1 / T3 / T4, §2) | Who owns it, where it is installed, whether to ask before loading | `.agents/skills/` dir walk + `PROJECT_LEVEL_SKILLS` / `USER_LEVEL_SKILLS` in `cli/install.ts` | the tier checks in `scripts/lint-skills.ts` (`TIER-MISMATCH` against the `(T3)` / `(T4)` annotations of every Expected-matches table, `DUPLICATE-TIER`) |
| **Purpose** (`metadata.kind`) | What the skill IS: knowledge, a procedure, a tool index, or a doctrine parent | `SKILL.md` frontmatter, nested under `metadata:` | `KIND-MISSING`, `KIND-VOCAB`, `KIND-SUFFIX` in `scripts/lint-skills.ts` |
| **Domain** (`complementary_categories`, §4) | Which community skills a T1 skill may borrow, by category not name | `SKILL.md` frontmatter, top level | `ORPHAN-CATEGORY` / `EMPTY-CATEGORY` against §4.1 |

### The four kinds

| Kind | Classifying test | Slug suffix |
|---|---|---|
| **context** | Loading it changes what the agent KNOWS, not what it DOES next. No stages, drives no tool. Cites `.context/`, never restates it. May hold its own generated map and keep it honest (the write-scope amendment, `skill-scaffold.md` §3) | `-context` (mandatory) |
| **workflow** | A procedure with stages the agent runs end-to-end: a delivery stage (foundation, bootstrap, backlog, story, deploy) OR an operating flow around one (git, onboarding, Jira administration, context refresh) | none |
| **utility** | Owns ONE tool's grammar (a binary in `allowed-tools`, or an `.agents/instructions/agent-tool-resolution.md` §6.5 CLI row) and has no stages of its own | `-cli` / `-tool` / `-app` (mandatory for new skills) |
| **core** | Parent of other skills: they cite its `references/`; it has no write path of its own | none |

### Rules

- **`kind` lives under `metadata`, never top-level.** The Agent Skills frontmatter spec reserves the top level; `metadata` is its extension point. One kind per skill.
- **`stage_owner: true` marks a workflow skill that owns stages.** It binds `STAGE-OWNER-DISPATCH` (a dispatch section must exist) and the session close in `session-footer-contract.md`. The set is whatever skills declare it; `REGISTRY.md` prints `stage owner` on their Source line.
- **The suffix rule binds both ways.** A slug ending `-context` must declare `context` and a `context` skill must end `-context`; a slug ending `-cli` / `-tool` / `-app` must declare `utility` and a `utility` skill must carry one of them. `workflow` and `core` have no suffix rule.
- **Grandfathering is by name, visibly.** `KIND_SUFFIX_EXEMPT` in `scripts/lint-skills.ts` lists the slugs that predate the rule (a utility without a suffix, a workflow whose slug ends `-context`). A new skill picks a slug that matches its kind instead of joining that set.
- **Which skill is which: read `.agents/skills/REGISTRY.md`** (generated by `bun run skills:registry`; the Source line prints `kind:`). This document never carries a per-skill list, so there is nothing here to fall behind.
- **A context skill may write, but only its own `references/`.** `metadata.writes: [references/]` + `references/refresh.md`; it never runs a stage and never touches Jira or Confluence. `CONTEXT-WRITES` in `scripts/lint-skills.ts` gates it.
- **Capabilities are declared, not inferred.** `metadata.requires_capabilities` names MCP capabilities from `mcp-capabilities.md` §2 only; `CAPABILITY-VOCAB` rejects any other name, `CAPABILITY-UNDECLARED` warns when a body uses a resolution tag it did not declare.
- **T3 / T4 bodies are not linted for kind.** A community skill committed in the store keeps its `cli/install.ts` tier and the project does not author its frontmatter.

---

## 3. Skill Composition Protocol

### 3.1 Pre-flight (every task)

Before starting any non-trivial task, the orchestrator (and each invoked skill) MUST:

1. **Scan the skills actually installed**, from two sources read together:
   - the skill list the harness injects at session start (the `system-reminder` list in Claude Code, the equivalent list in Codex and OpenCode). It already carries the user-level skills and the project-level ones the harness discovers through `.agents/skills/` (Claude Code through the generated `.claude/skills` alias);
   - the project store on disk: every `.agents/skills/*/SKILL.md`, git-ignored community folders included (`ls .agents/skills/*/SKILL.md`, then the frontmatter `description` of any folder the session list did not show).

   `.agents/skills/REGISTRY.md` is NOT this scan. `scripts/build-skill-registry.ts` skips git-ignored folders on purpose, so the file is identical on every clone and lists committed skills only: a community (T3) skill never appears in it. The registry is where the resolver copies T1 compact rules from (`skill-resolver.md`), never the inventory of what this machine has installed.
2. **Match by domain category** (see vocabulary §4) — not by literal skill name.
3. **Resolve tier per match**:
   - T1 / T3 → load silently when task domain matches.
   - T4 → ask user one short question before loading: `"Detected X skill (T4). Apply it? Y/N"`.
4. **Cache the load decisions** for the session — do not re-ask the same skill twice.

### 3.2 Threshold rule (silent vs ask)

| Tier | Silent load condition                       | Ask condition                   |
| ---- | ------------------------------------------- | ------------------------------- |
| T1   | always                                      | never                           |
| T3   | task domain matches category                | task domain only weakly matches |
| T4   | never silent                                | always ask before load          |

### 3.3 Sub-agent skill propagation

When the orchestrator delegates to a sub-agent via the `Agent` tool, the sub-agent receives **its own** `system-reminder` skill list. The orchestrator cannot directly pass "use these skills". To bridge this:

- Orchestrator MUST inject a `## Composable Skills` block into the sub-agent prompt naming the resolved skills (e.g. `"For this task, consider invoking: unit-testing, typescript-advanced-types."`).
- Sub-agent reads its own skill list, finds those names, loads them.
- If the sub-agent does NOT find a skill it was told to use → it falls back to the skill not found path (typically: do the work inline + flag the missing capability in the result envelope).

### 3.4 Skill not found path

When a referenced skill is not in the available list (deprecated, uninstalled, version mismatch):

1. Continue with project-owned alternative if exists.
2. If no alternative, do the work inline with degraded capability.
3. Flag in result envelope: `skill_resolution: "fallback-inline" + missing: [list]`.
4. Suggest reinstall via `bun setup` or `bunx skills add <name>` in the user-facing summary.

### 3.5 Step-required skills (named at the step that needs them)

The entry-time scan (§3.1) loads a community skill only when the task domain "matches", which is
too soft for the steps where a stack skill carries the real rules. So a workflow step that writes in
a domain a stack skill owns NAMES that skill and requires it at that step. The owners:

| Step does | Load first | Category |
| --------- | ---------- | -------- |
| Any database schema, RLS, function or migration change (through the DB MCP or the `supabase` CLI) | `supabase` + `supabase-postgres-best-practices` | `backend-db` |
| Screen design: a mockup or a screen's HTML (`design-system` screen phase, Mode C) | the design set (below) | `frontend-ui` |
| Screen, component or layout work in code | the design set + `shadcn` + `tailwind-css-patterns` | `frontend-ui` |
| A deploy to a Vercel environment | `deploy-to-vercel` (method), next to T1 `vercel-cli` (verification) | `deploy` |
| Sending or templating transactional email | `resend-cli` | `email` |
| A public, indexable page | `seo` | `seo` |

**The design set.** Every step that designs or builds a screen loads the same group, because each one
owns a different part of the job:

- `frontend-design`: the aesthetic direction, typography, choices that do not read as a template.
- `ui-ux-pro-max`: searchable design data (styles, palettes, font pairings, UX guidelines, per-stack UI rules).
- `impeccable`: the critique and polish pass (hierarchy, states, responsive behaviour, motion, UX copy).
- `emil-design-eng`: component-level polish and animation decisions.

Two more join only when the step matches their scope:

- `redesign-existing-projects`: only when the step redesigns a UI that already exists (it audits the
  current design before changing it). Never on a new screen.
- `design-taste-frontend`: only when the screen is a public marketing page (landing, pricing,
  portfolio). That is its declared scope; outside it, it repeats what `frontend-design` and
  `redesign-existing-projects` already cover.

Contract, identical at every step that cites this section:

1. **Load the named skills before the first write of the step**, not after.
2. **Not installed** → say so ONCE in the session (every missing skill in one line, and the step) and point at the install
   path: `bun setup` installs the project-level list (`PROJECT_LEVEL_SKILLS` in `cli/install.ts`),
   or one `bunx skills add <package> --skill <name> --yes` with the package from that list;
   `bun run setup:doctor` checks the machine. Then CONTINUE with the step: a missing community skill
   is never a hard STOP and never a silent skip (record it as `skill_resolution: "fallback-inline"`, §3.4).
3. The skill guides HOW; the step's own rules (the project's ADRs, `DESIGN.md` tokens, Critical Rules)
   still win on a conflict.

---

## 4. Category Vocabulary (for community skill auto-match)

Project-owned skills are named explicitly. Community skills (T3, T4) are matched by **category**, not by name. Each project-owned skill declares which categories it can borrow from in its frontmatter `complementary_categories` field.

### 4.1 Category list (v2)

| Category             | Examples of skills that fit (T3/T4)                                                                                                                           | Used by (T1)                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `frontend-ui`        | `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `shadcn`, `tailwind-css-patterns`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` | `design-system`, `project-bootstrap` (frontend phase), `sprint-development` (UI work) |
| `frontend-framework` | `next-cache-components-adoption`, `next-cache-components-optimizer`. Next.js reference knowledge and upgrades are not skills: `[DOCS_TOOL]` (Context7) and the docs bundled in the app's `next` package | `project-bootstrap`, `sprint-development`                                             |
| `forms-validation`   | `react-hook-form`, `zod`                                                                                                                                      | `sprint-development` (form work)                                                      |
| `backend-db`         | `supabase`, `supabase-postgres-best-practices`                                                                                                                | `project-bootstrap` (backend phase), `sprint-development` (DB work)                   |
| `language`           | `typescript-advanced-types`                                                                                                                                   | `sprint-development`, `unit-testing`                                                  |
| `accessibility`      | `accessibility`                                                                                                                                               | `design-system`, `sprint-development` (UI work)                                       |
| `seo`                | `seo`                                                                                                                                                         | `sprint-development` (public-page work)                                               |
| `deploy`             | `deploy-to-vercel` (T3 — deploy workflow). Note: `vercel-cli` (T1) owns Vercel verification, env sync, debug, rollback — see `.agents/instructions/agent-skills-and-mcps.md` §5.                    | `sprint-development` Stage 4/5, `vercel-cli`                                          |
| `email`              | `resend-cli`                                                                                                                                                  | `sprint-development` (email-feature work)                                             |
| `testing-e2e`        | `playwright-cli`                                                                                                                                              | `sprint-development` Stage 3 (when E2E in scope)                                      |
| `ci-cd`              | `github-actions-docs`                                                                                                                                         | `project-bootstrap` (CI phase), `sprint-development`                                  |
| `issue-tracker`      | (acli is T1)                                                                                                                                                  | `sprint-development`, `product-management`                                            |
| `meta-skill`         | `skill-creator`, `diagram-design`, `find-skills`                                                                                                              | `project-context` mode `context-skill` (`skill-creator`, the builder); modes `data` / `features` / `api` and each business map skill's refresh (`diagram-design`, the maps' figures, capability `diagrams`); otherwise only on user request (find-skills auto-invoked per §6.2 as last-resort) |
| `presentation`       | `html-ppt`                                                                                                                                                    | only on user request (HTML decks, slideshows)                                         |
| `orchestration`      | `orca-cli`, `orchestration` (the orchestration binary's own guides, named in `orchestration.orchestrator_skills`; optional to HAVE, loaded alongside `/orca-orchestration` when present, never a gate) | `orca-orchestration` (self-tag); cited as the transport by `sprint-development` (fleet mode) and `autonomous-delivery` (Phase 3 workers) |

### 4.2 Matching rule

Each T1 SKILL.md declares its category list in frontmatter:

```yaml
---
name: sprint-development
complementary_categories:
  - frontend-ui
  - frontend-framework
  - forms-validation
  - backend-db
  - testing-e2e
  - accessibility
---
```

At runtime, the skill (or orchestrator) scans the available skill list, matches each available skill against its category, and applies the threshold rule from §3.2.

### 4.3 Why categories not names

- Community skills get renamed, deprecated, replaced. Naming creates dead refs.
- Different users have different installs. Category match degrades gracefully (skill missing → no false negative, just no extra capability).
- Project-owned skills stay portable across community ecosystems.

---

## 5. Glue Layer Responsibilities

The orchestrator (top-level conversation) owns the glue layer. Cannot be inside a single skill because it spans multiple skills.

### 5.1 Per-session bootstrap (once)

1. Read `.agents/project.yaml` for project standards (test command, env, stack).
2. Cache for session: `test_command`, `delivery_strategy_default`, `complementary_skill_resolutions`.
3. Build / verify the local skill-registry cache (`scripts/build-skill-registry.ts` → `.agents/skills/REGISTRY.md`) for T1 compact rules; the installed community skills come from the §3.1 scan.

### 5.2 Per-delegation injection

Every sub-agent / skill prompt MUST include:

```
## Composable Skills (auto-resolved)
- T1 to load silently: [list]
- T3 to load by category: [list]
- T4 detected but NOT loaded (ask user first): [list]

## Project Standards
- Test command: {from project.yaml}
- Delivery: single-pr (one PR per user story; granularity = atomic commits)
```

### 5.3 Decision points the glue layer owns

| Decision        | When                    | How                                                                       |
| --------------- | ----------------------- | ------------------------------------------------------------------------- |
| Skill load (T4) | First match per session | Ask user once per skill per session. Cache decision.                      |
| Workload size   | Stage 1 forecast        | Sprint-dev `references/workload-forecast.md` owns the size indicator and commit plan (informational, no gate). |

---

## 6. Resolved Decisions

1. **Skill registry tooling**: ✅ **Local script, committed skills only.** `scripts/build-skill-registry.ts` scans the committed `.agents/skills/*/SKILL.md` (git-ignored folders skipped, so the file is the same on every clone), extracts compact rules, writes `.agents/skills/REGISTRY.md`. It is the source of T1 compact rules for briefings (`skill-resolver.md`), not the inventory of installed skills: community skills are found by the §3.1 scan (session skill list + `.agents/skills/` on disk). No machine-local registry section or file is generated for them: the session list is already live and complete, a generated local file would go stale the moment `bunx skills add` runs, and a machine-dependent section would break the committed file's determinism.

2. **find-skills meta-skill**: ✅ **Automatic, but only as last resort.** Invocation order:
   1. Scan T1 (always available).
   2. Scan T3 + T4 already installed (the §3.1 scan: session skill list + `.agents/skills/` on disk).
   3. If a task domain has no match in steps 1-2 AND the task would benefit significantly from a specialized skill → invoke `find-skills` automatically to suggest installable skills. Ask user before installing.
   - **Do NOT confuse with `bunx autoskills`**: that is a one-shot bootstrap step run during `/project-bootstrap` (after `/project-foundation`) to install stack-matched skills. `find-skills` is per-task runtime discovery.

3. **Category vocabulary maintainer**: **no automated maintainer.** `bun run skills:check` rejects a `complementary_categories` value missing from §4.1, so a skill that needs a new category fails until a human adds it to §4.1 in the same change. Removal of unused categories: manual review.

4. **Sub-agent skill list inspection**: ✅ **Contract drafted in §3.4 is authoritative.** Sub-agents that cannot find a named skill in their own list MUST emit `skill_resolution: "fallback-inline" + missing: [list]` in their result envelope. Orchestrator on receiving fallback re-resolves and may retry with explicit injection.

5. **Per-skill frontmatter migration**: ✅ **Required for every T1 SKILL.md.** Backward-compat default: skills without `complementary_categories` get an empty list (no community matching).

---

## 7. Non-Goals

This doc does NOT:

- Replace any skill's internal workflow. Each skill stays in charge of its own steps.
- Merge project-owned skills into one mega-skill. They stay separate; the orchestrator composes them.
- Define the QA-side composition. QA workflows are out of scope here and follow their own composition strategy.
- Specify exact prompt text for the `## Composable Skills` injection block. That belongs in the orchestrator template, drafted later.
