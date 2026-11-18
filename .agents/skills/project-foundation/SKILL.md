---
name: project-foundation
description: "Defines a product before code: Constitution, PRD, SRS and discovery docs (business maps, dev guide, glossary). Use when ideating a new product; writing the PRD, personas, MVP scope or SRS; mapping the system and its API; documenting an existing app (discovery only). Not for scaffolding (/project-bootstrap), backlog seeding (/product-management) or story work (/sprint-development)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation
# compact_rules is read verbatim by scripts/build-skill-registry.ts (frontmatter first, no
# truncation). It is the only copy of the F1 to F9 rules; the body points here.
compact_rules: |
  - **F1.** Upsert, never rewrite. When a Constitution, PRD or SRS already exists under `.context/`, refine it in place: keep the earlier decisions and show the diff. A rewrite from scratch throws away decisions people already made.
  - **F2.** Personas, market data and competitor analysis come only from sources the user supplies. With none, leave a `[PLACEHOLDER]` open TODO and ask for the research. A speculative persona misleads every downstream skill.
  - **F3.** The PRD answers what and why (problem, users, journeys, MVP cut). The SRS answers how (functional contracts, NFRs, tech stack, API definitions). Keep them apart, because mixing them breaks traceability.
  - **F4.** Run Phase 4 Discovery (`/project-context data`, `/project-context features`, `/project-context api`, `project-dev-guide`). `/product-management` and `/sprint-development` assume those mental-model docs exist.
  - **F5.** Keep the Constitution vendor-agnostic: no DB engine, hosting provider, auth vendor or framework in it. Tool choices live in the SRS architecture, so the SRS can change without invalidating the strategic anchor.
  - **F6.** Every persona, problem statement and KPI quotes its evidence (user interview, analytics snapshot, stakeholder ask, market-data citation). A claim without evidence looks authoritative and misleads the PRD downstream.
  - **F7.** Every PRD has an explicit out-of-scope section. Implicit scope boundaries leak, and the leak is the top source of mid-sprint argument.
  - **F8.** Seed the SRS architecture's foundational decisions as ADRs in `.context/ADR/`, per `agentic-dev-core/references/adr-doctrine.md`: a decision qualifies when it passes that file's three-gate test (hard to reverse, surprising without context, a real trade-off). Later sessions then neither re-litigate nor silently violate them. Status follows `adr-doctrine.md` §3 step 4: a decision the human already approved is `Accepted` from the start (cite the approval), and only a still-open one is `Proposed`.
  - **F9.** On an app whose code already exists (`.template/installer.lock.json` records `adopted: true`, or the user asks to document an existing app), do not run Phases 1 to 3: they would invent a Constitution, PRD or SRS for code that is already there. Its foundation is Phase 4 Discovery alone, read from the code ("Existing app: Discovery-only foundation"), and a missing PRD or SRS there is not a gap to fill.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and do not substitute silently (the built-in `WebSearch` / `WebFetch` only when the user chooses them).
metadata:
  kind: workflow
  stage_owner: true
  requires_capabilities: [db]
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Project foundation: product definition

`project-foundation` runs the one-time, up-front definition of a product: why we are building it (Constitution), what we are building (Architecture: PRD and SRS) and how the system maps to its world (Discovery). It produces the documents every later skill assumes exist.

Run it once per project, at inception, before infrastructure scaffolding (`/project-bootstrap`) and backlog seeding (`/product-management`). When scope changes substantially mid-project, re-run only the phases that changed.

---

## Dependencies

Requires `agentic-dev-core`. Loaded on demand:

- `agentic-dev-core/references/briefing-template.md` and `dispatch-patterns.md`: the 7-component briefing, and the Single, Sequential or Parallel choice for each phase.
- `agentic-dev-core/references/orchestration-doctrine.md` and `session-management.md`: the main thread is the command center, plus the Phase 0 resume contract, plan-first persistence at `.session/project-foundation/` and the archive on completion.
- `agentic-dev-core/references/adr-doctrine.md`, Phase 3 only: which decisions earn an ADR and how to seed the first batch.

User-level skills, called with the Skill tool where a step says so: `grilling` (Phases 1 and 2) and `domain-modeling` (Step 6). When one is not installed, ask the same questions as a numbered list with your recommended answers, say in the report that the skill was missing, and carry on. A person can type `/grill-with-docs` for a document-aware interview; this skill never loads it.

---

## Inputs: read these first, in this order

Read in order and stop early when the phase you drive is small enough that later inputs add no signal. Several inputs are optional at inception: report a `missing_input` note instead of inventing content.

1. The stakeholder brief or initial PRD draft: whatever the user gives as the seed (paste, doc link, voice-memo transcript).
2. `.context/PRD/`, the existing PRD outputs of a prior version. Re-invoking a phase refines what is there (F1).
3. `.context/business/`, the existing personas, business model and market context. Surface what is there and never invent replacements.
4. Market or competitor research the user provides (links, PDFs, analyst notes). Optional, and the most useful input to Phase 1.
5. `.agents/project.yaml`, the project identity (name, key, domain, env URLs). Create or refine it in this pass when it is missing.

---

## When to use

- A new product is defined from scratch: Constitution, PRD, SRS and Discovery.
- An existing project redefines its scope (a pivot, a new MVP cut) and the foundation docs must be regenerated.
- One section is missing or stale: run just that phase from the Specific tasks table.
- An existing app (adopted through `/project-adoption`, or code with no PRD or SRS) needs its foundation: Phase 4 Discovery only, per "Existing app: Discovery-only foundation".

Scaffolding goes to `/project-bootstrap`, backlog seeding to `/product-management`, one story to `/sprint-development`, unit tests to `/unit-testing`. Formal QA workflows are out of scope.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 0.5 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

The skill is project-scope, so there is no `<scope>` segment. Session state lives directly at `.session/project-foundation/{plan.md, progress.md}` (`agentic-dev-core/references/session-management.md` §3 and §9).

## Phase 0 (resume check, inline)

Before any dispatch or phase, run the resume contract of `agentic-dev-core/references/session-management.md` §4, inline with no subagent. It runs on a first invocation too, so resume versus fresh never depends on memory.

1. Check whether `.session/project-foundation/progress.md` exists. If not, go to Phase 0.5.
2. If it does, read `plan.md` in full and the last three phase entries of `progress.md`, then tell the user the plan's Goal, the last completed phase with its timestamp, the next planned phase and any blocking notes.
3. Offer three options and wait: resume (jump to the next planned phase), restart (archive the directory to `.session/.archive/<YYYY-MM-DD>-project-foundation-project-aborted/`, then Phase 0.5 fresh) or abort (leave it untouched and stop). "With nobody at the keyboard" says who answers when no person is present.

## Phase 0.5 (write `plan.md`)

Once Phase 0 finds no prior session, write `.session/project-foundation/plan.md` per `agentic-dev-core/references/session-management.md` §6, recording which sub-deliverables the user picked across Constitution, PRD, SRS and Discovery.

- Frontmatter: `topic_key: session/project-foundation/project/plan`, `skill: project-foundation`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections, in this H2 order: `## Goal`, `## Inputs`, `## Approach`, `## Phase breakdown` (Phase 1 Constitution, Phase 2 PRD, Phase 2.5 DESIGN hand-off, Phase 3 SRS, Phase 4 Steps 1 to 6, each row with its dispatch pattern), `## Risks & open questions`, `## Verification checklist`, `## Cross-references`.
- `## Cross-references` carries a hand-off note: Phase 2.5 goes to the separate `/design-system` skill, which owns `.session/design-system/`, and the `project-context` modes of Phase 4 manage their own checkpoints. This skill's `progress.md` records only the orchestrator-level "delegated" and "returned" entries.

A single planner subagent is typical when the Constitution and PRD inputs are substantial, and the orchestrator drafts the plan inline when the scope is tiny. When the user approves the scope, change `status` from `draft` to `approved` and start Phase 1.

## Phase walkthrough

Four sequential phases (1 Constitution, 2 PRD, 3 SRS, 4 Discovery), with the Phase 2.5 hand-off to `/design-system` between PRD and SRS. Each phase has several sub-deliverables, and you read only the references the current task needs.

> **Progress checkpoint**: after each of Phase 1, Phase 2, Phase 2.5 (when the hand-off returns), Phase 3 and Phase 4 Steps 1 to 6, the orchestrator appends a phase entry to `.session/project-foundation/progress.md` per `agentic-dev-core/references/session-management.md` §7.

### 1. Constitution (why we are building this)

The Constitution states the rationale before any scope decision: the problem worth solving, who it serves, how it earns money and the competitive context. Without it the PRD has no anchor.

- `references/constitution-business-model.md` is the canvas template (problem, solution, value proposition, customer segments, channels, revenue model, cost structure, key metrics).
- `references/constitution-market-context.md` covers industry positioning, competitive analysis and trends.

Call the Skill tool with "grilling" when a founding answer is vague or overloaded (the product, the user, the money, the scope) and walk its questions in rounds, each with a recommended answer, before writing a claim from that answer.

Output: `.context/business/business-model.md` and `.context/business/market-context.md` (or wherever the project keeps strategic context).

### 2. Architecture: PRD (Product Requirements Document)

The PRD turns the Constitution into a buildable spec: the formal problem statement, the target users, the MVP slice and the user journeys end to end.

- `references/prd-executive-summary.md`: problem statement, solution overview, success KPIs, MVP success metrics.
- `references/prd-personas.md`: target users, demographics, jobs to be done, pain points.
- `references/prd-mvp-scope.md`: epic breakdown, must-have, should-have and could-have stories, the MVP cut.
- `references/prd-user-journeys.md`: happy paths, alternate flows and edge cases per persona.

Call the Skill tool with "grilling" for any persona, KPI or scope answer that is vague or overloaded, with the same rounds and recommended answers as in Phase 1.

Output: `.context/PRD/*.md` (one file per sub-deliverable, or a consolidated `prd.md`).

### 2.5 Design system (visual identity)

Before closing Architecture, hand off to `/design-system` to produce `DESIGN.md` at the project root: palette, typography, spacing and components in a portable format every downstream agent reads. It replaces the old interactive Q&A inside `frontend-setup.md`.

- The default path is `npx getdesign` plus an LLM matcher driven by the Constitution and PRD. `.agents/skills/design-system/SKILL.md` lists all five paths.
- Skip it when `DESIGN.md` already exists at the root and the user did not ask for a rebrand.

It sits between PRD and SRS because the visual identity grows with the product idea, and some architecture decisions follow from it (a motion-rich Framer Motion stack against plain Tailwind). Phase 3 can then use `DESIGN.md` as input.

Output: `DESIGN.md` at the project root (or the path under `design_md_path` in `.agents/project.yaml`).

### 3. Architecture: SRS (Software Requirements Specification)

The SRS turns the PRD into a technical contract: formal functional requirements, non-functional constraints, system architecture decisions and the API contract. `/project-bootstrap` consumes it to scaffold the codebase.

- `references/srs-functional.md`: formal functional requirements, one section per epic, traceable to PRD stories.
- `references/srs-non-functional.md`: performance, security, scalability, reliability and accessibility requirements.
- `references/srs-architecture.md`: the architecture diagram, tech stack rationale, data model and deployment topology.
- `references/srs-api-contracts.md`: OpenAPI endpoint definitions per domain.

Seed the first ADRs. The architecture phase is where most hard-to-reverse decisions get made (auth model, data-access pattern, error and response contract, tenancy, deployment topology, framework choices with lock-in). Once `srs-architecture.md` is drafted, promote each decision that passes the three-gate test of `adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off, after the architectural-scope screen) into a standalone `ADR-NNNN-<slug>.md` under `.context/ADR/`, then link them from the architecture doc. `agentic-dev-core/references/adr-doctrine.md` covers detection and authoring, and `.context/ADR/README.md` has the template and lifecycle. A decision the human already approved (it is in the PRD or SRS they signed off) is written `Accepted` and names that approval. A still-open one is `Proposed`.

Output: `.context/SRS/*.md`, the seeded `.context/ADR/ADR-NNNN-*.md` records and an updated `.context/ADR/README.md` index.

### 4. Discovery (codify the system mental model)

Discovery produces the docs every later skill loads at session start: the entity map, the feature inventory, the API map and a conversational dev guide. Together they make a fresh session productive on day one.

Phase 4 is an orchestrator with six steps. It delegates to four `project-context` modes, each also runnable alone from any session as `/project-context <mode>`, and runs two steps in-skill: the dev guide (Step 4) and the domain glossary (Step 6). Re-running one mode after a schema or feature change is the supported way to maintain these docs.

**Step 1, business data map** (entities, business flows, state machines, automatic processes, external integrations). Invoke skill `project-context` mode `data` (pointer: `references/business-data-map.md`). Output: the data map inside `business-data-context` (`references/business-data-map.html`).

**Step 2, business feature map** (feature inventory by domain, CRUD matrix, endpoint catalog, UI component inventory, third-party integrations, feature flags). Invoke mode `features`. Soft gate: do Step 1 first. A placeholder data map makes the mode warn, not block. Output: the feature map inside `business-feature-context` (`references/business-feature-map.html`).

**Step 3, business API map** (auth model, critical user journeys traced through API call chains, the architecture behind the API, integrations at the API boundary). Invoke mode `api`. The pointer `references/api-architecture.md` keeps its legacy name so old greps still find it, and the mode writes the map inside `business-api-context` instead. Steps 1 and 2 inform it and do not block it. Output: the API map inside `business-api-context` (`references/business-api-map.html`).

**Step 4, project dev guide** (a conversational onboarding guide for any developer, human or AI, joining the project). Read `references/project-dev-guide.md` and run it in-skill: no `project-context` mode covers it, because its content belongs only to the foundation flow. Hard prerequisite: the Step 1 data map is generated (`bun run context:map business-data-context` prints sections, not the placeholder notice). Output: `.context/business/project-dev-guide.md`.

**Step 5, master implementation plan** (a bonus: the roadmap of everything to build, dependency-cascaded and value-prioritized, the natural synthesis of Steps 1 to 3). Invoke mode `master-plan`. Hard gate: the Step 1 data map is generated. Soft gate: the Step 2 feature map is generated (`bun run context:map business-feature-context`). Output: `.context/master-implementation-plan.md`. The step is recommended and optional: skip it when the user has not defined product scope (a greenfield with only a Constitution), and re-run it after `/product-management` has seeded the backlog to align the plan with the epics.

**Step 6, domain glossary** (the canonical vocabulary every later artifact speaks). It runs once, seeded from the PRD (personas, product terms) and the SRS when they exist, the Step 1 to 3 maps and existing ADRs. An existing app adds the sources listed under "Existing app: Discovery-only foundation".

- Output: `.context/business/domain-glossary.md`, structured as §0 a read-first clarification of the most confused term (optional), §1 a core acronyms table (term, expansion, one-line definition), §2 methodology terms, §3 product entities (short forms that point to the data map in `business-data-context`), §4 an anti-glossary (banned or ambiguous terms, the replacement, why), §5 the change protocol (the glossary is updated first, in the same PR; it wins doc conflicts; Jira content must match it).
- Call the Skill tool with "domain-modeling" when a term is fuzzy, or two documents use it differently. It names one canonical term, lists the words to avoid and writes the term to the glossary the project already keeps, in the structure above, which wins over the skill's default format. The glossary holds vocabulary only, never decisions or scratch notes. Terms the PRD and SRS already settle go in, and a term you inferred alone goes to the report as proposed.
- After this step the glossary is hand-maintained and append-only, like ADRs. Re-running `/project-foundation` does not regenerate it: when the file exists, skip the step and say so. Every domain term later used in Jira content, docs, code comments and UI copy matches it.

When the plan's verification checklist passes, the orchestrator archives per `agentic-dev-core/references/session-management.md` §8: it moves `.session/project-foundation/` to `.session/.archive/<YYYY-MM-DD>-project-foundation-project/` and calls `mem_session_summary` with the archive path, so a later `mem_search` can find its way back.

---

## Existing app: Discovery-only foundation

An app whose code already exists has no product to define: its foundation is what the code does, written down. The business maps, the dev guide and the domain glossary are its product docs, and `/sprint-development` accepts them in place of a PRD and SRS (see its Pre-requisites).

This applies when `.template/installer.lock.json` records `adopted: true` (the key `project-context` reads), or when the user asks to document an existing app with no `.context/PRD/` or `.context/SRS/` content. A project that has a PRD and SRS keeps the full chain above.

| Phase | Existing app |
|---|---|
| 1 Constitution, 2 PRD, 3 SRS | Not run (F9). A team that holds real product docs may hand them in, and nothing is invented to fill a phase |
| 2.5 Design system | Not run from here. `DESIGN.md` from the live theme is `/design-system extract`, optional and its own skill |
| 4 Steps 1 to 3, and 5 | The `project-context` modes, which read the code and the `stack:` block (`project-context`, "Stack parameters"). `/project-adoption` hands off `/project-context refresh-all` first, and a map that `bun run context:map <skill> --list` shows as generated is refreshed through its own mode when stale, not regenerated |
| 4 Step 4 dev guide | Reverse-engineered: layout, conventions and commands come from the app's code, `package.json` and the `stack:` block, never from this boilerplate's defaults |
| 4 Step 6 glossary | Seeded from the maps, the code's identifiers, the live UI copy, existing ADRs and the tracker's epic names. Skipped when the file exists |

Capability `db` is optional on this path. The data map reads the schema per `{{stack.database.schema_source}}` (`migrations` means the files, read offline; `{{stack.database.engine}}` set to `none` means no database), so a project with no DB MCP or no live access gets a Discovery Gap named in the data map, and the run goes on.

The seed is the code, not a stakeholder brief, so Inputs 1 and 4 are optional. Phase 0.5 writes `discovery-only` in `## Approach` and Phase 4 alone in `## Phase breakdown`. Hand off to `/product-management` for the backlog and `/sprint-development` per story, never to the `/project-bootstrap` base phases.

---

## Specific tasks: which reference to read

| User intent | Read |
|---|---|
| Constitution, business model canvas | `references/constitution-business-model.md` |
| Market analysis, competitive context | `references/constitution-market-context.md` |
| PRD executive summary, problem statement, KPIs | `references/prd-executive-summary.md` |
| User personas, target users | `references/prd-personas.md` |
| MVP scope, epic breakdown, must-have stories | `references/prd-mvp-scope.md` |
| User journeys, happy path, edge cases | `references/prd-user-journeys.md` |
| Design system, `DESIGN.md`, branding | hand off to `/design-system` (Phase 2.5) |
| Functional requirements | `references/srs-functional.md` |
| NFRs: performance, security, scalability | `references/srs-non-functional.md` |
| System architecture, tech stack, system diagram | `references/srs-architecture.md` |
| Record an ADR | `agentic-dev-core/references/adr-doctrine.md` and `.context/ADR/README.md` |
| API contracts, OpenAPI, endpoint definitions | `references/srs-api-contracts.md` |
| Business data map, entity model | `/project-context data` (pointer: `references/business-data-map.md`) |
| Business feature map, feature inventory, CRUD matrix | `/project-context features` |
| API architecture discovery, endpoint catalog, auth model | `/project-context api` (pointer: `references/api-architecture.md`) |
| Project dev guide, developer onboarding | `references/project-dev-guide.md` |
| Master implementation plan, roadmap | `/project-context master-plan` |

When no row matches, pick the closest phase, use its most relevant reference and say in the report that no exact match was found.

---

## Subagent dispatch

Phases 1 to 4 run in sequence, because each consumes the previous output. Sub-deliverables inside a phase are often independent:

- Phase 2: `prd-personas`, `prd-user-journeys` and `prd-mvp-scope` run in parallel once `prd-executive-summary` is drafted.
- Phase 3: the four SRS references run in parallel once the PRD is locked.
- Phase 4: Steps 1 to 3 run one at a time in the `project-context` dependency order, `data`, then `features`, then `api` (canonical list: `project-context` SKILL.md, "`refresh-all` dependency order"), because `features` and `api` read the data map and every mode closes its own approval gate first. Step 4 needs only Step 1 and may run alongside Steps 2 and 3. Step 5 synthesizes Steps 1 to 3. Step 6 seeds from the PRD, the SRS and those maps, and closes the phase.

Use the parallel pattern of `agentic-dev-core/references/dispatch-patterns.md`. Each briefing follows the 7-component template in `agentic-dev-core/references/briefing-template.md` and names the one reference the subagent reads. Research-heavy work (market sizing, competitor audits, persona interviews) goes to a single subagent with web and search tools, not to the main conversation.

---

## Hand-offs

- `/project-bootstrap` turns the SRS architecture and API contracts into a backend and frontend skeleton.
- `/product-management` turns the PRD MVP scope into Jira epics, stories and refined acceptance criteria.
- `/sprint-development` implements stories once `/project-bootstrap` is done.

Foundation output is documentation, not code: it ends at "ready for `/project-bootstrap`".

---

## Verification

After any phase, confirm:

- The deliverables for that phase exist at the expected paths under `.context/`.
- Each document follows the structure of its reference file (sections, headings, tables).
- Cross-references are wired: PRD personas appear in the user journeys, SRS functional requirements trace to PRD epics, and API contracts trace to SRS architecture decisions.
- `bun run vars:check` surfaces no new unresolved `{{VAR}}` reference from the new docs.

A section left as `[PLACEHOLDER]` because the user could not yet answer (no real user-research data, say) goes into the report as an open TODO. It is never filled with invented content.

---

## With nobody at the keyboard

A person starts this skill and it runs once per project, so `/autonomous-delivery` never runs it. A supervised worker or a routine can, and neither waits. The rule is `agentic-dev-core/references/decision-protocol.md` §5.2: a worker's conductor holds each gate, and a routine takes the delegating brief as the answer when the brief covers the decision. Without that cover it does the reversible work, stops before any outward action and reports. This skill writes only local files (`.context/`, `.session/`, `DESIGN.md`), so a stop here means "do not invent content".

| Gate | A person is present | A supervised worker | A routine with nobody |
|---|---|---|---|
| Phase 0 resume, restart or abort | the user picks | the conductor picks | the brief picks, else resume and say earlier state was found |
| Phase 0.5 scope and plan approval | the user approves | the conductor approves | the brief covers it. Else write the plan as `draft`, stop and report, since a new product's scope comes from its founders. An existing app's scope is Discovery-only, so approve it and go on |
| Missing research or evidence (F2, F6) | ask the user | ask the conductor | leave the `[PLACEHOLDER]`, report it as an open TODO, carry on |
| Vague founding answer (grilling) | the interview runs in rounds | the questions go to the conductor | follow grilling's own "With nobody at the keyboard" lines: each question and recommended answer goes into the plan and the report, with the assumptions named |
| Fuzzy domain term (domain-modeling) | the skill's own question | the conductor decides | write only terms the PRD, SRS, code or tickets already settle, and mark every other candidate as proposed in the report |
| User-level skill not installed | the numbered-list fallback | the same, reported to the conductor | the same, answered by the brief's assumptions |
| `DESIGN.md` missing at Phase 2.5 | hand off to `/design-system`, then return | report to the conductor | report the hand-off as pending and continue to Phase 3 |
| ADR status | `Accepted` only with a cited human approval, else `Proposed` | the conductor confirms an approval | `Proposed`, and say so |
| A `project-context` mode's approval gate | the mode asks the user | the conductor answers | the mode's own nobody path |
| Capability missing (`db`, `library-docs`, `web-search`) | one-message stop per `mcp-capabilities.md` §4 | the message goes to the conductor | skip the dependent step, do the rest, report (on an existing app `db` is optional) |
| `.agents/project.yaml` missing | tell the user to install the layer | report to the conductor | stop and report |

---

## Rules

The F1 to F9 rules live once, in `compact_rules` in the frontmatter, and the references cite them by code.

- Reports mirror the user's language. Every document this skill writes into the repo is English, as are the reference templates.
- The skill consumes `{{PROJECT_NAME}}`, `{{PROJECT_KEY}}` and `{{WEBAPP_DOMAIN}}` from `.agents/project.yaml`. When that file is missing the agentic layer is not installed: `bunx create-agentic-dev@latest <name>` for a new project, or `bunx create-agentic-dev@latest --adopt` then `/project-adoption` for an existing app (`agentic-dev-core`, Install model).
- The Discovery modes work on greenfield projects, where they encode decisions, and on brownfield ones, where they reverse-engineer the code. Re-invoke one mode when only one artifact needs refreshing.
