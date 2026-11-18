---
id: context-map
title: "Context loading map: task to what to load"
load_when: "starting a task and deciding which skill to load and which context to read, or locating a key path (business maps, ADRs, design plan, roadmaps, PBI tree)"
triggers: ["\\bonboard", "\\bPRD\\b", "\\bSRS\\b", "design system", "mockup", "scaffold", "\\badopt", "testability", "\\bepic\\b", "backlog", "roadmap", "\\bADR\\b", "business[- ](?:data |feature |api )?maps?", "glossary"]
paths: [".context/"]
---

# Context loading map: task to what to load

> Section `context-map` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 4. Context loading map: task to what to load

Before answering a task, name its type, load the matching skill, then read the context the table lists. For scripts and commands, read `package.json` directly (Rule #10). Skills and sections load by meaning, so a prompt in any language matches the same row as its English equivalent.

### Which skill for X

When the request is a goal and not yet a skill name, pick by intent. The skill's own `SKILL.md` is the authority on what it does; this list only points.

| You want to | Start with |
|---|---|
| Learn the repo, or you are lost | `/agentic-dev-onboard` |
| Define the product (PRD, SRS, discovery), or document an existing app | `/project-foundation` |
| Define the design system, or design one screen | `/design-system` |
| Scaffold the backend, frontend, auth and env of a new app | `/project-bootstrap` |
| Bring an existing app under this setup after the `--adopt` install | `/project-adoption` |
| Seed a backlog, refine stories and ACs, write the sprint report | `/product-management` |
| Build a story from plan to production | `/sprint-development` |
| Write a unit test, or drive a change test-first | `/unit-testing` |
| Deliver work on a schedule with nobody at the keyboard | `/autonomous-delivery` |
| Give QA a testability page and credentials | `/testability-guide` |
| Refresh the business maps, the master plan or the dev roadmap | `/project-context` |
| Fan work out to several sessions | `/orca-orchestration` |
| Branch, commit, push or open a PR | `/git-flow-master` |
| Review someone's PR | `/pr-review-lead` |
| Reconcile Jira Components, or repoint the Jira host | `/jira-administration` |
| Continue in a fresh session | `/session-handoff` |
| Change the agent instructions | `agentic-dev-core` reference `instructions-doctrine.md` |

### Full map

| Task | Trigger phrase | Load skill | Read context | Primary tool |
|---|---|---|---|---|
| First-time orientation | "onboard me", "first time using this" | `/agentic-dev-onboard` | (the skill loads its own context) | - |
| Foundational definition (PRD, SRS, discovery) | "define the PRD", "ideate a new product", "document the existing app" | `/project-foundation` | `business/`, `PRD/`, `SRS/` | Read + Write |
| Design system (DESIGN.md) | "define the design system", "rebrand the project", "extract the design system from the code" | `/design-system` | `business/business-model.md`, `PRD/` | Write |
| Screen design for one story (mockup) | "there is no mockup for this story", "design this screen" | `/design-system` (screen phase) | `DESIGN.md`, `design/master-design-plan.md` §2, §4, §8 | Open Design / Claude Design |
| Infra scaffolding (backend, frontend) | "scaffold the project", "set up the API routes" | `/project-bootstrap` (base phases are greenfield only; add-ons read `stack:`) | `bun run bootstrap:guard` verdict, `SRS/architecture-specs.md`, `DESIGN.md` | Code edit |
| Adopt an existing app (after the `--adopt` install) | "adopt this app", "the adoption is installed", "adoption drift check" | `/project-adoption` (`adopt`, `check`) | `.template/installer.lock.json`, `.agents/project.yaml` `stack:`, the adoption parity rows | Read + `bun run agents:setup --stack` |
| QA testability page and credentials artifact | "create the QA guide page", "credentials for testing", "update the /qa page" | `/testability-guide` | the `/qa` page snapshot under `stack.app_root` (route per `stack.framework`), `.agents/project.yaml` `stack:`, `.mcp.json` | Read + Write + `[ISSUE_TRACKER_TOOL]` |
| Backlog or story refinement | "create an epic", "refine the acceptance criteria" | `/product-management` | `.context/PBI/epic-tree.md`, `PRD/`, `business/domain-glossary.md` | `[ISSUE_TRACKER_TOOL]` |
| Sprint-development ticket | "implement this story", "work on UPEX-XXX" | `/sprint-development` | `.context/PBI/epics/EPIC-*/stories/STORY-*/`, `business/domain-glossary.md`, `DESIGN.md` and `.context/design/master-design-plan.md` (UI stories: Rule 14) | `[ISSUE_TRACKER_TOOL]` + `[AUTOMATION_TOOL]` |
| Orchestrate several sessions (fleet of workers) | "orchestrate", "fleet", "one session per story", "parallelize the sprint", "resume the run", "talk to the worker" | `/orca-orchestration` | `.agents/project.yaml` `orchestration:` block (defaults); the skill loads its own references | `[ORCHESTRATION_TOOL]` (gate: binary plus reachable runtime; silent when absent) |
| TDD slice or unit tests | "write unit tests", "TDD this function" | `/unit-testing` | the function under test, existing tests | Code edit |
| Sync AI memory, docs drift | "sync memory", "sync docs", `sync-ai-memory` | `agentic-dev-core` reference `docs-follow-through.md` | `README.md`, `AGENTS.md`, `.context/`, `package.json` | Edit + `bun run docs:check` |
| Edit the agent instructions (L0, a section, the router, triggers) | "edit AGENTS.md", "add a rule", "where does this rule go", "tune the triggers", "new instruction section", "measure route recall" | `agentic-dev-core` reference `instructions-doctrine.md` | `.agents/instructions/README.md`, the section that owns the topic, `cli/lib/fixtures/instruction-router-eval.json` | Edit + `bun run instructions:check` (`bun run instructions:audit` to measure) |
| Business map refresh | "refresh the data map", `business-*-map` | `/project-context` (`data`, `features`, `api`) | the Supabase schema, backend code, PRD, the map via `bun run context:map <skill> --list` | Read + Write |
| Read a business map | "how is X stored", "which route does Y", "where does this story fit", "open the map" | `business-data-context`, `business-feature-context`, `business-api-context` (loaded by aspect) | `bun run context:map <skill>` (`--section <id>`, `--open` for a human) | `bun run context:map` |
| Git or PR work | any git intent | `/git-flow-master` (loads by meaning) | `git status`, `git log` | `git` + `gh` |
| Browser action | "screenshot", "trace", "record" | `/playwright-cli` | - | Playwright CLI |
| Jira operation | "Jira issue", "transition the story" | `/acli` | `.agents/jira-required.yaml`, `.agents/jira-fields.json` | CLI |
| Jira admin (components, instance move) | "sync jira components", "the Jira URL changed", "repoint jira" | `/jira-administration` (one mode per run) | `.agents/project.yaml`, `.agents/jira-required.yaml`, `.agents/jira-*.json` | `scripts/sync-jira-components.ts` + `jira:sync-*` |

### Key paths

- Business maps are HTML inside `business-data-context`, `business-feature-context` and `business-api-context` (`references/*-map.html`). Read them with `bun run context:map <skill>`, never raw. `/project-context data`, `features` and `api` generate them and update them section by section. Doctrine: `agentic-dev-core/references/business-context-maps.md`. A project's old `.context/business/business-*-map.md` is legacy generator input and is never deleted.
- `.context/business/domain-glossary.md` holds the canonical domain terminology. It is hand-maintained and append-only (like ADRs), `/project-foundation` Phase 4 Step 6 creates it, and `/sprint-development` and `/product-management` consult it before planning or writing ACs. Its anti-glossary lists the banned terms. Nothing regenerates it.
- `.context/master-implementation-plan.md` is the prioritized roadmap at epic and strategy level, owned by `/project-context master-plan`.
- `.context/dev-roadmap.md` is the ticket-level dependency roadmap: which story unblocks which, in what execution sprint, gated by which mockup. `/project-context dev-roadmap` owns it, and it subsumes the former `.context/PBI/sprint-sequence.md`.
- `.context/design/master-design-plan.md` holds per-screen fidelity specs, the US-to-screen map (§8), the frozen-token pointer (§2) and the divergence register (§5). The `/design-system` screen-mapping phase (opt-in) builds it, `/sprint-development` consumes it for every UI story (Rule 14), and a re-run upserts without wiping.
- `.context/designs/<project-slug>/<batch-slug>/` is the screen-mockup drop zone: `BRIEF.md` (the portable design brief `/design-system` generates) plus the bundle the user exports from Claude Design or Open Design. It is distinct from `design/handoff/` at the root, which is the Path D system-token bundle that becomes DESIGN.md.
- `.context/ADR/` holds the Architecture Decision Records, append-only. Record any important, hard-to-reverse architecture decision (auth model, error, data-access or tenancy model, framework lock-in, cross-cutting invariant) as `ADR-NNNN-<slug>.md`, and supersede instead of deleting. When to write one and the template: `.context/ADR/README.md`; how the AI detects and authors one: `.agents/skills/agentic-dev-core/references/adr-doctrine.md`. `/project-foundation` (SRS) and `/sprint-development` (Stage 1) seed them. Bug fixes, local refactors and naming tweaks do not get one.
- `.context/reports/SPRINT-{N}-DEVELOPMENT.md` is the cross-ticket dev tracker per sprint, generated and updated by `/sprint-development` batch mode.
- `.context/PBI/epics/EPIC-<KEY>-<slug>/` is epic level: `epic.md` [SYNC], `feature-implementation-plan.md` and `feature-test-plan.md` [SYNC], `stories/`.
- `.context/PBI/epics/EPIC-*/stories/STORY-<KEY>-<slug>/` is story level: `story.md` plus per-field [SYNC] files, and `context.md`, `progress.md` and `evidence/` [LOCAL].
- `.agents/project.yaml` is the source of truth for `{{VAR}}`. Load it once per session and cache it.
- `.agents/jira-fields.json`, `jira-workflows.json` and `jira-required.yaml` are the Jira catalogs.
