---
name: design-system
description: 'Genera un DESIGN.md (formato Google Labs Apache-2.0) en el root del proyecto antes del scaffolding del frontend. Cinco caminos: default automatizable (npx getdesign + LLM-matcher elige 1 de 72 brands según Constitution+PRD), manual gallery (designmd.ai/explore), Open Design app local (docker), Claude Design (claude.ai/design premium), LLM-authored custom. Triggers: `/design-system`, `definir design system`, `crear DESIGN.md`, `establecer paleta de colores`, `branding del proyecto`, `rebrandear el proyecto`, `set up theme tokens`, `generate design system`, `elegir paleta`, `setup design tokens`. Composable con /project-foundation (la invoca post-PRD, pre-SRS) y /project-bootstrap (consume el DESIGN.md en frontend-setup). Do NOT use for: scaffolding del frontend code (use /project-bootstrap), definir PRD/personas (use /project-foundation), implementación de componentes UI (use frontend-design community skill), o per-story dev (use /sprint-development).'
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: foundation
complementary_categories:
  - frontend-ui
  - accessibility
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # design decisions benefit from strong reasoning
  matcher: sonnet        # mechanical brand selection
  generation: opus       # LLM-authored DESIGN.md from scratch
  validation: haiku      # lint runner
-->

# Design System — DESIGN.md generation orchestrator

`/design-system` produces a portable `DESIGN.md` at the project root following the official Apache-2.0 spec from Google Labs (`google-labs-code/design.md`). This artefact persists the product's visual identity in a format that every AI agent (Claude Code, Cursor, Antigravity, OpenCode, etc.) reads automatically and consumes as the canonical design system.

The skill is invoked **once per project** (post-PRD, pre-SRS) as part of `/project-foundation`, and re-invoked on-demand when the business pivots or wants a rebrand without re-scaffolding. The output is committed and downstream scaffolds (`/project-bootstrap` frontend-setup) consume it as declarative input — replacing the legacy interactive Q&A for palette/typography/components.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md` — used when dispatching to a subagent (Open Design or Claude Design handoff conversion).
- `agentic-dev-core/references/dispatch-patterns.md` — selects Single / Sequential / Parallel for the chosen path.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/design-system/`, archive on completion.

Optionally consumes (informa el matcher y la generación custom):

- `.context/business/business-model.md` — industria, value-prop, tone implícito.
- `.context/PRD/personas.md` — target visual, demographic signal.
- `.context/PRD/executive-summary.md` — positioning, success KPIs.

Si **NO existen** (brownfield / first-time user), la skill cae a modo Q&A interactivo y pregunta los inputs (industria, tone, target, competitors, keywords) directamente al user antes de seguir.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any path below. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md`.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`frontend-ui`, `accessibility`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. For each matched skill, classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this design-system work? Y/N"`. Cache the answer for the session.
5. When dispatching sub-agents (Open Design conversion, Claude Design handoff, LLM-authored custom DESIGN.md), inject a `## Composable Skills` block per strategy doc §6.2.

Expected matches (illustrative — actual list depends on what the user has installed):

| Category        | Likely matches                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-ui`   | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` (T3) |
| `accessibility` | `accessibility` (T3); T4 ASK: `accessibility-review`                                                                                                               |

Skip step only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

---

## When to use

Use this skill when:

- A new project just finished the PRD and needs to define visual identity before the SRS architecture phase.
- An existing project wants to rebrand without touching Constitution / PRD / code.
- A team wants to centralize design tokens in a portable format consumable by multiple AI agents.

Do NOT use this skill to:

- Implement UI / components — that's `/sprint-development` + community skill `frontend-design`.
- Define PRD or personas — that's `/project-foundation` phases 2.x.
- Scaffold the frontend code (Tailwind install, page skeletons, shadcn setup) — that's `/project-bootstrap` frontend-setup.
- Tweak existing tokens after scaffolding — edit `DESIGN.md` directly and re-run the bootstrap pre-flight.

---

## Output

- **`DESIGN.md`** at the project root (path configurable via `design_md_path` in `.agents/project.yaml`, default `./DESIGN.md`).
- Format: Apache-2.0 spec from Google Labs (`google-labs-code/design.md`). YAML frontmatter with design tokens + markdown prose with rationale.
- Eight prescribed sections (order matters, sections may be omitted but never reordered): Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts.
- Validated with `npx @google/design.md lint <path>` before exit (WCAG AA contrast included).
- If `DESIGN.md` already exists, the skill offers: **skip** (keep current) / **overwrite** (replace) / **variant** (write `DESIGN.<slug>.md` alongside, e.g. for light/dark or A/B branding).

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/design-system/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

**Highest-value resume case**: Paths C (Open Design app, Docker iteration) and D (Claude Design at `claude.ai/design`) both PAUSE for external user action — without a persistent session, the skill cannot tell on resume whether it was mid-Path-C waiting for Docker artifacts or mid-Path-D waiting for the exported bundle. Phase 0 + `progress.md` is what makes those paths interruption-resilient.

## Phase 0 — Resume check (MANDATORY, inline)

Before any path selection or subagent dispatch, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/design-system/progress.md` exists.
2. If it does NOT exist → proceed to Phase 1 (write `plan.md` during path selection).
3. If it DOES exist:
   1. Read `.session/design-system/plan.md` in full (records the chosen path + completed steps).
   2. Read the tail of `.session/design-system/progress.md` (last ~3 entries — for Paths C/D especially, this is where "waiting for external work" was recorded).
   3. Surface to the user: chosen path, last completed step, next planned step, any blocking notes (e.g. "waiting for Docker artifact at `design/handoff/`").
   4. Offer three options and WAIT for input: **resume** (continue from the next planned step on the chosen path) / **restart** (archive current dir to `.session/.archive/<YYYY-MM-DD>-design-system-project-aborted/`, then proceed to Phase 1 fresh — useful if the user switched paths) / **abort**.

Phase 0 is inline — no subagent dispatch.

## Phase 1 — Write `plan.md` (during path selection)

The path-selection step below also writes `.session/design-system/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6:

- Frontmatter: `topic_key: session/design-system/project/plan`, `skill: design-system`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` (PRD personas, business-model, existing `DESIGN.md` if any) · `## Approach` (the chosen path — A / B / C / D / E — with rationale) · `## Phase breakdown` (the steps from §"Default flow" for Path B, or the path's own checklist for the others) · `## Risks & open questions` · `## Verification checklist` (lint pass, frontmatter parses, 8 sections present, WCAG AA OK) · `## Cross-references` (`.context/business/business-model.md`, `.context/PRD/personas.md`, `DESIGN.md` target path).

Dispatch: inline draft is normal — inputs are short. A Single planner subagent is warranted only when the LLM-authored custom path (E) needs to ingest a very long Constitution + PRD.

After `plan.md` is written and the user confirms the chosen path, transition `status: draft → approved` and proceed.

> **Progress checkpoint**: write a `progress.md` entry per default-flow step (1–8 of Path B). For Paths A / C / D / E the checkpoints are "path chosen", "external work in progress" (C/D wait for user — recorded with `status: started` and `notes` explaining what is awaited), "DESIGN.md committed", "lint passed". All checkpoints follow `agentic-dev-core/references/session-management.md` §7.

## Path selection

5 paths available. Default automatable: B (`getdesign` + LLM-matcher). The other 4 are opt-in.

| Path                                         | When to pick                                                                                                | Reference                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **A — Gallery manual**                       | User wants to browse and pick without the AI deciding. Free, no auth.                                       | `references/gallery-manual.md`        |
| **B — `getdesign` + LLM-matcher** ⭐ default | PRD exists + you want something off-the-shelf with good quality and zero manual effort. Free, no auth.      | `references/getdesign-matcher.md`     |
| **C — Open Design app**                      | You want to iterate visually in a local UI before locking tokens. Requires Docker. Free, OSS.               | `references/open-design-app.md`       |
| **D — Claude Design**                        | You have Claude Pro+ and want best-in-class quality. Requires manual action at `claude.ai/design`. Premium. | `references/claude-design-handoff.md` |
| **E — LLM-authored custom**                  | Business is very specific and no off-the-shelf matches. Generate from scratch using the Google Labs spec.   | `references/llm-authored.md`          |

**How to choose**:

1. If the user does not specify → start with default (B). If the matcher's top-3 do not convince, offer A or E.
2. If the user says "I want to see options" / "ver opciones" → A.
3. If the user says "custom design" / "diseño custom" / "ninguno me sirve" / "negocio muy nicho" → E.
4. If the user says "Claude Design" / "Anthropic Labs" → D.
5. If the user says "Open Design" / "nexu-io" / "Docker" → C.

Paths C and D both bridge into Path E for the actual DESIGN.md conversion — the visual iteration is in the external tool, but the final markdown follows the Google Labs spec via the LLM-authored path.

---

## Default flow (Path B — getdesign matcher)

Summary — full procedure in `references/getdesign-matcher.md`.

1. **Pre-flight**: verify `npx` is available; warn if not.
2. **Context load**: read `.context/business/business-model.md` + `.context/PRD/personas.md` + `.context/PRD/executive-summary.md`. If none exist, fall back to interactive Q&A (industry / tone / target / competitors / keywords).
3. **Catalog fetch**: `npx getdesign list --json` → 72 brands with tags and descriptions.
4. **Matching**: invoke `scripts/match-brand.ts` with the context JSON. Returns top-3 ranked candidates with score and reason.
5. **User confirmation**: AskUserQuestion with the 3 candidates (name + tagline + preview hint). User picks one — or asks "more options" → next batch of 3.
6. **Download**: `npx getdesign add <slug>` → `DESIGN.md` lands at root.
7. **Validation**: `npx @google/design.md lint DESIGN.md` → if it fails, surface the error and offer manual fix or retry.
8. **Report**: print a summary ("Generado a partir de `linear-app`, 8 secciones, WCAG AA OK, paleta primary `#1A1C1E` / accent `#B8422E`").

---

## Other paths — quick pointers

- **Path A (manual gallery)**: read `references/gallery-manual.md`. Print URLs (`designmd.ai/explore`, `npx getdesign list`) and let the user navigate. Skill handles download + lint after the user picks.
- **Path C (Open Design)**: read `references/open-design-app.md`. Bring up the Docker stack, wait for the user, then convert the produced artifacts to DESIGN.md via Path E as a bridge step.
- **Path D (Claude Design)**: read `references/claude-design-handoff.md`. Print instructions for `claude.ai/design`, wait for the exported bundle at `design/handoff/`, then convert via Path E as a bridge step.
- **Path E (LLM-authored custom)**: read `references/llm-authored.md`. Generate DESIGN.md from scratch using the embedded spec + `assets/design-md-spec-summary.md` as reference, with Constitution + PRD as input.

---

## Subagent dispatch

This skill normally runs **inline** (Q&A + shell-out via `npx`). Cases where it dispatches to a subagent:

- **Path C (Open Design)**: the post-iteration conversion of the artifact → DESIGN.md is delegated, because it requires reading generated HTML/CSS + synthesis into the spec format. Use the standard briefing template (`agentic-dev-core/references/briefing-template.md`).
- **Path D (Claude Design)**: same — reading the exported bundle and converting needs a subagent.
- **Path E with long Constitution+PRD**: if inputs are extensive (>1.5K lines combined), delegate generation section-by-section to a subagent so the orchestrator's context stays clean.

Matching (Path B) and validation (lint) stay inline — both are cheap and fast.

---

## Hand-offs

After `DESIGN.md` is generated:

- **Return to `/project-foundation`** if the invocation came from there (Phase 2.5). Foundation continues with Phase 3 (SRS), which now can consume the design system as input to architecture decisions (e.g. richness of visuals informs stack choices like Framer Motion vs. plain Tailwind).
- **Available for `/project-bootstrap` frontend-setup**: the bootstrap pre-flight detects `DESIGN.md` and skips the legacy interactive Q&A for palette/typography. Emits `tailwind.config.js` + `globals.css` directly from the frontmatter tokens.
- **Consumable by any downstream agent** (Claude Code, Cursor, Antigravity, OpenCode, etc.) — by sitting at the root with the standard filename, every agent reads it automatically as design-system context.

---

## Verification

After generating `DESIGN.md`, confirm:

- The file exists at the expected path (root or custom `design_md_path` from `.agents/project.yaml`).
- `npx @google/design.md lint <path>` exits 0.
- Frontmatter YAML parses correctly (at minimum `colors`, `typography`, `spacing`, `rounded` are present).
- The 8 prescribed sections are present in the prose (Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts).
- WCAG AA contrast passes for the primary/text pairs reported by the lint output.

If any check fails, surface the failure in the report rather than papering over. Do not invent fixes — ask the user how to proceed (retry with a different brand, run lint:check with `--strict false`, or edit by hand).

On successful completion (all verification items pass), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/design-system/` to `.session/.archive/<YYYY-MM-DD>-design-system-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back.

---

## Anti-patterns — NEVER do these

- **D1.** NEVER hardcode hex color values, font sizes, or spacing values in component code — they belong in `DESIGN.md` frontmatter tokens and are consumed via Tailwind config / CSS variables.
- **D2.** NEVER bypass `DESIGN.md` when answering "what color is X?" / "what's the spacing scale?" — the file is the source of truth, including for the assistant. Read it, do not guess.
- **D3.** NEVER regenerate `DESIGN.md` from scratch when a surgical rebrand suffices — UPSERT existing tokens, preserve section order, do not lose rationale prose.
- **D4.** NEVER ship a token rename without a migration path for component consumers — silent rename breaks every downstream import + `tailwind.config.js` reference.
- **D5.** NEVER override design tokens inline (`style={{ color: '#fff' }}`, `className="text-[#1A1C1E]"`) in components — the escape hatch becomes the rule and the token system rots.
- **D6.** NEVER let a designer hand off a Figma URL alone — require the exported token JSON or a built `DESIGN.md`; design intent must be machine-readable for downstream scaffolds.

---

## Notes

- **Schema status: alpha** (Google Labs). Drift risk is mitigated by always validating with the latest `@google/design.md` via `npx` (no version pin). If the schema changes substantially, update `assets/design-md-spec-summary.md` accordingly.
- **Multi-platform out of scope (v1)**: today `DESIGN.md` assumes web. Mobile (React Native, Flutter) can be added later as a variant (`DESIGN.mobile.md`) without breaking the v1 contract.
- **No `designmd-mcp` in `.mcp.example.json`**: the canonical MCP set stays `[tavily, context7, supabase, n8n]`. If the runtime catalog browse is needed, shell out to `npx designmd search` instead — keeps the token overhead at zero.
- **Brownfield mode**: the skill detects repos without Constitution / PRD and drops into Q&A mode (five questions: industry, tone, target, competitors, keywords) before matching. Same flow works for projects mid-pivot.
- **Config consumed**: `design_md_path` (optional) from `.agents/project.yaml`. Default `./DESIGN.md`.
- The references are written in mixed ES/EN (mirroring the rest of the repo). The orchestrator file (this one) stays in English for cross-team readability.
