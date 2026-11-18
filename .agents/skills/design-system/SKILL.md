---
name: design-system
description: 'Writes DESIGN.md (Google Labs spec) for a product''s visual identity, and designs one story''s screen just in time. Use when defining or rebranding the design system; extracting DESIGN.md from an app''s code (extract); or when a story has no mockup (design brief, master design plan). Opt-in only. Not for frontend code (project-bootstrap).'
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation
complementary_categories:
  - frontend-ui
  - accessibility
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). The "Anti-patterns" section in the body keeps the rule codes other files cite.
compact_rules: |
  - **D1.** Keep hex colours, font sizes and spacing values out of component code. They live in `DESIGN.md` frontmatter tokens and reach components through the Tailwind config or CSS variables.
  - **D2.** Answer "what colour is X?" and "what is the spacing scale?" by reading `DESIGN.md`. The file is the source of truth, for the assistant too, so a guess is never an answer.
  - **D3.** Rebrand surgically: upsert the tokens that change, keep the section order and the rationale prose. Regenerating from scratch loses both.
  - **D4.** Ship a token rename with a migration path for its consumers. A silent rename breaks every downstream import and `tailwind.config.js` reference.
  - **D5.** Do not override tokens inline (`style={{ color: '#fff' }}`, `className="text-[#1A1C1E]"`). The escape hatch becomes the rule and the token system rots.
  - **D6.** Accept a designer's hand-off only as exported token JSON or a built `DESIGN.md`, never a Figma URL alone. Downstream scaffolds need design intent a machine can read.
  - **D7.** Run the screen phase only on an explicit user opt-in, and take every mockup from a design tool: supplied by the user into `.context/designs/<project>/` (Mode B), commissioned through the Open Design MCP and exported there (Mode A, see `references/screen-design-mapping.md` S1), produced by Claude Code's own `design` skill, or generated as HTML through a loaded design skill (Mode C: the design set loaded before the first line of HTML, `agentic-dev-core/references/skill-composition-strategy.md` §3.5). The orchestrating AI never writes mockup markup itself with no design skill loaded. A prototype that settles one logic question is inspiration only, never a mockup or a spec. A human ratifies every mockup, whatever produced it.
  - **D8.** In `extract` mode, copy the LIVE theme and nothing else: pick no catalog brand, invent no token, write no application code. `DESIGN.md` mirrors `tailwind.config.*`, the stylesheet the root layout imports and `components.json`, each value in its own CSS format with a `# <file> <selector>` provenance comment. A kind the code lacks is omitted and reported as a Discovery Gap. Only `DESIGN.md` (plus an accepted variant) and `.session/design-system/` may change. Lint must reach `errors: 0`, and a sub-AA warning the app ships is reported, never fixed in the token (`references/extract-from-code.md`).
  - **D9.** Feature UI lives in `src/features/<x>/`, and shared primitives (the components built from the tokens) live in the design system (`agentic-dev-core/references/guard-architecture.md` §1).
metadata:
  kind: workflow
  stage_owner: true
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # design decisions benefit from strong reasoning
  matcher: sonnet        # mechanical brand selection
  generation: opus       # LLM-authored DESIGN.md from scratch
  validation: haiku      # lint runner
-->

# Design System: DESIGN.md generation orchestrator

`/design-system` writes a portable `DESIGN.md` at the project root, following the Apache-2.0 spec from Google Labs (`google-labs-code/design.md`). The file holds the product's visual identity in a format that every AI agent (Claude Code, Cursor, Antigravity, OpenCode and others) reads automatically as the canonical design system.

It runs once per project, after the PRD and before the SRS, as part of `/project-foundation`. It runs again on demand when the business pivots or wants a rebrand without re-scaffolding. The output is committed, and `/project-bootstrap` frontend-setup consumes it as declarative input in place of the old palette, typography and components Q&A.

The skill can also produce a second artefact, `master-design-plan.md`, that maps externally produced screen mockups to user stories, so `/sprint-development` builds each UI story against its agreed screen. The two artefacts split cleanly: `DESIGN.md` is the design system (tokens and components), `master-design-plan.md` is screen design (per-screen specs and the US to screen map).

The screen phase is always opt-in. The AI asks every time, and the mockups always come from a design tool: an external one, or the AI's own HTML generated through a loaded design skill. When the Open Design MCP is available, the AI commissions the runs itself, checks them and exports the results into the drop zone (Mode A). Otherwise it hands the user a brief and pauses (Mode B). Either way a human ratifies every mockup before it is mapped, and the mockup stays inspiration: at build time the live UI plus the `DESIGN.md` tokens are the fidelity reference (`AGENTS.md` Critical Rule #14). Full procedure: `references/screen-design-mapping.md`.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand:

- `agentic-dev-core/references/briefing-template.md`, when dispatching to a subagent (Open Design or Claude Design handoff conversion).
- `agentic-dev-core/references/dispatch-patterns.md`, to select Single, Sequential or Parallel for the chosen path.
- `agentic-dev-core/references/orchestration-doctrine.md`: subagent dispatch is mandatory, and the main thread is the command center.
- `agentic-dev-core/references/session-management.md`: the Phase 0 resume contract, plan-first persistence at `.session/design-system/`, archive on completion.

Optional inputs, which inform the matcher and the custom generation:

- `.context/business/business-model.md`: industry, value proposition, implied tone.
- `.context/PRD/personas.md`: visual target and demographic signal.
- `.context/PRD/executive-summary.md`: positioning and success KPIs.

An app that already has its theme in code (an adopted, brownfield app) needs none of these: the `extract` mode reads the live theme. When the inputs are missing and the code has no theme either (a first-time user), the skill asks for industry, tone, target, competitors and keywords directly before going on.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any path below, following `agentic-dev-core/references/skill-composition-strategy.md`.

1. Read `complementary_categories` from this skill's frontmatter (`frontend-ui`, `accessibility`).
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each matched skill's tier per strategy doc §2.
4. Apply the threshold rule of strategy doc §3.2. T1 and T3 matches load silently and are cached for the session. For a T4 match, ask once: `"Detected <skill> (T4). Apply for this design-system work? Y/N"`, and cache the answer.
5. When dispatching sub-agents (Open Design conversion, Claude Design handoff, LLM-authored custom DESIGN.md), inject a `## Composable Skills` block per strategy doc §5.2.

Expected matches (illustrative; the real list depends on what the user has installed):

| Category        | Likely matches                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend-ui`   | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `design-taste-frontend`, `redesign-existing-projects` (T3) |
| `accessibility` | `accessibility` (T3)                                                                                                                                               |

The screen phase loads the design set at the step that writes a screen (Mode C below), whatever the entry scan decided (`agentic-dev-core/references/skill-composition-strategy.md` §3.5). `modern-web-guidance` sits next to that set and owns platform correctness (native features, Baseline fallbacks), while the design set owns visual direction.

If neither the session skill list nor the `.agents/skills/` folder can be read, skip the scan and log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (strategy doc §3.4).

---

## When to use

Use this skill when:

- A new project has finished the PRD and needs a visual identity before the SRS architecture phase.
- An existing project wants to rebrand without touching the Constitution, the PRD or the code.
- An existing app adopted agentic-dev and its theme already lives in code (`tailwind.config.*`, the global stylesheet, `components.json`). That is the `extract` mode: it writes `DESIGN.md` from the live tokens instead of asking for a brand.
- A team wants its design tokens in one portable format that several AI agents can consume.
- A specific story needs a screen and no mockup covers it. This is the screen phase (below), invoked standalone, per story, when the story is picked up, and not up front for the whole product. The missing-row gate of `/sprint-development` routes here, and a person can also invoke it directly.

It is not the place for these:

- UI and component implementation belong to `/sprint-development` plus the design set (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- The PRD and personas belong to `/project-foundation` phases 2.x.
- Scaffolding the frontend (Tailwind install, page skeletons, shadcn setup) belongs to `/project-bootstrap` frontend-setup.
- Tweaking tokens after scaffolding is a direct edit of `DESIGN.md`, followed by the bootstrap pre-flight.

## Mode routing

Two phases, three modes. When the first token of `$ARGUMENTS` is one of these names, it picks the mode (`/design-system screen UPEX-123` on Claude Code, "load design-system, mode screen" in prose on OpenCode and Codex). Otherwise the request decides: a story that needs a screen is `screen`, an existing app whose identity already lives in its code is `extract`, and a brand, token or DESIGN.md request for a product with no theme yet is `tokens`. Still unclear: ask.

| Mode | Trigger phrases | Section |
|---|---|---|
| `tokens` | define the design system, DESIGN.md, rebrand, design tokens | Path selection → Default flow (Path B) / Other paths |
| `extract` | extract DESIGN.md from the code, existing app, adopted app, brownfield theme | The extract mode → `references/extract-from-code.md` |
| `screen` | no mockup for this story, design this screen, `/sprint-development` missing-row gate | The screen phase |

---

## Output

- `DESIGN.md` at the project root (path configurable through `design_md_path` in `.agents/project.yaml`, default `./DESIGN.md`).
- Format: the Apache-2.0 spec from Google Labs (`google-labs-code/design.md`), with YAML frontmatter for the design tokens and markdown prose for the rationale.
- Eight prescribed sections, in this order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. A section may be omitted but never reordered.
- Validated with `npx @google/design.md lint <path>` before exit, WCAG AA contrast included.
- In the `extract` mode the frontmatter mirrors the app's live theme files, one provenance comment per value, and nothing outside `DESIGN.md` is written.
- When `DESIGN.md` already exists, the skill offers three choices: skip (keep the current file), overwrite, or variant (write `DESIGN.<slug>.md` alongside, for light and dark or A/B branding).
- Opt-in: `master-design-plan.md` at `.context/design/`, with per-screen fidelity specs and a user-story to screen map built from the mockups in `.context/designs/<project>/`. Produced only when the user opts in and mockups are present. See `references/screen-design-mapping.md`.
- Opt-in: `BRIEF.md` per batch at `.context/designs/<project>/<batch-slug>/`, a portable design brief the user pastes into the external tool when no mockups exist yet. Generated from `references/screen-design-brief.md`; it doubles as provenance for the returned bundle.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) always run.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used and dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

This skill is project-scope, so there is no `<scope>` segment. Session state lives directly at `.session/design-system/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 and §9.

The resume case that matters most is Paths C (Open Design app) and D (Claude Design at `claude.ai/design`). Both pause for external user action, and without a persistent session the skill cannot tell on resume whether it stopped in Path C waiting for Open Design artifacts or in Path D waiting for the exported bundle. Phase 0 plus `progress.md` make those paths survive an interruption.

## Phase 0 (resume check, inline)

Before any path selection or subagent dispatch, run the resume contract of `agentic-dev-core/references/session-management.md` §4.

1. Check whether `.session/design-system/progress.md` exists.
2. If it does not, go to Phase 1 and write `plan.md` during path selection.
3. If it does:
   1. Read `.session/design-system/plan.md` in full (it records the chosen path and the completed steps).
   2. Read the tail of `.session/design-system/progress.md`, the last three entries or so. For Paths C and D this is where "waiting for external work" was recorded.
   3. Tell the user the chosen path, the last completed step, the next planned step and any blocking note (for example "waiting for exported artifact at `design/handoff/`").
   4. Offer three options and wait for the answer: resume (continue from the next planned step), restart (archive the current directory to `.session/.archive/<YYYY-MM-DD>-design-system-project-aborted/`, then run Phase 1 fresh, useful when the user switched paths), or abort.

Phase 0 is inline, with no subagent dispatch. With nobody to answer, see "With nobody at the keyboard" below.

## Phase 1: write `plan.md` (during path selection)

Path selection also writes `.session/design-system/plan.md`, using the schema of `agentic-dev-core/references/session-management.md` §6.

- Frontmatter: `topic_key: session/design-system/project/plan`, `skill: design-system`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections, in this H2 order: `## Goal`, `## Inputs` (PRD personas, business-model, the existing `DESIGN.md` if any), `## Approach` (the chosen path, A to E, or the `extract` mode, with the rationale), `## Phase breakdown` (the steps of "Default flow" for Path B, or the path's own checklist for the others), `## Risks & open questions`, `## Verification checklist` (lint passes, frontmatter parses, 8 sections present, WCAG AA OK) and `## Cross-references` (`.context/business/business-model.md`, `.context/PRD/personas.md`, the `DESIGN.md` target path).

An inline draft is the normal case because the inputs are short. A single planner subagent is worth it only when the LLM-authored path (E) has to ingest a very long Constitution and PRD.

Once `plan.md` is written and the user confirms the chosen path, move `status: draft` to `approved` and proceed.

> **Progress checkpoint**: write a `progress.md` entry per default-flow step (1 to 8 of Path B). For Paths A, C, D and E the checkpoints are "path chosen", "external work in progress" (C and D wait for the user: record `status: started` and say in `notes` what is awaited), "DESIGN.md committed" and "lint passed". All checkpoints follow `agentic-dev-core/references/session-management.md` §7.

## Path selection

Five paths exist. Path B (`getdesign` plus an LLM matcher) is the default because it runs without manual effort. The other four are opt-in.

| Path                                         | When to pick                                                                                                | Reference                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **A: Gallery manual**                         | User wants to browse and pick without the AI deciding. Free, no auth.                                       | `references/gallery-manual.md`        |
| **B: `getdesign` + LLM-matcher** (default)   | PRD exists + you want something off-the-shelf with good quality and zero manual effort. Free, no auth.      | `references/getdesign-matcher.md`     |
| **C: Open Design app**                        | You want to iterate visually in a local UI before locking tokens. Desktop app, no Docker needed. Free, OSS. | `references/open-design-app.md`       |
| **D: Claude Design**                          | You have Claude Pro+ and want best-in-class quality. Requires manual action at `claude.ai/design`. Premium. | `references/claude-design-handoff.md` |
| **E: LLM-authored custom**                    | Business is very specific and no off-the-shelf matches. Generate from scratch using the Google Labs spec.   | `references/llm-authored.md`          |

How to choose:

1. The user names nothing: start with B. When the matcher's top three do not convince, offer A or E.
2. The user wants to see options: A.
3. The user wants a custom design, rejects every catalog brand or has a very niche business: E.
4. The user says "Claude Design" or "Anthropic Labs": D.
5. The user says "Open Design", "nexu-io", "desktop app" or "Docker": C.

Paths C and D both bridge into Path E for the real DESIGN.md conversion. The visual iteration happens in the external tool, and the final markdown follows the Google Labs spec through the LLM-authored path.

---

## Default flow (Path B, getdesign matcher)

Summary only; the full procedure is in `references/getdesign-matcher.md`.

1. Pre-flight: verify that `npx` is available and warn if it is not.
2. Context load: read `.context/business/business-model.md`, `.context/PRD/personas.md` and `.context/PRD/executive-summary.md`. When none exist, fall back to a Q&A on industry, tone, target, competitors and keywords.
3. Catalog fetch: `npx getdesign list --json` returns the brand catalog with tags and descriptions.
4. Matching: run `scripts/match-brand.ts` with the context JSON. It returns the top three candidates with score and reason.
5. User confirmation: AskUserQuestion with the three candidates (name, tagline, preview hint). The user picks one, or asks for more options and gets the next three.
6. Download: `npx getdesign add <slug>` puts `DESIGN.md` at the root.
7. Validation: `npx @google/design.md lint DESIGN.md`. On failure, surface the error and offer a manual fix or a retry.
8. Report: a summary such as "Generated from `linear-app`, 8 sections, WCAG AA OK, primary `#1A1C1E` / accent `#B8422E`".

---

## Other paths

- Path A (manual gallery): read `references/gallery-manual.md`. Print the URLs (`designmd.ai/explore`, `npx getdesign list`) and let the user navigate. The skill downloads and lints once the user picks.
- Path C (Open Design): read `references/open-design-app.md`. Install or launch the desktop app (Docker is an alternative, not a requirement), wait for the user, then convert the produced artifacts to DESIGN.md through Path E as a bridge step.
- Path D (Claude Design): read `references/claude-design-handoff.md`. Print the instructions for `claude.ai/design`, wait for the exported bundle at `design/handoff/`, then convert it through Path E as a bridge step.
- Path E (LLM-authored custom): read `references/llm-authored.md`. Generate DESIGN.md from scratch with the embedded spec and `assets/design-md-spec-summary.md` as reference, taking the Constitution and PRD as input.

---

## The extract mode: DESIGN.md from a live app

For an app that already has a visual identity in its code (an adopted, brownfield app). The five paths above all produce an identity; this mode records the one that exists. Full procedure: `references/extract-from-code.md`.

1. Locate the live theme from evidence: `components.json` points to `tailwind.css` or `tailwind.config`, then the stylesheet the root layout imports, the installed Tailwind major and the `next/font` calls. Dead copies are listed, never read as tokens.
2. Read the tokens statically, never by executing the config: CSS variables become `colors` with the value's own format kept (bare shadcn channels re-wrapped the way the config wraps them), then fonts, type scale, radius (computed, because the linter rejects `calc(...)`), spacing, and the `components/ui/*` default variants as token references. Every value carries a `# <file> <selector>` provenance comment.
3. A kind the code does not define stays absent: omit it and report a Discovery Gap. A dark palette becomes an offered `DESIGN.dark.md` variant.
4. Write only `DESIGN.md`. A stub is overwritten; real content gets a token diff and an upsert, variant or skip choice. Application code is read-only, so `git status` must show nothing else.
5. Lint to `errors: 0`. Warnings describe the live app: a sub-AA pair is reported and recorded in Do's and Don'ts, never fixed in the token.

This mode has no catalog, no `npx getdesign` and no Q&A on industry or tone, and it never hands off to `/project-bootstrap` frontend-setup, which would regenerate the live theme files from their own echo.

---

## Subagent dispatch

The skill normally runs inline (Q&A plus shell-out through `npx`). It dispatches to a subagent in three cases:

- Path C (Open Design): converting the artifacts to DESIGN.md means reading generated HTML and CSS and synthesising the spec format. Use the standard briefing template (`agentic-dev-core/references/briefing-template.md`).
- Path D (Claude Design): same, because reading the exported bundle and converting it needs a subagent.
- Path E with a long Constitution and PRD (over about 1.5K lines combined): delegate the generation section by section, so the orchestrator's context stays clean.

Matching (Path B) and validation (lint) stay inline, since both are cheap and fast.

---

## The screen phase: per-story design, invoked standalone (always opt-in)

This is a separate event from the token phase, and it runs at a different time. The token phase (`DESIGN.md`) happens once, up front, before scaffolding, and it is the frozen contract. The screen phase happens per story, just in time, when that story is picked up for development. It usually starts from the missing-row gate of `/sprint-development`, or from whoever is about to build the screen.

Opt-in does not mean minor. It is the normal path for any story whose screen nobody has drawn yet.

### Why just in time, and the one case where it is wrong

Designing every screen up front assumes a dedicated designer hands finished screens to an implementer. That split has largely collapsed: once the token system is frozen, composing a screen is mostly assembly against a fixed contract, and the agent or developer who builds the screen composes it. Designing all screens before the stories are refined produces mockups for requirements that then change.

The exception is a design decision that is irreversible or that changes the story's scope. That is a product decision wearing a design costume, and just in time means whoever happens to be coding decides it. A destructive-action confirmation dialog is the deletion policy, so drawing it first silently picks the policy. When a screen encodes a decision of that kind, ratify it in an ADR before the mockup (see the host repo's ADR doctrine). Routine screen composition goes just in time. A scope-changing or irreversible screen is ratified first.

### What the phase produces

After `DESIGN.md` is ready, or when the skill is invoked standalone, it always asks whether to also map per-screen designs into a `master-design-plan.md`. It never runs this on its own. The full procedure, gating, drop zone, US to screen mapping, the plan's section layout and the tool-delegation contract live in `references/screen-design-mapping.md`.

When a screen encodes a rule you cannot yet judge from a picture (a state machine, a pricing or permissions model, a flow with several modes), a throwaway logic prototype can settle that one question before the mockup is commissioned. It answers one question, it is one file a non-developer can click through, it is labelled as a prototype, and it is deleted or kept on a throwaway branch. Its result goes into the ADR or the story. A prototype is never a mockup and never a spec, and it never replaces the four methods below: the look of a screen still comes only from Open Design, Claude Design, Claude Code's `design` skill or the design set.

Source: https://github.com/mattpocock/skills (engineering/prototype), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

### Methods for producing the screens, in order of preference

Hand-writing HTML is never the first resort. Pick the highest method available in the session and say which one ran in the batch's `BRIEF.md`.

1. Open Design MCP (Mode A, preferred). The AI commissions one run per screen, checks each result and exports it into the batch folder. It has the highest fidelity to the token package and the least human round trip.
2. Claude Design or any external prototyper (Mode B). Hand the generated brief to the user to paste in, then pause with session resume.
3. Claude Code's own `design` skill, where the session has it. It produces a canvas of `.dc.html` artboards the user can refine visually, which helps when the user wants to push pixels after generation.
4. AI-generated HTML through design skills (Mode C). The AI writes the screen HTML itself, but only with the design set loaded for the job, before the first line of HTML: `frontend-design`, `ui-ux-pro-max`, `impeccable` and `emil-design-eng`, plus `redesign-existing-projects` when the screen redesigns an existing one and `design-taste-frontend` when it is a public marketing page (`agentic-dev-core/references/skill-composition-strategy.md` §3.5). The loaded skills are what make it a design tool. Name them in `BRIEF.md`, keep every value inside the frozen token contract, export into the batch folder, and the user ratifies the result at step 4 like any other mockup. When a member of the set is not installed, say so once with the install path and continue with the rest (§3.5). With none of the set loaded, this method does not exist.

When none of the four is available, stop and do not hand-author the mockup (D7). Markup an agent writes to fill a gap looks exactly like a design artifact but was never designed, and everyone downstream then cites it as the spec. The legitimate route is a spec-only build ratified as a §5 divergence, which belongs to the missing-row gate of `/sprint-development` (options b and c there), not to this skill. Building straight from `DESIGN.md` tokens is a valid outcome. Calling the result a mockup is not.

Whichever method runs, the boundary is the same: never invent a colour, font, spacing step or radius outside the frozen token contract.

Quick shape:

1. Ask (AskUserQuestion): map screens into a master design plan? Yes, No or Not now. No means skip.
2. If `.context/designs/<project>/` is empty, generate a portable design brief (`references/screen-design-brief.md`), save it as `BRIEF.md` in the batch folder, then delegate.
   - Mode A (preferred): the Open Design MCP is available, or preflight can bring it up (`references/open-design-app.md`). The AI commissions one run per screen, checks and exports the results into the batch folder, and the user ratifies the exported screens at step 4.
   - Mode B (fallback): hand the brief to the user to paste into Claude Design or Open Design, then pause with session resume (as Paths C and D do).
   - Mode C: no MCP, but the design set (strategy doc §3.5) is loaded. The AI generates the HTML screens through it into the batch folder, and the user ratifies them at step 4.
3. Build `.context/design/master-design-plan.md` from the mockups and the backlog: per-screen specs, a frozen-token reference to `DESIGN.md`, a US to screen map and a divergence register.
4. Ratify and confirm with the user before writing. A human approves every mockup (commissioned, supplied or generated through a design skill) before it enters the map. Re-runs upsert, which makes the phase incremental and just in time per feature.

---

## With nobody at the keyboard

A supervised worker sends these questions to its conductor, which holds the gate. A routine with nobody takes the paths below (`agentic-dev-core/references/decision-protocol.md` §5.2). For this skill:

| Gate | A routine with nobody |
|---|---|
| Phase 0 resume, restart or abort | Resume. Never restart or abort on your own, and note the choice in `progress.md`. |
| Confirming the chosen path | Take Path B, or the path the delegating brief names. Record it in `plan.md`. |
| Picking one of three matcher candidates | Take the top-ranked one when its score is 0.4 or higher, and record its score and reason. Below 0.4, record the gap and stop with a report (Path E needs a person). |
| `DESIGN.md` exists: skip, overwrite or variant | Write a variant (`DESIGN.<slug>.md`). Never overwrite. |
| No Constitution, PRD or theme to read | Record the gap and stop with a report. Do not invent a brand. |
| Paths C and D wait for external work | Record `status: started` with what is awaited, then stop and report. |
| A T4 composable skill | Skip it and record that it was skipped. |
| The lint fails | Report the failure and stop. Do not paper over it. |
| The screen phase (opt-in, human ratification) | An unattended run never starts it. A story with no screen row takes the spec-only path of the missing-row gate in `/sprint-development`. |

`/autonomous-delivery` never waits for a person, so it never calls the screen phase.

---

## Hand-offs

After `DESIGN.md` is generated:

- If the invocation came from `/project-foundation` (Phase 2.5), return there. Foundation continues with Phase 3 (SRS), which can now use the design system as an input to architecture decisions (richer visuals can favour Framer Motion over plain Tailwind, for example).
- After the `extract` mode, never hand off to `/project-bootstrap` frontend-setup: the live theme files are the implementation, and regenerating them from `DESIGN.md` would overwrite them (`references/extract-from-code.md` §8).
- For `/project-bootstrap` frontend-setup (the `tokens` mode on a new project), the bootstrap pre-flight detects `DESIGN.md` and skips the old palette and typography Q&A. It emits `tailwind.config.js` and `globals.css` straight from the frontmatter tokens.
- Any downstream agent (Claude Code, Cursor, Antigravity, OpenCode and others) reads `DESIGN.md` automatically, because it sits at the root under the standard filename.
- When the screen phase ran, `master-design-plan.md` is a mandatory input for any UI story in `/sprint-development`: it looks the story up in the US to screen map, opens the screen spec and builds against the mockup plus the `DESIGN.md` tokens. Without it, `/sprint-development` falls back to `DESIGN.md`-only fidelity.

---

## Verification

After generating `DESIGN.md`, confirm each of these:

- The file exists at the expected path (the root, or a custom `design_md_path` from `.agents/project.yaml`).
- `npx @google/design.md lint <path>` exits 0.
- The frontmatter YAML parses and has at least `colors`, `typography`, `spacing` and `rounded`.
- The 8 prescribed sections are in the prose (Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts).
- WCAG AA contrast passes for the primary and text pairs the lint output reports.
- The `extract` mode differs in three ways. Sections and token kinds the code does not define are omitted and reported as Discovery Gaps, not filled. A contrast warning the live app ships is reported and recorded in Do's and Don'ts, not fixed. And `git status --porcelain` lists nothing outside `DESIGN.md`, an accepted variant and `.session/design-system/`.

When a check fails, put the failure in the report. Do not invent a fix: ask the user how to proceed (retry with a different brand, run lint with `--strict false`, or edit by hand).

When every item passes, the orchestrator archives per `agentic-dev-core/references/session-management.md` §8: it moves `.session/design-system/` to `.session/.archive/<YYYY-MM-DD>-design-system-project/` and calls `mem_session_summary` with the archive path, so a later `mem_search` can navigate back.

---

## Anti-patterns

The full wording of each rule is in the frontmatter `compact_rules`, which is the copy briefings receive. This list keeps the codes other files cite.

- D1. Hardcoded hex, font-size or spacing values in component code.
- D2. Answering a token question without reading `DESIGN.md`.
- D3. Regenerating `DESIGN.md` from scratch when a surgical rebrand suffices.
- D4. A token rename with no migration path for consumers.
- D5. Inline token overrides in components.
- D6. A Figma URL accepted as the whole hand-off.
- D7. Auto-running the screen phase, or hand-authoring a screen mockup with no design skill loaded. The sanctioned sources are the four methods above. When no tool is available the answer is a spec-only build ratified as a §5 divergence, never markup invented here and filed as a design artifact. A logic prototype is inspiration only (see "What the phase produces").
- D8. Choosing a catalog brand, inventing a token or writing application code in `extract` mode.
- D9. Feature UI outside its feature folder, or a shared primitive inside one feature.

---

## Notes

- Schema status: alpha (Google Labs). Validating with the latest `@google/design.md` through `npx`, with no version pin, contains the drift risk. If the schema changes substantially, update `assets/design-md-spec-summary.md`.
- Multi-platform is out of scope for v1. `DESIGN.md` assumes the web, and mobile (React Native, Flutter) can arrive later as a variant (`DESIGN.mobile.md`) without breaking the v1 contract.
- There is no `designmd-mcp` in `.mcp.example.json`, and the committed MCP set stays whatever `.mcp.json` declares. When a runtime catalog browse is needed, shell out to `npx designmd search`, which keeps the token overhead at zero.
- Brownfield: an existing app whose theme lives in code goes to the `extract` mode, never to a catalog brand. The Q&A fallback (industry, tone, target, competitors, keywords) is for a project with no Constitution or PRD and no theme in code, or one mid-pivot that wants a new identity.
- Config consumed: `design_md_path` (optional) from `.agents/project.yaml`, default `./DESIGN.md`.
