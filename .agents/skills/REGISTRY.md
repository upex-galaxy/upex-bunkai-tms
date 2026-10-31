# Skill Registry (auto-generated)

> Generated: `2026-10-31T05:12:44.509Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.agents/skills/agentic-dev-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 39

---
## Skill: acli

**Purpose**: Atlassian CLI (official `acli` binary) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal.

**Compact Rules**:
- **T1.** NEVER hand-author raw ADF JSON for descriptions, comments, or rich-text custom fields. Use `scripts/md-to-adf.ts` — deterministic, diffable, snake_case-safe, and avoids the combined-marks bug (inline `code` co-occurring with `strong`/`em` causes HTTP 400).
- **T2.** NEVER hardcode Jira `customfield_NNNNN` IDs in scripts or AI output that consumes `acli`. Resolve via the host project's slug catalog (see the host repo's `acli-integration.md`). IDs differ per workspace; slugs travel.
- **T3.** NEVER assume `acli` accepts custom-field input on `workitem edit`. It hard-rejects every shape (`additionalAttributes`, `fields`, flat `customfield_X`) with exit 1. Use the REST `PUT /rest/api/3/issue/{KEY}` workaround documented above — there is no acli-native path.
- **T4.** NEVER run a bulk `acli` mutation (transition, edit, comment, link, archive) without first verifying `acli jira auth status`. Silent auth expiry cascades into HTTP 401s mid-loop, leaving the batch half-applied with no clean rollback.
- **T5.** NEVER write a rich-text value (description, comment, rich-text custom field) without measuring its serialized ADF first: `jq -c . <file>.adf.json | wc -m` must stay at or under 30000. Jira's 32,767-character cap counts the ADF JSON, not the Markdown. Over budget → STOP and propose which sections move where; never truncate, never split one value across two fields. Detail: "Size budget" under "Publishing rich text".
- **`--paginate` is opt-in.** Default limit is server-side (30–50 depending on command). No warning on truncation. If you are counting, iterating, or making decisions based on the result, pass `--paginate`.
- **Custom fields on `workitem create` go through `additionalAttributes` in `--from-json`.** Numeric IDs only (`customfield_NNNN`), no name-addressing. Documented value shapes in the `create` template are: `{"value": "..."}` (single-select), bare number, bare string. **`workitem edit` actively REJECTS custom-field input — hard error, exit 1, not a silent drop** (empirically confirmed across `additionalAttributes`, `fields`, and flat `customfield_X` shapes). For editing custom-field values on existing items, the **only** working path is REST `PUT /rest/api/3/issue/{KEY}` via `curl` using the session env vars — see the "WORKAROUND" subsection in "Publishing rich text" above, plus `references/gotchas.md` §4 and `references/workitem.md`.
- **`acli` cannot enumerate custom fields.** `acli jira field` only does create/update/delete/cancel-delete. To discover field IDs, use `workitem view --json | jq` against an item that has the field set, or call `GET /rest/api/3/field` directly. There is no in-CLI listing. Host repos typically cache the catalog under `.agents/` and resolve fields by slug — see `<repo-core>/references/acli-integration.md`.
- **Transitions match by status name, not transition ID.** When two transitions lead to the same status with different validators, the CLI picks one and may fail. No `--transition-id` escape hatch exists — fall back to REST if this hits.
- **Trace IDs are the only debug signal.** An `unexpected error, trace id: XXXXXXXX` line is all you get on backend failures. Capture and log the trace ID always; Atlassian Support needs it.
- **`workitem link create` flag names are misleading — `--out` and `--in` are EMPIRICALLY INVERTED relative to Jira's outward/inward semantics.** Running `acli jira workitem link create --out X --in Y --type Dependencies` produces "**Y** depends on **X**" — NOT "X depends on Y" as the flag names suggest. Y becomes the outward party (the one that performs the outward verb, e.g. "depends on" / "blocks" / "causes"); X becomes the inward party. Confirmed empirically against Dependencies; the same inversion applies to ALL outward-asymmetric link types (Blocks, Blocking, Causes, Duplicate, Cloners, Defect, Test, Test Automation, Test Design, Test Execute). Symmetric types (Relates) are immune — direction is lost either way. **Reverse-mapping rule of thumb**: `--out` takes the PREREQUISITE (the inward partner in Jira's UI); `--in` takes the DEPENDENT (the outward partner in Jira's UI). **Mandatory verification after every link create**: run `acli jira workitem link list --key <expected-dependent> --json` and confirm the response shows `outwardIssueKey: <expected-prerequisite>`. If the direction is wrong, delete the link and recreate with swapped flags. Deep recipe + per-type mapping table → `references/workitem.md`.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/acli/SKILL.md` · phase: `unknown` · kind: `utility` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- `agentic-dev-core` does not:
- Provide a bootstrap or init action — the layer installs whole: `create-agentic-dev` for a new project, `create-agentic-dev --adopt` then `/project-adoption` for an existing app.
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
- Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
- Adapt the framework to a specific stack (that belongs to `/project-bootstrap` on a new project, `/project-adoption` on an existing app).
- Sync project-specific facts in `AGENTS.md` (that belongs to the docs follow-through, `references/docs-follow-through.md`, run inside the change that moved the fact).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).
- Run any external command — no `bun install`, no `git`, no `gh`.
- Secret hygiene (Critical Rule #1, binds every skill and subagent): use a secret only by its variable NAME (`$VAR` in the shell, a name in the MCP loader's `--filter` list); never open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, never print a value (`printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`); check presence with `bun run setup:doctor --json` (set / missing per name); never run `varlock load`, even `--agent`, against a schema `bun run vars:schema:check` has not passed (a scratch schema is banned: `--agent` redacts only `@sensitive` items). The AI never writes a secret into `.env` (the human types it); a non-sensitive value (URL, project key, flag, port) it may write when asked, only through `bun run env:set KEY=value`. Safe command shapes + leak response: `references/secret-hygiene.md`.
- Instructions maintenance (ADR-0014, binds every skill and subagent): every change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list follows `references/instructions-doctrine.md`: place each sentence with its §2 decision tree, run its §6 procedure, close with `bun run instructions:check`. NEVER paste section prose into `AGENTS.md`, NEVER add, change or remove a router row without the ADR that decides it (`bun run instructions:check --accept-router ADR-NNNN`), and fix a trigger miss in the section's `triggers:` plus a labelled prompt in `cli/lib/fixtures/instruction-router-eval.json`, never by relabelling the set.
- Documentation contracts (ADR-0017, binds every skill and subagent that changes this boilerplate): close every change that adds, renames or retires a skill, a `package.json` script or a doc path, OR changes a behaviour a page describes, with the docs follow-through (`references/docs-follow-through.md`), decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) included, in the same PR. WHEN an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line): update EVERY page its `LINT.ThenChange(...)` names in the same push. Only when the documented behaviour did not change, add `Docs-Checked: <label> <reason>` to a commit message; NEVER add it by reflex or without a reason. Pre-push and CI block otherwise. A drift found later gets a new marker. WHEN the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`: run the drift sweep (follow-through §6) after the verification gates, report-only. It greps the doc surface for prose that describes the OLD behaviour and counts the `Docs-Checked:` trailers the change used.
- Sweep pending decisions (SPD, ADR-0019, binds the session the human types into: a top-level conductor, a super-conductor, an independent worker): when a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), ask ALL of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option; no tool or refused → a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) NEVER asks the human: no question tool, no `mkd` deck, no sweep; it sends what `references/decision-protocol.md` §5 escalates (§5.1 applied) and every error or blocker it cannot clear to its launcher (blocking `ask`, `escalation`, or a `BLOCKED: ` status without a dispatch), which relays, unless the human typed that request into its own session or its brief grants it in writing (then it tells its launcher what it asked and the answer). Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/agentic-dev-core/SKILL.md` · phase: `foundation` · kind: `core` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-onboard

**Purpose**: Walks new users through this repo's dev flow — which entry path the repo took (new project scaffolded by /project-bootstrap, or an existi...

**Compact Rules**:
- Use `library-docs` (Context7) for "how to use X" — official docs, current API
- Use `web-search` (Exa or Tavily, connected at harness level) for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)
- What this skill does NOT do:
- Implement features → use `/sprint-development`
- Write unit tests → use `/unit-testing`
- Refine acceptance criteria → use `/product-management`
- Define a brand-new product → use `/project-foundation`
- Scaffold backend / frontend code → use `/project-bootstrap` (greenfield only: `bun run bootstrap:guard` refuses its base phases on an existing app)
- Teach the agentic layer an existing app → use `/project-adoption`
- Generate the in-app `/qa` page + credentials artifact → use `/testability-guide`
- Entry path: `.template/installer.lock.json` with `adopted: true` = adopted app (tour the adoption hand-off, never `/project-bootstrap` base phases); otherwise a new project. Stack facts come from `.agents/project.yaml` → `stack:`, never from this skill's defaults.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/agentic-dev-onboard/SKILL.md` · phase: `foundation` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: autonomous-delivery

**Purpose**: SCHEDULED / UNATTENDED entry point for a delivery run with no human on the line.

**Compact Rules**:
- **Git is the source of truth; the tracker is a hint.** A ticket shipped only when `git merge-base --is-ancestor <mergeCommit> <integration-branch>` succeeds. A status of ready-for-QA, done, or merged proves nothing — merge automation commonly fires on ANY pull request merge, including a chain's internal ones. Never advance a dependency on a status flip.
- **`<integration-branch>` is read, and may be the production branch.** It is `git_strategy.branches.integration`, or `git_strategy.branches.production` when that is null (`solo-main`, `github-flow`, `trunk-based`): every ancestry check, base check and merge-in runs against it, and a null integration never ends a run. With a null integration this run never merges: the dispatched ticket stops at an open PR with its preview deployment verified, because the merge to production is `/sprint-development` Stage 5, a human-gated event. App commands, branches and database changes follow `/sprint-development` → `## Stack parameters` (`{{stack.*}}`); capability `db` binds only a ticket that touches the database.
- **`git fetch` immediately before every ancestor or fast-forward check, unconditionally.** A merge performed through the host's API updates the real ref at once; your remote-tracking ref updates only on the next fetch. "I fetched a few minutes ago" has produced a confident, wrong answer.
- **One lock per mode, never a queue.** A live lock for your mode means another run owns it: exit cleanly with a report. Do not wait, do not queue, do not run anyway. A lock older than `lock_staleness_minutes` is abandoned — reclaim it and log the reclamation.
- **An empty run is a correct outcome.** Nothing genuinely unblocked means stop and say so. Selecting marginal work to avoid an empty report is the failure this phase exists to prevent.
- **A story that gets a `master-design-plan.md` §8 US->Screen row gets a `.context/dev-roadmap.md` entry in the SAME change — both files or neither.** The §8 row alone gives a story a design contract while leaving it invisible to the execution order that schedules it. Seven recorded instances; six were hand-patched downstream by a later run instead of fixed at the source.
- **Caps are hard: `story` 1 per run, `bug` 3 sequential (each fully closed before the next), `discovery` writes no code.** Every measured story became a multi-thousand-line change; two do not fit in one run's context.
- **Write the handoff as you go, never at the end.** A run that exhausts its context cannot write up why. Checkpoint after every phase and after every completed slice.
- **When context runs low, push the branch FIRST, then record resume state, then stop.** Unpushed commits in a disposable worktree are the only unrecoverable loss in this system. A clean mid-work handoff is a success; a mid-ticket death with unpushed work is the failure to design against.
- **Applying a schema change to shared infrastructure is irreversible and hits every concurrent agent.** Under `migrations: confirm` (default) it stops for approval, stating target and additive-vs-destructive. Under `migrations: autonomous` it proceeds for ADDITIVE changes only and still stops for anything that drops, renames, or rewrites a live object. Composing the change (and its file, when `{{stack.database.migrations_tool}}` keeps one) is always autonomous; applying it is not. HOW it is applied (the DB MCP, or the app's own tool for `prisma` / `drizzle`) is `agentic-dev-core/references/db-change-doctrine.md`; this gate decides only WHETHER.
- **Read the migration history through the DB MCP immediately before composing a schema change** (and take any file's number or version from it), never from a local directory listing. The ledger can be ahead of your branch by a peer's unmerged migration, and behind no file you can list.
- **Read regenerated output before committing it.** Types, clients, and API specs generated from a shared live instance silently absorb a concurrent sibling's unmerged schema. Diff it; strip foreign entries after proving zero consumers.
- **Give every dispatched agent its own worktree.** A background subagent writes into its dispatcher's working directory by default, outlives its dispatcher, and keeps mutating shared state after the dispatcher is gone. Fixing this after `git status` looks wrong is too late.
- **Never rebase a branch a subagent already pushed** — merge the base in instead (`git checkout -B <branch> origin/<branch> && git merge <integration-branch> --no-edit`). Rebasing forces a force-push, which is a history rewrite on pushed work.
- **An unmapped transition is a flag, never a guess.** Nobody is on the line to answer the fallback question, so when a transition slug the run needs is absent from `.agents/jira-workflows.json` (or Jira rejects a mapped one on a validator), fire nothing, leave the issue where it is, and name the slug, the live candidates and the recommended `bun run jira:sync-workflows` in the run report. Never a remembered id, never a status-name guess, never an invented field value (`agentic-dev-core/references/artifact-lifecycle.md` §4 step 6, §4.2).
- **Green tests are not evidence the feature works.** Fixtures that seed the column the code reads, rather than the column production writes, keep every test green over a dead data path. Require at least one assertion against a real production write path before calling an acceptance criterion covered.
- **Editing a skill's rules does nothing until the registry is regenerated** (`bun run skills:registry`). The registry is what reaches a subagent briefing; a rule that never reached the briefing never reached any executor.
- **Decide technical calls yourself, after searching the record.** Follow `agentic-dev-core/references/decision-protocol.md`: search -> follow if settled -> scored judge panel if genuinely novel -> escalate ONLY product, novel security posture, irreversible, and whatever the operator reserved. Record every autonomous decision where the NEXT run's Phase 1 will find it.
- **Whether a PRODUCT call escalates is per-project config, not a constant.** Read `decision_authority.product` in `.agents/project.yaml`. `escalate` (default, and the correct default) means it stops the run. `decide` means there is no human PO: dispatch a scored decision subagent, publish the ruling to the ticket under a heading naming the deciding profile, resync, and continue — never style it as human sign-off. Categories 2-4 escalate under both settings. Method: `decision-protocol.md` §5.1.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: you are running any phase of a scheduled run, a gate fires, or the briefing tells you to load the full skill.

> Source: `.agents/skills/autonomous-delivery/SKILL.md` · phase: `implementation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: business-api-context

**Purpose**: What the API of the product under development MEANS to the business: the auth model (Supabase Auth, sessions, roles), every route group (...

**Compact Rules**:
- DO: read the map through `bun run context:map business-api-context` (or `--section <id>` for one route group or journey). NEVER read `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `api`; never add a route as if the API were empty.
- DO: take field names, types and required flags from the OpenAPI types (`bun run api:sync`, `@schemas/{domain}.types`), and the MEANING from the map. On a conflict the spec wins for shape, the running API wins for behaviour.
- WHEN a session observes something that contradicts a section (a status, a field, an auth rule): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no generated types, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a route, OpenAPI or auth dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-api-context/SKILL.md` · phase: `unknown` · kind: `context` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: business-data-context

**Purpose**: What the product under development IS at the data level: business entities and why they exist, their relationships, RLS policies and who...

**Compact Rules**:
- DO: read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). NEVER read `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `data`; never plan a migration as if the schema were empty.
- DO: cite a fact with its section id and `data-updated` date. A section older than the migration it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- WHEN a session observes something that contradicts a section (a column, a policy, a trigger): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no migration, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment (a rule for READING the data) goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a migration, RLS or seed dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-data-context/SKILL.md` · phase: `unknown` · kind: `context` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: business-feature-context

**Purpose**: What the product under development DOES for its users, feature by feature: the feature catalog grouped by module, the CRUD matrix (which...

**Compact Rules**:
- DO: read the map through `bun run context:map business-feature-context` (or `--section <id>` for one feature or module). NEVER read `references/business-feature-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `features`; never place a story as if the product had no features.
- DO: take how a screen LOOKS from the live UI and the master design plan (`AGENTS.md` Rule 14), and what a feature DOES from the map. On a conflict the running app wins for behaviour.
- WHEN a session observes something that contradicts a section (a CRUD action, a role gate, a page the inventory lacks): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no design file, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-dev-core/references/mcp-capabilities.md` §4.

**Read full SKILL.md when**: building a briefing for a UI, CRUD or navigation dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-feature-context/SKILL.md` · phase: `unknown` · kind: `context` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: deploy-to-vercel

**Purpose**: Deploy applications and websites to Vercel.

**Compact Rules**:
- `.vercel/project.json` — created by `vercel link` (single project linking). Contains `projectId` and `orgId`.
- `.vercel/repo.json` — created by `vercel link --repo` (repo-based linking). Contains `orgId`, `remoteName`, and a `projects` array mapping directories to Vercel project IDs.
- **Ask the user before pushing.** Never push without explicit approval:
- **Commit and push:**
- **Retrieve the preview URL.** If the CLI is authenticated:
- **Ask the user which team to deploy to.** Present the team slugs from Step 1 as a bulleted list. If there's only one team (or just a personal account), skip this step.
- **Once a team is selected, proceed directly to linking.** Tell the user what will happen but do not ask for separate confirmation:
- **If a git remote exists**, use repo-based linking with the selected team scope:
- **Then deploy using the best available method:**
- If a git remote exists → commit and push (see git push method above)
- If no git remote → `vercel deploy [path] -y --no-wait --scope <team-slug>`, then `vercel inspect <url>` to check status
- **Install the CLI (if not already installed):**
- **Authenticate:**
- **Ask which team to deploy to** — present team slugs from `vercel teams list --format json` as a bulleted list. If only one team / personal account, skip. Once selected, proceed immediately.
- **Link the project** with the selected team scope (use `--repo` if a git remote exists, plain `vercel link` otherwise):
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/deploy-to-vercel/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: design-system

**Purpose**: Genera un DESIGN.md (formato Google Labs Apache-2.0) en el root del proyecto antes del scaffolding del frontend.

**Compact Rules**:
- **D1.** NEVER hardcode hex color values, font sizes, or spacing values in component code — they belong in `DESIGN.md` frontmatter tokens and are consumed via Tailwind config / CSS variables.
- **D2.** NEVER bypass `DESIGN.md` when answering "what color is X?" / "what's the spacing scale?" — the file is the source of truth, including for the assistant. Read it, do not guess.
- **D3.** NEVER regenerate `DESIGN.md` from scratch when a surgical rebrand suffices — UPSERT existing tokens, preserve section order, do not lose rationale prose.
- **D4.** NEVER ship a token rename without a migration path for component consumers — silent rename breaks every downstream import + `tailwind.config.js` reference.
- **D5.** NEVER override design tokens inline (`style={{ color: '#fff' }}`, `className="text-[#1A1C1E]"`) in components — the escape hatch becomes the rule and the token system rots.
- **D6.** NEVER let a designer hand off a Figma URL alone — require the exported token JSON or a built `DESIGN.md`; design intent must be machine-readable for downstream scaffolds.
- **D7.** NEVER auto-run the optional screen phase or hand-author screen mockups yourself — the phase is always an explicit user opt-in, and the mockups always come from the external tool: either supplied by the user into `.context/designs/<project>/` (Mode B) or commissioned by the AI through the Open Design MCP and exported there (Mode A — sanctioned delegation, see `references/screen-design-mapping.md` S1), or generated by the AI as HTML through a loaded design skill (Mode C: the design set loaded before the first line of HTML, `agentic-dev-core/references/skill-composition-strategy.md` §3.5). What stays banned is the orchestrating AI writing mockup markup itself with no design skill loaded. A human ratifies every mockup, whatever produced it.
- **D8.** NEVER pick a catalog brand, invent a token, or write application code in `extract` mode — `DESIGN.md` mirrors the LIVE theme (`tailwind.config.*`, the stylesheet the root layout imports, `components.json`), values copied in their own CSS format with a `# <file> <selector>` provenance comment; a kind the code lacks is omitted and reported as a Discovery Gap; only `DESIGN.md` (+ an accepted variant) and `.session/design-system/` may change; lint must reach `errors: 0`, and a sub-AA warning the app ships is reported, never fixed in the token (`references/extract-from-code.md`).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/design-system/SKILL.md` · phase: `foundation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: design-taste-frontend

**Purpose**: Senior UI/UX Engineer.

**Compact Rules**:
- DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)
- MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)
- VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)
- **DEPENDENCY VERIFICATION [MANDATORY]:** Before importing ANY 3rd party library (e.g. `framer-motion`, `lucide-react`, `zustand`), you MUST check `package.json`. If the package is missing, you MUST output the installation command (e.g. `npm install package-name`) before providing the code. **Never** assume a library exists.
- **Framework & Interactivity:** React or Next.js. Default to Server Components (`RSC`).
- **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a `"use client"` component.
- **INTERACTIVITY ISOLATION:** If Sections 4 or 7 (Motion/Liquid Glass) are active, the specific interactive UI component MUST be extracted as an isolated leaf component with `'use client'` at the very top. Server Components must exclusively render static layouts.
- **State Management:** Use local `useState`/`useReducer` for isolated UI. Use global state strictly for deep prop-drilling avoidance.
- **Styling Policy:** Use Tailwind CSS (v3/v4) for 90% of styling.
- **TAILWIND VERSION LOCK:** Check `package.json` first. Do not use v4 syntax in v3 projects.
- **T4 CONFIG GUARD:** For v4, do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.
- **ANTI-EMOJI POLICY [CRITICAL]:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons (Radix, Phosphor) or clean SVG primitives. Emojis are BANNED.
- **Responsiveness & Spacing:**
- Standardize breakpoints (`sm`, `md`, `lg`, `xl`).
- Contain page layouts using `max-w-[1400px] mx-auto` or `max-w-7xl`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/design-taste-frontend/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: emil-design-eng

**Purpose**: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make so...

**Compact Rules**:
- **Spatial consistency**: toast enters and exits from the same direction, making swipe-to-dismiss feel intuitive
- **State indication**: a morphing feedback button shows the state change
- **Explanation**: a marketing animation that shows how a feature works
- **Feedback**: a button scales down on press, confirming the interface heard the user
- **Preventing jarring changes**: elements appearing or disappearing without transition feel broken
- A **fast-spinning spinner** makes loading feel faster (same load time, different perception)
- A **180ms select** animation feels more responsive than a **400ms** one
- **Instant tooltips** after the first one is open (skip delay + skip animation) make the whole toolbar feel faster
- Drag interactions with momentum
- Elements that should feel "alive" (like Apple's Dynamic Island)
- Gestures that can be interrupted mid-animation
- Decorative mouse-tracking interactions
- **Developer experience is key.** No hooks, no context, no complex setup. Insert `<Toaster />` once, call `toast()` from anywhere. The less friction to adopt, the more people will use it.
- **Good defaults matter more than options.** Ship beautiful out of the box. Most users never customize. The default easing, timing, and visual design should be excellent.
- **Naming creates identity.** "Sonner" (French for "to ring") feels more elegant than "react-toast". Sacrifice discoverability for memorability when appropriate.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/emil-design-eng/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: frontend-design

**Purpose**: Create distinctive, production-grade frontend interfaces with high design quality.

**Compact Rules**:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/frontend-design/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: git-flow-master

**Purpose**: End-to-end Git operator for any branching strategy.

**Compact Rules**:
- **Read the repo state first (Step 1).** Never assume branch, upstream, or cleanliness.
- **The strategy comes from `.agents/project.yaml` → `git_strategy`**, read per invocation. Never infer it from a skill example or from another project.
- **`strategy: solo-main` is the shipped DEFAULT, not evidence of a decision.** `meta.strategy_source` is what tells them apart: `inherited` means nobody chose. On a repo whose `project.project_name` is set and whose `strategy_source` is still `inherited`, OFFER Strategy Setup and say what the default costs (no integration branch, no promotion path, no review gate). Strategy Setup stamps `chosen`; nothing else may.
- **`policy:` records INTENT, not enforcement.** Reconcile it by RUNNING `bun run git:policy verify` (Step 1b) at the first push / PR / merge intent, then `--stamp` when clean. Never perform the protection queries by hand and never state what the remote requires from a `declared` reading — say "declared, not verified".
- **Query BOTH GitHub protection mechanisms.** `branches/{b}/protection` (classic) AND `rules/branches/{b}` (rulesets); `git:policy verify` does both. A `404` on the classic endpoint does NOT mean unprotected — rulesets enforce PR requirements invisibly to it. A push that succeeds is not proof a rule is absent: admins bypass rulesets while the rule still binds everyone else.
- **Report drift, never auto-correct it.** A mismatch between `policy:` and host protection is surfaced with both values and three options; editing `.agents/project.yaml` needs the user's choice. Writing the HOST needs it too: `git:policy apply` is a dry run until `--yes`, and refuses outright to remove a guard, lower the approval bar, turn off code-owner review, or widen the merge methods unless `--allow-loosening` is passed for that specific give-up.
- **`require_code_owner_review: true` with no `CODEOWNERS` file is unsatisfiable, not strict.** Nobody outside the bypass list can clear it, so every merge becomes a bypass. Treat that combination as drift with a named remedy: add the file, or turn the flag off.
- **Config examples in `references/` are examples.** Quoting one as a project's real configuration is a defect. Open the project's own file and cite it.
- **One PR per user story, always.** Size never splits a story into PRs: a large change is ONE PR carried by atomic commits (one responsibility, tests with their behaviour, every commit green), with the commit list and a review guide in the PR body. NEVER propose or open stacked/chained PRs unless the user explicitly asks for them in that run. A story too large is split in the backlog via `/product-management`, never by PR.
- **Merge with a merge commit (`--no-ff`), never squash.** The per-commit history must survive on the target branch. Never merge a PR carrying a ticket key into anything but its final target: Jira's automation flips the ticket to Ready For QA on that merge and the workflow has no way back.
- **Push to a protected branch = resolve `git_strategy.policy.direct_push_to_protected`** (Critical Rule #4): `allowed` is standing authorization, push without asking (asking anyway collapses it into `confirm`); `confirm` asks before every push; `forbidden` refuses and routes through a PR. A missing or null block behaves as `confirm`.
- **Never** `--force`, `--force-with-lease`, `--no-verify`, amend, or rebase pushed history on a shared branch unless the user explicitly asks AND the branch is unshared.
- **Admin bypass may only be OFFERED when `admin_bypass: true`**, and only after re-confirming at runtime that the operator really is an admin and that they accept the specific irreversible action.
- **Stop at PR creation.** Never auto-merge.
- **One commit = one responsibility**, conventional prefix, no AI-attribution lines. Every commit ends with the two forensic trailers `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` context line (`unknown` when unresolved); harness-branded trailers (`Claude-Session:`, an AI `Co-Authored-By:`) are forbidden (§3.2).
- **WHEN the pre-push or CI documentation-contract gate names a region (ADR-0017)**: update every page it lists in the same push; only if they still hold, add `Docs-Checked: <label> <reason>` above the forensic trailers. NEVER add it by reflex or without the reason.

**Read full SKILL.md when**: running Strategy Setup, resolving conflicts, planning the commits of a large change, or when the compact rules above do not settle the operation.

> Source: `.agents/skills/git-flow-master/SKILL.md` · phase: `implementation` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: impeccable

**Purpose**: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize...

**Compact Rules**:
- Load context (PRODUCT.md / DESIGN.md) via the loader script.
- Identify the register and load the matching register reference (brand.md or product.md).
- **If the user invoked a sub-command (e.g. `craft`, `shape`, `audit`), load its reference file too.** This is non-negotiable: `craft` without `craft.md` loaded means you'll skip the shape-and-confirm step the user expects.
- **PRODUCT.md**: required. Users, brand, tone, anti-references, strategic principles.
- **DESIGN.md**: optional, strongly recommended. Colors, typography, elevation, components.
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100; high chroma at extremes looks garish.
- Never use `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01 is enough).
- Pick a **color strategy** before picking colors. Four steps on the commitment axis:
- **Restrained**: tinted neutrals + one accent ≤10%. Product default; brand minimalism.
- **Committed**: one saturated color carries 30–60% of the surface. Brand default for identity-driven pages.
- **Full palette**: 3–4 named roles, each used deliberately. Brand campaigns; product data viz.
- **Drenched**: the surface IS the color. Brand heroes, campaign pages.
- The "one accent ≤10%" rule is Restrained only. Committed / Full palette / Drenched exceed it on purpose. Don't collapse every design to Restrained by reflex.
- Cap body line length at 65–75ch.
- Hierarchy through scale + weight contrast (≥1.25 ratio between steps). Avoid flat scales.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/impeccable/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: jira-administration

**Purpose**: Run bounded Jira administration workflows for project Components or Atlassian instance migration.

**Compact Rules**:
- Exactly ONE mode per run: `components` (`references/components.md`) or `instance-migration` (`references/instance-migration.md`). Load only that mode's reference. Never combine the two, never fall through into the other.
- Mode unclear → ASK. Do not infer one from a bare "fix Jira" / "sync Jira" request.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials = HARD STOP (`AGENTS.md` Critical Rule #9, MCP credential failure). Name the exact env var, point at `.env` / `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read-first on every mutation: inspect the live state before authoring any plan. Nothing is created, applied, deleted, or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect → author the plan file → dry-run → WAIT for explicit approval → only then `--apply`.
- `instance-migration`: resolve and confirm BOTH instances → audit and verify reachability → WAIT for explicit approval → only then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global: re-login repoints every repo on the host, not just this one.
- The Atlassian host lives in `.agents/project.yaml` → `issue_tracker.atlassian_url` and NOWHERE else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination to DELETE, never to update — a second copy is what goes stale.
- Template-repo carve-out: if `.agents/project.yaml` → `project.project_name` is `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` `null`, say so in the report, and never manufacture a commit to hide the emptiness.
- Run only the selected reference's verification steps. Never run the other mode's.
- Forward the rest of `$ARGUMENTS` (everything after the mode token) unchanged.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

> Source: `.agents/skills/jira-administration/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: jungla

**Purpose**: El Jungla, the Forward-Deployed Engineer (FDE) of this repo: a day-long conductor session (6:00-21:00 ART) that is half product owner, ha...

**Compact Rules**:
- **The checkout is shared with the owner.** Stage explicit paths only (never `git add -A` / `.`), never a global discard (Critical Rule #13), read `git status` before every commit, and fast-forward `staging` only on a clean tree.
- **A ticket-keyed story or defect ships as ONE PR from a worker's own worktree** (Bunkai rule ONE-PR-PER-STORY). Direct commits on `staging` are only for hotfixes with no ticket, urgent breakage, and the Jungla's own process files. Nothing ever goes to `main`.
- **Git is the source of truth; Jira is a hint** (`/autonomous-delivery`). A story moves to Ready For Release only when its code is an ancestor of `origin/staging` after a fresh `git fetch`; an Open defect whose fix is already on `origin/staging` is a status lag, not a bug to fix again.
- **Students are reached only through the tutor bridge** (`~/.upex/bridges/tutor-jungla.md`): never Slack to a student, never a Jira comment addressed to a student unless the owner enabled it.
- **Owners only, only in the Jungla channel, always as the Aurora bot** (`scripts/slack.sh`), never with the claude.ai Slack connector. Escalate only what is genuinely the owner's: money, accounts, credentials, the `staging` -> `main` promotion.
- **One heavy worker at a time** (the owner's machine overloads). A second gank waits in `state.json` `ganks`.
- **Never end a turn without the watcher running in the background**, except at the final close (`aurora-close.sh`). Never wait with `sleep` or a loop of your own.
- **No personal data in any file** (state, journal, briefs, bridge files): a Slack thread ts or a Jira key identifies the person.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/jungla/SKILL.md` · phase: `implementation` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: next-best-practices

**Purpose**: Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/fon...

**Compact Rules**:
- Project structure and special files
- Route segments (dynamic, catch-all, groups)
- Parallel and intercepting routes
- Middleware rename in v16 (middleware → proxy)
- Async client component detection (invalid)
- Non-serializable props detection
- Server Action exceptions
- Async `params` and `searchParams`
- Async `cookies()` and `headers()`
- Migration codemod
- Default to Node.js runtime
- When Edge runtime is appropriate
- `'use client'`, `'use server'` (React)
- `'use cache'` (Next.js)
- Navigation hooks: `useRouter`, `usePathname`, `useSearchParams`, `useParams`
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/next-best-practices/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

---

## Skill: next-cache-components

**Purpose**: Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag

**Compact Rules**:
- **Build ID** - invalidates all caches on deploy
- **Function ID** - hash of function location
- **Serializable arguments** - props become part of key
- **Closure variables** - outer scope values included
- **No manual cache keys** - `use cache` generates keys automatically from function arguments and closures. The `keyParts` array from `unstable_cache` is no longer needed.
- **Tags** - Replace `options.tags` with `cacheTag()` calls inside the function.
- **Revalidation** - Replace `options.revalidate` with `cacheLife({ revalidate: N })` or a built-in profile like `cacheLife('minutes')`.
- **Dynamic data** - `unstable_cache` did not support `cookies()` or `headers()` inside the callback. The same restriction applies to `use cache`, but you can use `'use cache: private'` if needed.
- **Edge runtime not supported** - requires Node.js
- **Static export not supported** - needs server
- **Non-deterministic values** (`Math.random()`, `Date.now()`) execute once at build time inside `use cache`
- [Cache Components Guide](https://nextjs.org/docs/app/getting-started/cache-components)
- [use cache Directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [unstable_cache (legacy)](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/next-cache-components/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

---

## Skill: next-upgrade

**Purpose**: Upgrade Next.js to the latest version following official migration guides and codemods

**Compact Rules**:
- **Detect current version**: Read `package.json` to identify the current Next.js version and related dependencies (React, React DOM, etc.)
- **Fetch the latest upgrade guide**: Use WebFetch to get the official upgrade documentation:
- Codemods: https://nextjs.org/docs/app/guides/upgrading/codemods
- Version-specific guides (adjust version as needed):
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://nextjs.org/docs/app/guides/upgrading/version-14
- **Determine upgrade path**: Based on current version, identify which migration steps apply. For major version jumps, upgrade incrementally (e.g., 13 → 14 → 15).
- **Run codemods first**: Next.js provides codemods to automate breaking changes:
- `next-async-request-api` - Updates async Request APIs (v15)
- `next-request-geo-ip` - Migrates geo/ip properties (v15)
- `next-dynamic-access-named-export` - Transforms dynamic imports (v15)
- **Update dependencies**: Upgrade Next.js and peer dependencies together:
- **Review breaking changes**: Check the upgrade guide for manual changes needed:
- API changes (e.g., async params in v15)
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/next-upgrade/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

---

## Skill: orca-orchestration

**Purpose**: Multi-session agent orchestration for this repo: one conductor session coordinating a fleet of persistent worker sessions (one per story,...

**Compact Rules**:
- DO gate on the BINARY plus a reachable RUNTIME, never on "is a vendor skill installed". Three states: A no binary, B binary with unreachable runtime, C ready. In a workflow skill, states A and B are TOTAL SILENCE: never name the orchestrator, never list it as a prerequisite, never mention it in a PR body, a plan or a blocked-token sweep. The one-line install recommendation belongs to THIS skill and fires only because the user asked for orchestration.
- DO write the launch file ALWAYS, with or without a runtime, and keep the PROMPT identical on both paths, byte for byte, opening with `/<workflow-skill> <label> fleet worker` and carrying the no-stopping sentence. The worker's name is `<label>--<handle>` everywhere (session, tab, roster, `Session:` trailer): the hook composes it on Claude Code (so a Claude launch line carries no name flag), the worker renames its own tab first, the conductor types the rename verb on the other harnesses and re-issues the tab rename every sweep. The launch line itself is for a human to paste or for a deliberately unsupervised terminal; the prompt is the payload both paths share, and a paraphrased prompt is the exact failure this rule exists to prevent.
- DO NOT copy the vendor command grammar into this repo. LOAD the stubs listed in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside this skill — conductor AND worker, they are small — and ask the binary only for the DEEP topics a stub points at. A copied grammar goes stale in silence on the next release; a grammar nobody loaded produces invented flags.
- DO treat one-shot subagents as the DEFAULT executor (AGENTS.md §3, unchanged) and a supervised worker as the declared exception: persistent, addressable, owns a scope end to end. The conductor still uses subagents for its OWN reads.
- DO NOT allow periodic heartbeats, even though the injected preamble asks for them. Every heartbeat wakes the conductor to read the word "alive". A worker sends exactly three things: `worker_done` (once, with an explicit outcome), `ask` (blocking), `escalation`. The brief must prohibit heartbeats in writing.
- DO NOT use the harness's own agent-to-agent messaging or user-question tools from a worker: from an isolated worktree the conductor is not addressable and nobody is watching a user prompt. The channel is the orchestration mailbox, and a question that does not block goes out as a message while the worker keeps going on everything that does not depend on the answer.
- DO send every error, blocker and decision a worker cannot take inside its brief to the session that launched it, never to the human: what `agentic-dev-core/references/decision-protocol.md` §5 escalates (§5.1 applied) and every error or blocker it cannot clear go out as a blocking `ask`, an `escalation` or a `BLOCKED: ` status, never guessed; no structured-question tool, no `mkd` deck, no sweep. A technical call inside the brief is the worker's, reported as DECIDED. Exception: the human typed into the worker's own session or the brief grants it in writing, and the worker tells its conductor. The conductor decides a technical call inside the plan itself, relays the rest to the human (sweep small, deck heavy), replies by message id and records it in the run's decision file; a middle conductor relays upward the same way. Canon: `references/worker-contract.md` rule 16.
- DO treat the channel as an ASSIGNMENT, not a preference: `orchestration send` carries every message between sessions and is byte-intact; anything longer than a couple of sentences goes in a FILE with a one-line pointer; `terminal send` drives a terminal (commands, CLI calls, harness slash-commands, keystrokes) and nothing else, because it truncates silently, keeps only the TAIL and still reports success. The one exception is the launch handoff prompt of a supervised worker, which has no argv to travel in: keep it short and point it at a file. And read every send result as a statement about the CALL, never about the outcome.
- DO acknowledge every mailbox batch, verified, in the SAME command that re-arms the wait, and never inside a compound command whose exit code can be swallowed. An unacknowledged batch replays forever and hides everything queued behind it, and the runtime does not re-notify. Roll the wait in windows of at most 540 s, because the harness kills a foreground command at 600 s. One waiter per Run, never a shell background job, never a self-built monitor: the runtime notifies the conductor on its own.
- DO launch a supervised worker NATIVELY (the runtime starts the agent: task, worktree, agent, model, effort) and then send its prompt as the immediate next step. A terminal created with our own command line can NEVER be supervised — the runtime recognizes only agents it started, and adoption is refused on a terminal whose agent is demonstrably alive. Custom argv is the human-paste shape and the deliberately-unsupervised shape, nothing more.
- DO verify credentials on the worker's own screen before dispatching work to it. No harness process holds a `.env` value, whichever way it was launched (ADR-0016): a supervised native launch and a pasted launch line are identical in credential terms. On every host each MCP server that needs `.env` values starts through the `.env` loader (`varlock run --filter <its vars>`), which reads the worktree's `.env` at spawn time. CLIs carry their own auth (`acli`, `gh`, `supabase`, `vercel`), bun scripts load `.env` themselves, and any other command needing a `.env` value runs as `bunx varlock run -- sh -c '<cmd using "$VAR">'`. A missing `.env` in the worktree or a CLI never logged in on the machine lets the worker start clean and fail much later at its first authenticated call.
- DO tell every worker, in the prompt AND in the brief, to run every stage without returning to the prompt until `worker_done` is sent: a stage boundary is not a checkpoint. And DO name the one `ask` that is mandatory: when a worker's own measurement contradicts a conductor instruction, it stops and asks with both readings and the evidence — never silent compliance, never silent deviation.
- DO treat create + launch + brief as ONE indivisible operation, and verify a few minutes later that the brief actually landed (a created terminal reports success when the text was DELIVERED, not when it ran). Readiness is not completion.
- DO close a finished worker in the same turn, and read its cost footer off its screen BEFORE closing: a worker's token and context usage exists nowhere else and dies with the terminal. Release the supervised worker by its dispatch; without a dispatch, COUNT the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. `worker-release` closes the agent terminal ONLY: the worktree, its `Setup` terminal and its local branch survive it and pile up on disk. So after the orphan audit (everything gitignored inside the worktree dies with it) the conductor removes the worktree in the same turn (`orca worktree rm --run-hooks`) and confirms with `git worktree list`. A worktree stays only with a written reason and an owner in `roster.md` (a worker session that may still be resumed is such a reason).
- DO pick the topology by what the work writes: backlog refinement runs as a fleet in the SAME checkout (state lives in the tracker); story implementation, bug fixing and anything else that writes code gets one Orca worktree per worker, because two sessions in one checkout collide on the git index even when they never touch the same file. Never two workers owning the same module, and never two migrations in one round.
- DO keep the shared-state writes with the conductor: applying a migration to a shared database, regenerating output from a live instance (Supabase types, `api/schemas/`), merging into the integration branch and deploying to staging (one story at a time, verified at the destination), fleet-altitude tracker writes and generated registries. A worker opens its own PR and stops there.
- DO declare a claim before touching shared seed data, a shared schema or a shared automation identity, with one of three intents (`read` / `write` / `enumerate` — a listing that exposes siblings' entities is never an assertion target). A claim already listed in the brief is PRE-GRANTED: the worker announces it and works. Only a claim discovered mid-run waits, and the conductor arbitrates it: first message wins, it keeps the ledger and broadcasts the grant. Conductor-only operations are never delegated.
- DO provision a fresh worktree BEFORE launching. A missing provisioning step disguises itself as something else: an absent env file reads as "the tool does not exist", absent dependencies as "a broken import", an absent tracker cache as a worker that simply cannot see the story.
- DO keep `.agents/project.yaml` → `orchestration` as DEFAULTS only (worker cap, agent, model and effort per tier, permission mode per tier, model overrides by topic). An explicit user instruction in the conductor session always overrides them for that run; the defaults apply only when the user said nothing.
- WHEN running as an unattended routine (AUTOMATION mode): a DELIVERY routine is `/autonomous-delivery <mode>`, and its lock, audit, selection, caps and hazards are that skill's, never restated or doubled here (`references/automations.md` §2.6). Any other routine takes its own lock FIRST (`<<PRIMARY_ROOT>>/.session/orchestration/automations/<routine>/lock.json`, created no-clobber, then read back), because a manual fire bypasses the precheck and can overlap a scheduled one. A live lock means exit with a one-line report, never wait or queue; a lock older than the prompt's `stale_after_minutes` is reclaimed and the reclamation reported; a prompt with no window fails closed. Delete the lock as the run's last step. Canon: `references/automations.md` §2.
- WHEN running as an unattended routine: open at most `orchestration.max_workers` workers in total, in one round (lower if the prompt or the delivery mode cap says so: the lower wins), and list the rest as deferred; treat nothing eligible as a correct outcome, never pick a marginal item to fill the report; write the run report at every step boundary, never only at the end; and decide what shipped from git (the merge commit is an ancestor of the integration branch after a fresh fetch) and what is live from the deployment for that SHA, never from tracker status. Git is truth, the tracker is a hint.
- WHEN a commit is produced by any session: the forensic trailers (`Worktree:` then `Session:`) are mandatory and are NOT AI attribution. Canon: `/git-flow-master`.

**Read full SKILL.md when**: starting a fleet cold, arbitrating a claim, choosing a topology, recovering a Run from a previous session, or writing an unattended automation.

> Source: `.agents/skills/orca-orchestration/SKILL.md` · phase: `unknown` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: playwright-cli

**Purpose**: Automate browser interactions, test web pages and work with Playwright tests.

**Compact Rules**:
- **One named session per task.** Open the browser with `playwright-cli open -s=<name>` and pass the same `-s=<name>` to every later command; close it when the task ends.
- **Snapshot before you act.** Target elements by the refs of the latest `snapshot`; take a new snapshot after any navigation or DOM change, never reuse stale refs.
- **Session material is ephemeral.** Storage state, cookies and traces go to the session scratch directory only and are deleted before reporting.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/playwright-cli/SKILL.md` · phase: `unknown` · kind: `unknown` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: pr-review-lead

**Purpose**: Acts as a Tech Lead reviewing a teammate's pull request against this repo's development doctrine (or the target repo's own doctrine, if i...

**Compact Rules**:
- DO: run the strictness preflight (Flexible / Standard / Strict) before reading a single line of diff, unless the invocation already answered it; never re-ask what was given.
- WHEN strictness is Flexible or Standard: doctrine-pattern deviations are observations framed as a comparison, never errors, and they must not move the score the way a Real defect does. Strict widens what counts as a finding; it still does not turn a pattern note into an error.
- DO: load the target repo's OWN doctrine before analyzing when it ships one (`AGENTS.md`, `.agents/skills/`, `.context/`). Only when it has none does this repo's doctrine become the reference standard, and say so once, up front.
- DO NOT: state a "best practice" as if the repo required it without a `file §section` citation. An ungrounded call is labeled as opinion, in those words.
- DO: bucket every finding into exactly one of Real, Pattern, or Positive, with a severity from the shared scale in `sprint-development/references/review-pr.md` §"Adjudication contract" (`BLOCKER` / `MAJOR` / `MINOR` / `NIT`).
- DO: always populate the Positive bucket. A review with zero positives on a PR that clearly has some is uncalibrated, not rigorous.
- DO: read the actual diffs, never the PR description. On a PR too large for one diff, page the per-file patches; check commit headlines first so a lockfile, generated-types or vendor-sync commit is not reviewed line by line.
- DO: present the findings table + positives + a score out of 10 as a CHECKPOINT, then let the user triage and re-classify. The user's context decides what ships; do not defend the first-pass severity.
- DO NOT: post anything to GitHub without an explicit go-ahead on the final draft. Approval for a DIFFERENT PR does not carry over, and silence is not approval.
- DO NOT: delegate drafting or posting the feedback to a subagent: tone decisions and externally-visible actions stay with the orchestrator.
- DO: write the posted comment in English (Critical Rule #12) unless the user asked for another language for that specific comment.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

> Source: `.agents/skills/pr-review-lead/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: product-management

**Purpose**: Orchestrates continuous product management work — initial backlog seed from PRD, incremental feature addition, epic creation, story refin...

**Compact Rules**:
- **I1.** NEVER hardcode `customfield_NNNNN` IDs in skill or AI output. Resolve via `{{jira.<slug>}}`.
- **I2.** NEVER prefix story summaries with `FR-XXX —`. Use `**Source spec:** FR-XXX` as the first body line.
- **I3.** NEVER copy AC / Scope / Out-of-Scope content into the description. Those live exclusively in their custom fields.
- **I4.** NEVER let two stories in the same epic share a literal Scope bullet. Surface as `overlap_alert` and ask the user to resolve.
- **I5.** NEVER invent acceptance criteria, scope items, or business rules. Source must be PRD / SRS / business map / explicit user input. If missing → report `gap`, halt that field, continue with the rest.
- **I6.** NEVER batch multiple ADF custom fields in a single MCP update call. Split per field, or pre-convert with `md-to-adf.ts`.
- **I7.** NEVER nest inline `code` inside `**bold**` markdown destined for ADF — the converter combines incompatible marks and Jira rejects HTTP 400.
- **I8.** NEVER create stories without immediately running the dependency-linking phase. Local declarations are not enough; Jira links must exist.
- **I9.** NEVER hardcode `acli`, `mcp__atlassian__`, or REST URL examples in this skill. Use `[ISSUE_TRACKER_TOOL]` pseudo-code. The tool skill owns the syntax.
- **I10.** NEVER use "Wave" terminology. Use "Sprint" (or "Master Sprint" / "Execution Sprint" when ambiguity matters).
- **I11.** NEVER skip sprint-sequencing after creating multiple linked stories.
- **I12.** NEVER hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Use `{{jira.link_types.<slug>}}`.
- **I13.** NEVER use `Relates` for ordering-sensitive dependencies. Symmetric → direction is lost. Use `Dependencies` (or flag fallback explicitly as degradation).
- **I14.** NEVER ignore cycle detection in sprint-sequencing. A cycle in the `dependencies` graph is a bug — halt and report.
- **I15.** NEVER include implementation surface in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}`, or `{{jira.workflow}}`. Disallowed surface: API/endpoint paths, HTTP status codes, DB table/column names, error-code identifiers (e.g. `VALIDATION_ERROR`), framework or library names, transaction/locking patterns, internal algorithms. Those describe HOW; AC/Scope/Workflow describe WHAT the persona observes/does/receives. Implementation belongs in the impl-plan generated by `/sprint-development`. `{{jira.business_rules_specification}}` tolerates domain rules (boundaries, role gates, retry semantics, audit guarantees) but NOT internal algorithms. **Exception**: when the persona is an API consumer (DevEx, integration agent, headless client), endpoint paths and response shapes ARE part of their observable UX. **Heuristic**: if the criterion stays true after a stack swap → business voice; if a stack swap breaks it → implementation, rewrite.
- **I16.** NEVER populate `{{jira.story_points}}` on create or edit by default. Story Points stay EMPTY unless the user explicitly requests estimation in the current session ("estimate this", "size this story", "story points", or equivalent in the user's language). Rationale: PO/BA role does not estimate; estimation belongs to the team that will build the work (Design + Dev + Test). When opted-in by the user, use Fibonacci (1, 2, 3, 5, 8); 13+ is a smell → split instead.
- **I17.** NEVER write `{{jira.acceptance_criteria}}` as plain text. Every scenario MUST be wrapped in a fenced ```gherkin code block. Applies on initial create AND on every edit/re-format pass. Reason: Jira ADF renders the fenced block as monospaced + syntax-highlighted, which is the only readable shape for Given/When/Then in the Jira UI. When refining EXISTING AC that was written unfenced, rewrite the field in full to apply the fence.
- **I18.** NEVER create or edit a story (or epic) without first running an **active dependency discovery** pass against the current backlog graph (`.context/PBI/epic-tree.md` + live Jira link graph + the data map, `bun run context:map business-data-context`, when generated). Default state is "no global/infrastructural dependencies surface as story links" — generic prerequisites (auth exists, DB exists, framework is set up) are filtered out as noise. Only feature-level, observable, explicit dependencies become candidate links. Output: a `(from, to, source-of-decision)` matrix surfaced to the user for confirmation BEFORE writing any Jira link. Passive "only link if obviously needed" is rejected — discovery is an active step.
- **I19.** NEVER use generic actors ("the user", "the customer", "the system") in the `As a` line of a user story. The persona MUST resolve to a named entity in `.context/PRD/user-personas.md` (a business-maps project with no PRD: an actor the domain glossary or the data map's `access-control` section names). If the matching persona is absent → surface as `gap`, ask the user, never invent.
- **I20.** NEVER write the `As a … I want to … so that …` sentence as the story summary. The summary MUST be `{Feature} | {Action}` (see §Story title format); the full sentence lives ONLY in the description `## User story` section. Persona and benefit NEVER appear in the title. Domain-entity feature prefixes that collide with agile/QA vocabulary carry the `TMS-` (project-domain) tag; cross-cutting features stay plain. Epics keep noun-phrase titles (no pipe, no verb).
- **I21.** NEVER publish Jira content whose domain entity/process/state names diverge from `.context/business/domain-glossary.md`, and NEVER use a term its anti-glossary bans — use the prescribed replacement. A needed term missing from the glossary → surface as `gap` for the PM to add per the glossary's change protocol; never invent terminology mid-story.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/product-management/SKILL.md` · phase: `management` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-adoption

**Purpose**: Teach the agentic layer an EXISTING application after the adoption install (`bun <boilerplate clone>/cli/update-boilerplate.ts --adopt`)...

**Compact Rules**:
- Exactly ONE mode per run: `adopt` (default, Phases 0-9 in `references/adoption-workflow.md`) or `check` (Phase 0 signals + `bun run setup:doctor` stack drift, read-only, writes nothing). Forward the rest of `$ARGUMENTS` unchanged.
- Entry gate: `.template/installer.lock.json` records `adopted: true` AND the working tree is clean (`git status --porcelain` empty, the adoption install already committed). Missing lock = STOP, the files were never installed: run the updater with `--adopt` first. A greenfield lock (`adopted` absent) = STOP, this repo was scaffolded: `/project-bootstrap` + `bun run agents:setup` own it.
- Phases 0-2 are SEALED: no tracked file changes. The seal is measured: `git status --porcelain` after Phase 2 differs from Phase 0 only by `.context/reports/project-adoption-plan.md`. Phase 3 starts only after the user approves that plan (`Status: PENDING APPROVAL` -> `APPROVED`) in this run; a plan from an earlier run is resumed, never rewritten.
- v1 support set is `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts` (Next.js + Postgres family, bun). Anything outside it STOPS at analysis with the named field and value (owner decisions OD2, OD3); never adapt an unsupported stack, never switch a package manager.
- One app per adoption: `stack.app_root` names it (OD6). A monorepo with several Next.js apps = ask which one; never adopt two in one run.
- REFUSAL LIST, binding on every write: never write or delete a file under `stack.app_root` that existed before adoption; never run a migration, apply SQL, change RLS, seed data or open a database connection in any environment (the adoption itself never touches a database, OD4 = C governs later delivery work, not this skill); never add, remove, upgrade or downgrade an app dependency or regenerate its lockfile; never edit CI workflows, `README.md`, `tsconfig.json`, eslint / prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts` or an app `package.json` script; never change git history, remotes, branch protection or rulesets; never create Jira projects, fields, workflows or issues; never push; never write a credential value anywhere but `.env`.
- Writes are limited to agentic surfaces named in the approved plan: `.agents/project.yaml` (identity, `stack:` through `bun run agents:setup --stack`, environments, `updater.protected_paths`), `.env` (values the user supplies), the Jira catalogs under `.agents/`, a framework skill the app had copied in by hand (replaced only by upstream's copy saved under `.agents/prompts/adopt-upstream/`, on its own approval line, the app's copy backed up first), `api/openapi*` only when absent before adoption, the instruction merge the updater saved (`.agents/prompts/adopt-instructions.md`, applied verbatim on its own approval line, originals backed up under `.backups/project-adoption/`), the app's `<app>-context` skill (its `description` only; the preserved `references/app-instructions.md` is never rewritten, a legacy `## 0.` block moves into it verbatim on its own line) and its pointer in `.agents/instructions/agent-project.md`, the plaintext MCP credential copies `bun run harness:env` retires, the plan file and `.session/project-adoption/`. Full allowlist: `references/adoption-workflow.md` §Refusal list.
- Collisions are refused file by file (OD7): a path the app already owned stays the app's, gets an `updater.protected_paths` entry, and is reported; never `take upstream` on an adopted repo, with ONE exception: the app's hand copy of a framework skill (a folder upstream ships under `.agents/skills/`) is left unprotected and its row proposes `take upstream`, applied in Phase 3 from the saved copy on its own approval line.
- Detection never guesses: an undetected value is asked in the Phase 1 questionnaire or recorded under `## Discovery Gaps`, never invented. A null `stack.scripts.<x>` means skip and say so.
- App intact = the app's own `build` / `lint` / `types` / `test` exit codes after Phase 7 equal the Phase 1 baseline. Run an app script that may reach a shared database or a paid API only when the questionnaire confirmed it is safe; otherwise record it as not measured.
- Fail-closed prerequisites a live app may lack (the automation identity in `testing.automation_identity`, `autonomous_delivery.automation_gh_account`, a dedicated DB role) are listed in the plan as owed by the team and NEVER created by this skill.
- Product docs of an adopted app are the business maps + glossary (OD5): never invent a PRD or SRS: `/sprint-development` accepts the maps in their place, and `/project-foundation` Discovery-only adds the dev guide and the glossary.
- Close with the signal table, the plan marked `Status: COMPLETED` with its results block, and the hand-off: `/project-context refresh-all` (maps from code) in a fresh session, then `/project-foundation` Discovery-only (dev guide + glossary), `/git-flow-master` Strategy Setup, optional `/design-system extract` and `/testability-guide`. Never auto-chain them; the commit is proposed through `/git-flow-master`, never made silently.

**Read full SKILL.md when**: the entry gate fails in an unexpected way, the app's stack is outside the v1 set, the instruction merge is pending, or a verification step disagrees with the baseline.

> Source: `.agents/skills/project-adoption/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-bootstrap

**Purpose**: Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system,...

**Compact Rules**:
- **B0. BROWNFIELD GUARD (fail-closed).** Run `bun run bootstrap:guard` at entry, before the session plan, and record its verdict + exit code in `plan.md`. Exit 2 (`existing-app`: adoption lock, an app `package.json`, or app files) → REFUSE the base phases (backend setup, frontend setup: tables, RLS, seed, clients, `middleware.ts` / `proxy.ts`, layout, theme, `tailwind.config`, `shadcn init`, `next@latest`, README, demo pages, demo credentials), quote the signals, route to `/project-adoption` (design identity → `/design-system extract`). The add-on phases stay available and read `stack:`. A base phase runs only on a plan that recorded exit 0; no recorded verdict = refused. Never override the verdict by reading the tree yourself.
- **B1.** NEVER collapse the scaffold architecture layers (`api/` / `schemas/` / `db/` boundaries in backend, design-system structure in frontend). That structure is framework architecture, not speculative abstraction — AGENTS.md §2 SIMPLICITY FIRST exempts it.
- **B2.** NEVER skip env-var validation (Zod or equivalent schema check at boot). Silent missing env vars cause cryptic prod failures far from the root cause.
- **B3.** NEVER clobber existing scaffolding (B0 refuses the base phases on an existing app; this rule binds the add-ons and a resumed greenfield run). Detect prior state under `app/`, `lib/`, `db/` and apply UPSERT semantics — patch surgically, preserve user edits.
- **B4.** NEVER hardcode credentials, URLs, or env-specific values in scaffolded code. They belong in `.env` (secrets) + `.agents/project.yaml` (non-secret config).
- **B5.** NEVER scaffold the frontend before `DESIGN.md` exists at repo root. Design tokens are the input contract for Phase 2 — run `/design-system` first. NEVER emit `tailwind.config` / `globals.css` / CSS variables over an app's existing theme: an existing design identity is recorded by `/design-system extract`, never replaced.
- **B6.** NEVER skip Supabase types generation when scaffolding the DB layer. Runtime TypeScript types must match the live schema; drift is a silent bug factory.
- **B7.** NEVER ship bearer-token auth without rate-limiting + secret-rotation guidance in the same scaffold. Auth without those two is a half-finished feature.
- **B8.** NEVER scaffold OpenAPI without the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler). The contract surface must be browsable from day one or downstream consumers won't trust it. Do NOT ship Redoc/Swagger instead — Scalar is the standard for this stack. On an existing app that already serves its own docs UI, that UI stays; Scalar is added beside it only on the user's OK, never as a replacement.
- **B9.** NEVER write the DB layer or the UI layer without its stack skills loaded first: `supabase` + `supabase-postgres-best-practices` before any install, DB-MCP schema / RLS / migration call or type generation; the design set (`frontend-design` + `ui-ux-pro-max` + `impeccable` + `emil-design-eng`, strategy doc §3.5) + `shadcn` + `tailwind-css-patterns` before the component strategy (Fase 1.6). Not installed → say so once, point at `bun setup`, continue; never a silent skip (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- **B10.** Database changes go through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: `list_migrations` read before the first write, DDL only through `apply_migration`, the route per `stack.database.migrations_tool`, verified at the destination, an ADR for an architecturally significant migration.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/project-bootstrap/SKILL.md` · phase: `foundation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-context

**Purpose**: Generate or refresh the canonical project-context artifacts for development: the business data, feature and API maps (HTML maps inside bu...

**Compact Rules**:
- Exactly ONE mode per run: `data` · `features` · `api` · `master-plan` · `dev-roadmap` · `refresh-all` · `context-skill`. The first token of `$ARGUMENTS` IS the mode when it matches one of these; otherwise resolve it from the trigger phrases in Mode routing. Load only that mode's reference; never open a second one in the same pass.
- `context-skill` scaffolds a project-owned `<aspect>-context` (`references/context-skill.md`, contract `agentic-dev-core/references/skill-scaffold.md` §3-§5) THROUGH `skill-creator` (T3) for an aspect the business maps do not cover. It cites its sources and never copies them; `refresh-all` never includes it. Its router row goes in the "Project context skills" table of `.agents/instructions/agent-project.md`, never in the synced `agent-skills-and-mcps.md` (`bun sync` would drop it).
- Mode → reference → output: `data` → `references/data.md` → `business-data-context`'s `references/business-data-map.html` · `features` → `references/features.md` → `business-feature-context`'s `references/business-feature-map.html` · `api` → `references/api.md` → `business-api-context`'s `references/business-api-map.html` · `master-plan` → `references/master-plan.md` → `.context/master-implementation-plan.md` · `dev-roadmap` → `references/dev-roadmap.md` → `.context/dev-roadmap.md`.
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `features` → `api` → `master-plan` → `dev-roadmap`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- A map mode writes ONLY its own skill's `references/<map>.html`, read and checked through `bun run context:map <skill>`. A project's legacy `.context/business/business-*-map.md` (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) is read as input and never deleted. The map skill already exists (delivered by `bun sync`, never scaffolded here).
- Artifact missing (or a placeholder map) = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate (for a map: only its stale sections), show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval, and NEVER regenerate a whole generated map.
- **Read `stack:` once per run** (`.agents/project.yaml`; leaves are `{{stack.<path>}}`) and let it parametrize the mode, per `## Stack parameters`: every app path resolves under `{{stack.app_root}}` (one app per run, other workspaces are a Discovery Gap); `{{stack.database.schema_source}}` picks the schema source (`live` = `[DB_TOOL]` against the active env, production only when the user names it for this run; `migrations` = the files under `{{stack.database.migrations_dir}}`, read offline, capability `db` then optional); an app that calls Supabase straight from its code with no OpenAPI spec and no route handlers has a Supabase-direct API. Block missing → the defaults of `.agents/project.schema.yaml` plus one Discovery Gap naming `bun run agents:setup --stack`. A null leaf means "the app has none": skip and say so, never invent one.
- Dependency gates are the selected reference's: `master-plan` hard-requires a generated data map (`bun run context:map business-data-context` prints sections, not the placeholder notice; soft: feature map); `dev-roadmap` hard-requires at least one epic with child stories in the issue tracker (soft: their dependency links, data map, master design plan, master implementation plan); `api` hard-requires an OpenAPI spec, a route-scannable backend or a Supabase-direct API; `features` and `api` soft-depend on the data map. A hard gate failure STOPS the run with the reference's exact message; a missing SOFT dependency is a Discovery Gap, never a stop.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory `## Discovery Gaps` section, not asserted in the body.
- After a map write, review that skill's `## Rules` and `references/gotchas.md` against the new map and PROPOSE any change; never rewrite a rule. After a successful artifact write, add its pointer ONLY when neither the shared Key paths (`.agents/instructions/agent-context-map.md`) nor `.agents/instructions/agent-project.md` names it yet, and write it into `agent-project.md` (`## Key paths (this project)`), never into `AGENTS.md` or a shared section: `AGENTS.md` is the boilerplate-owned always-on layer and `bun sync` overwrites the shared sections (the docs follow-through, `agentic-dev-core/references/docs-follow-through.md`). NEVER write operational prose into `CLAUDE.md`: it is the generated `@AGENTS.md` shim. Placement per `agentic-dev-core/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change runs that reference's §6 procedure.
- Forward the rest of `$ARGUMENTS` (everything after the mode token) unchanged to the selected mode (project path, module filter, epic key, or Master Sprint name, as each reference defines).
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix (`diagrams`, for the maps' figures, by the `diagram-design` skill's presence); none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

> Source: `.agents/skills/project-context/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-foundation

**Purpose**: Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SR...

**Compact Rules**:
- **F1.** NEVER rewrite the project Constitution, PRD, or SRS from scratch when prior versions exist under `.context/`. Always UPSERT — preserve existing decisions, surface diffs, refine in place.
- **F2.** NEVER fabricate user personas, market data, or competitor analysis. If the user has no research, surface the gap as a `[PLACEHOLDER]` open TODO and ask — speculative personas mislead every downstream skill.
- **F3.** NEVER conflate PRD scope with SRS architecture. PRD answers WHAT and WHY (problem, users, journeys, MVP cut); SRS answers HOW (functional contracts, NFRs, tech stack, API definitions). Cross-contamination breaks traceability.
- **F4.** NEVER skip Phase 4 Discovery (`/project-context data`, `/project-context features`, `/project-context api`, `project-dev-guide`). Downstream skills (`/product-management`, `/sprint-development`) assume those running-mental-model docs exist.
- **F5.** NEVER hardcode tool choices (DB engine, hosting provider, auth vendor, framework) in the Constitution. Tool selection lives in SRS architecture — Constitution stays vendor-agnostic so the SRS can change without invalidating the strategic anchor.
- **F6.** NEVER define personas, problem statements, or KPIs without quoting evidence (user interview, analytics snapshot, stakeholder ask, market data citation). Evidence-free claims look authoritative and mislead the PRD downstream.
- **F7.** NEVER produce a PRD without an explicit out-of-scope section. Implicit scope boundaries always leak; missing out-of-scope is the #1 source of mid-sprint argumentation.
- **F8.** NEVER leave the SRS architecture's hard-to-reverse decisions undocumented. Seed the foundational ones as ADRs in `.context/ADR/` (per `agentic-dev-core/references/adr-doctrine.md`) so later sessions don't re-litigate or silently violate them. Status per `adr-doctrine.md` §3 step 4: a decision the human already approved is `Accepted` from the start (cite the approval); only a still-open one is `Proposed`.
- **F9.** NEVER run Phases 1-3 to manufacture a Constitution, PRD or SRS for an app whose code already exists (`.template/installer.lock.json` → `adopted: true`, or the user asks to document an existing app). Its foundation is Phase 4 Discovery alone, read from the code ("Existing app: Discovery-only foundation"); a missing PRD / SRS there is not a gap to fill.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/project-foundation/SKILL.md` · phase: `foundation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: redesign-existing-projects

**Purpose**: Upgrades existing websites and apps to premium quality.

**Compact Rules**:
- **Scan** — Read the codebase. Identify the framework, styling method (Tailwind, vanilla CSS, styled-components, etc.), and current design patterns.
- **Diagnose** — Run through the audit below. List every generic pattern, weak point, and missing state you find.
- **Fix** — Apply targeted upgrades working with the existing stack. Do not rewrite from scratch. Improve what's there.
- **Browser default fonts or Inter everywhere.** Replace with a font that has character. Good options: `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`. For editorial/creative projects, pair a serif header with a sans-serif body.
- **Headlines lack presence.** Increase size for display text, tighten letter-spacing, reduce line-height. Headlines should feel heavy and intentional.
- **Body text too wide.** Limit paragraph width to roughly 65 characters. Increase line-height for readability.
- **Only Regular (400) and Bold (700) weights used.** Introduce Medium (500) and SemiBold (600) for more subtle hierarchy.
- **Numbers in proportional font.** Use a monospace font or enable tabular figures (`font-variant-numeric: tabular-nums`) for data-heavy interfaces.
- **Missing letter-spacing adjustments.** Use negative tracking for large headers, positive tracking for small caps or labels.
- **All-caps subheaders everywhere.** Try lowercase italics, sentence case, or small-caps instead.
- **Orphaned words.** Single words sitting alone on the last line. Fix with `text-wrap: balance` or `text-wrap: pretty`.
- **Pure `#000000` background.** Replace with off-black, dark charcoal, or tinted dark (`#0a0a0a`, `#121212`, or a dark navy).
- **Oversaturated accent colors.** Keep saturation below 80%. Desaturate accents so they blend with neutrals instead of screaming.
- **More than one accent color.** Pick one. Remove the rest. Consistency beats variety.
- **Mixing warm and cool grays.** Stick to one gray family. Tint all grays with a consistent hue (warm or cool, not both).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/redesign-existing-projects/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: session-handoff

**Purpose**: Compact an entire agent session into a handoff document so a NEW session resumes exactly where this one stopped, as if the context window...

**Compact Rules**:
- **The file lives in the PRIMARY checkout**: `<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md`, also when the session runs in a linked worktree (`.agents/README.md` §"Checkout roots"). Never derive the root from `pwd`.
- **`NN` comes from listing that directory**, two digits from `01`, counted across the whole lineage. The successor's session name is the handoff basename without the extension.
- **All ten sections of the capture contract, in order.** An empty one is an explicit `none` line with a reason, never omitted.
- **Label every claim `measured` or `predicted`; mark live state `PERISHABLE` with the wall-clock time it was measured** and the exact command that re-verifies it. Perishable beats priority.
- **Ids are copied verbatim in backticks** (PR number, tracker key, SHA, deploy id, session id, terminal handle); every path is absolute.
- **Write the file BEFORE launching the successor**, then launch it in the same worktree and the same harness. Never delete a predecessor's handoff.
- **A handoff is a repo artifact**: English, no AI attribution (Critical Rules #3 and #12), never committed (`.session/` is gitignored).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/session-handoff/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: shadcn

**Purpose**: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI.

**Compact Rules**:
- **Use existing components first.** Use `npx shadcn@latest search` to check registries before writing custom UI. Check community registries too.
- **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
- **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
- **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.
- **`className` for layout, not styling.** Never override component colors or typography.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.
- **Forms use `FieldGroup` + `Field`.** Never use raw `div` with `space-y-*` or `grid gap-*` for form layout.
- **`InputGroup` uses `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea` inside `InputGroup`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets (2–7 choices) use `ToggleGroup`.** Don't loop `Button` with manual active state.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/shadcn/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: sprint-development

**Purpose**: Orchestrates the per-story dev loop end-to-end: Planning -> Implementation -> Code Review -> Staging deploy -> (gated) Production deploy.

**Compact Rules**:
- **Automation identity is declared, never chosen.** Log into a running app ONLY as the account named in `.agents/project.yaml` → `testing.automation_identity` (variable NAMES there, values in `.env`). Slot unset or variable missing → STOP and report; never substitute another account, query the DB for one, create one, or reuse the human's browser session. See `references/live-ui-identity.md`.
- **Stack skills load at the step that writes in their domain.** DB-MCP schema / RLS / migration call → `supabase` + `supabase-postgres-best-practices` first; component or layout write → the design set (`frontend-design` + `ui-ux-pro-max` + `impeccable` + `emil-design-eng`, strategy doc §3.5) + `shadcn` + `tailwind-css-patterns` first; Stage 4/5 deploy → `deploy-to-vercel` next to `vercel-cli`; email work → `resend-cli`; public page → `seo`. Not installed → say so once with the install path (`bun setup`), then continue: never a silent skip, never a hard STOP (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- **Never bypass the app's own login path.** No service-role / secret / admin keys, no admin user-management APIs (list / create / mutate users), no generated magic or password-reset links, no locally-signed JWTs, no hand-crafted session cookies, no impersonation of any account — including "just to see the admin view". Surface the need as a finding instead.
- **Session material is ephemeral.** Cookie jars, `storageState.json`, token files, `.har` captures: session scratch directory only (never the repo tree), deleted BEFORE reporting, disclosed as `secrets_materialized:` + `cleaned:` in the report. Never echo a credential into a report, plan, commit, PR body, or tracker comment.
- **Live-UI validation is browser-based at the gate.** A UI story cannot be approved on HTTP-probe evidence alone; Tier 0 probes carry the inner loop and non-visual assertions only (`references/live-ui-validation.md` §7). Never validate against a production build.
- **Browser sessions are named, in memory, and closed.** `/playwright-cli` is the only browser path: every session is `-s=<name>` (never the default), never `--persistent` or `--profile`, never the human's own browser; credentials are typed only as `--raw fill <ref> "$VAR"`; one identity = one live browser (same-identity subagents run serially); every session is closed before the report and `playwright-cli list` proves it; never `close-all` / `kill-all` / `pkill`. Report `browser_sessions:` with the names. Detail: `references/live-ui-validation.md` §3.
- **A DEFINER function's `WHERE` clause is not authorization.** `SECURITY DEFINER` bypasses RLS unless the table declares `FORCE ROW LEVEL SECURITY` (verify for your schema; never assume it), so a filter on a caller-supplied identity or scope parameter selects rows — it does not decide who may ask. Writing or changing such a function requires BOTH an actor bind at step 0 (`if auth.uid() is not null and auth.uid() <> p_actor_user_id then raise ... errcode 'P0002'`) AND explicit scoping of every returned row; asserting the caller's own membership does NOT scope the result set. First ask whether `SECURITY INVOKER` — or deleting the identity parameter — removes the class instead. Prove it with a DB-integration test that attempts the spoof against the real database: a mocked `db.rpc` proves nothing. See `references/rpc-authorization.md`.
- **One PR per user story, always.** Size never splits a story into PRs; the Stage 1 forecast (`references/workload-forecast.md`) is informational and gates nothing. Granularity = atomic commits planned in the forecast `Commit plan` (one responsibility each, tests with their behaviour, every commit green). Merge the PR with a merge commit (`--no-ff`), never squash. NEVER stack or chain PRs unless the user explicitly asks for it in that run. A too-large story is split in the BACKLOG via `/product-management`, never by PR.
- **Merging a PR with a ticket key flips the ticket to Ready For QA, and the workflow has no way back.** Merge only into the final target (`staging`), only when truly ready (migrations applied if any, checks green). Never merge a ticket-keyed PR into any intermediate branch.
- **Ticket availability is queried, never read from prose.** Before planning or recommending a ticket, query the tracker live for that ticket and its direct blockers. `.context/dev-roadmap.md` is authoritative for dependency edges and mockup gates, never for current status — a recent timestamp on that file says nothing about a ticket's live status.
- **Config claims cite the file they came from.** Read `.agents/project.yaml` / `package.json` / `.env.example` before asserting what the project is configured to do. Never quote a value from a skill reference or worked example as project state.
- **Product docs are the PRD/SRS OR the business maps.** Fast-fail only when NEITHER set exists (Pre-requisites); never author a PRD, an SRS or a Constitution to satisfy the check: an existing app's product docs are its business maps + domain glossary + dev guide. Which files each case reads: `## Inputs` → "Product docs: PRD/SRS or business maps".
- **The app's stack is read, never assumed.** An app command is `{{stack.package_manager}} run {{stack.scripts.<role>}}` from `{{stack.app_root}}` (null role → skip that check and say so, never invent or add the script); branches come from `git_strategy.branches` (integration null → base and merge target are the production branch, never a literal `staging` / `develop`); a schema change goes through the DB MCP per `{{stack.database.migrations_tool}}`, after reading the migration history through it (`agentic-dev-core/references/db-change-doctrine.md`); capability `db` binds only a story that touches the database; the app's existing conventions (import alias, structure, test ids) win over this skill's defaults, and an existing test id is never renamed. See `## Stack parameters`.
- **Technical decisions are yours to make — but read the record before you make one.** Search the run's decision/escalation log, `.context/ADR/`, and the ticket plus its siblings BEFORE deciding OR asking. A decision already made is followed and cited, never re-derived; re-asking a settled question — even to a human, asked cold without the prior ruling in front of them — yields a contradiction, not an override. Genuinely unsettled and technical → decide it yourself via a scored judge panel of 3-5 independent lenses, then record the decision AND its scoring rationale where the next agent's search will find it. Escalate ONLY product/business calls, a novel security posture not already ratified, irreversible or destructive actions, and whatever the operator explicitly reserved. See `agentic-dev-core/references/decision-protocol.md`. **Product calls are the one configurable category**: a project that sets `decision_authority.product: decide` in `.agents/project.yaml` (no human PO in the loop) routes them to a scored, attributed decision subagent instead of escalating — read the block, then `decision-protocol.md` §5.1.
- **Tracker moves are named by slug, verified at the destination, never guessed.** Fire only the transitions `agentic-dev-core/references/artifact-lifecycle.md` §1 gives this stage (Stage 1 `start_working`; Stage 3 `pull_request` / `ready`; Stage 4 `deployed` / `fixed_and_deployed`; the bug-triage slugs) and re-read the status after every Stage 3 / Stage 4 event, firing the slug yourself when automation did not. Read `assignee` before and after every transition: merge automation reassigns to the developer. Slug missing for the work type → list the LIVE transitions, ask ONE question, fire the live id, recommend `bun run jira:sync-workflows`; never a remembered or cross-project id, never a hand-edited `.agents/jira-workflows.json`, never a silent skip.
- **A fleet worker stops at an open PR.** Batch-sprint with N>1 executors (`references/fleet-mode.md`): a worker is detected from its prompt (`/sprint-development <KEY> fleet worker` + a brief path), never from the environment; it runs Stages 1-3 on its one ticket without human checkpoints and without returning to its prompt; merge, staging deploy, shared-DB migrations, live-instance regeneration and the sprint report stay with the conductor. N=1 is unchanged byte for byte, and when the orchestration gate fails the launch file is still written and the orchestrator is never named.
- **Plan before code.** Stage 1 always runs; even a bug fix gets a one-paragraph root-cause analysis before the diff.
- **Verification cap=3**: lint + types + unit tests in parallel; green before any push.
- **Atomic commits**, semantic prefixes, no AI-attribution lines, never `--no-verify`, never force-push a pushed branch; a push to a protected branch resolves `git_strategy.policy.direct_push_to_protected` (Critical Rule #4: `allowed` pushes, `confirm` asks, `forbidden` routes through a PR).
- **Scope discipline**: touch only what the story states. No "while I'm here" refactors.
- **Docs travel with the change.** A story that adds, renames or retires a skill mode, a `package.json` script, a doc or `.context/` path, an MCP server or an env var, or changes a behaviour a page describes, patches every doc that names or describes it in the same PR, per `agentic-dev-core/references/docs-follow-through.md`; `bun run docs:check` proves the mechanical half.
- **Reviewer findings are adjudicated**, not auto-applied: each is verified against the diff + AC, or dismissed with a one-line reason. A big PR is reviewed commit by commit; fixes land as NEW commits (never amend or force-push pushed history).
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the stage you are running needs its full walkthrough, a gate fires, or the briefing tells you to load the full skill.

> Source: `.agents/skills/sprint-development/SKILL.md` · phase: `implementation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: supabase

**Purpose**: Use when doing ANY task involving Supabase.

**Compact Rules**:
- **Auth and session security**
- **Never use `user_metadata` claims in JWT-based authorization decisions.** In Supabase, `raw_user_meta_data` is user-editable and can appear in `auth.jwt()`, so it is unsafe for RLS policies or any other authorization logic. Store authorization data in `raw_app_meta_data` / `app_metadata` instead.
- **Deleting a user does not invalidate existing access tokens.** Sign out or revoke sessions first, keep JWT expiry short for sensitive apps, and for strict guarantees validate `session_id` against `auth.sessions` on sensitive operations.
- **If you use `app_metadata` or `auth.jwt()` for authorization, remember JWT claims are not always fresh until the user's token is refreshed.**
- **API key and client exposure**
- **Never expose the `service_role` or secret key in public clients.** Prefer publishable keys for frontend code. Legacy `anon` keys are only for compatibility. In Next.js, any `NEXT_PUBLIC_` env var is sent to the browser.
- **RLS, views, and privileged database code**
- **Views bypass RLS by default.** In Postgres 15 and above, use `CREATE VIEW ... WITH (security_invoker = true)`. In older versions of Postgres, protect your views by revoking access from the `anon` and `authenticated` roles, or by putting them in an unexposed schema.
- **UPDATE requires a SELECT policy.** In Postgres RLS, an UPDATE needs to first SELECT the row. Without a SELECT policy, updates silently return 0 rows — no error, just no change.
- **`auth.role()` is deprecated — use the `TO` clause instead.** Supabase has deprecated `auth.role()` in favour of specifying the target role directly on the policy with `TO authenticated` or `TO anon`. Beyond deprecation, `auth.role() = 'authenticated'` breaks silently when anonymous sign-ins are enabled, because anonymous users carry the `authenticated` Postgres role and pass the check regardless of whether the user is genuinely signed in.
- **`TO authenticated` alone is authentication without authorization (BOLA / IDOR).** Using `TO authenticated` only checks the role — it does not restrict which rows a user can access. The correct pattern combines `TO authenticated` with an ownership predicate in `USING`:
- **UPDATE policies require both `USING` and `WITH CHECK`.** Without `WITH CHECK`, a user can reassign a row's `user_id` to another user:
- **`SECURITY DEFINER` functions bypass RLS.** A `SECURITY DEFINER` function runs with its creator's privileges — typically a role with `bypassrls` (e.g., `postgres`). Never add `SECURITY DEFINER` to resolve a permission error; it silently removes access control without fixing the underlying cause. Prefer `SECURITY INVOKER`.
- **`SECURITY DEFINER` functions in `public` are callable by all roles.** Postgres grants `EXECUTE` to `PUBLIC` by default for every new function, so any `SECURITY DEFINER` function in `public` is a public API endpoint callable by `anon` and `authenticated` (which inherit from `PUBLIC`) without any additional grant. When `SECURITY DEFINER` is genuinely needed (e.g., bypassing RLS on an internal lookup table), keep the function in a non-exposed schema, always include an `auth.uid()` check in the function body, and run `supabase db advisors` after making changes.
- **Storage access control**
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/supabase/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: supabase-postgres-best-practices

**Purpose**: Postgres performance optimization and best practices from Supabase.

**Compact Rules**:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)
- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/supabase-postgres-best-practices/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: tailwind-css-patterns

**Purpose**: Provides comprehensive Tailwind CSS utility-first styling patterns including responsive design, layout utilities, flexbox, grid, spacing,...

**Compact Rules**:
- Styling React/Vue/Svelte components
- Building responsive layouts and grids
- Implementing design systems
- Adding dark mode support
- Optimizing CSS workflow
- **Start Mobile-First**: Write base styles for mobile, add responsive prefixes (`sm:`, `md:`, `lg:`) for larger screens
- **Use Design Tokens**: Leverage Tailwind's spacing, color, and typography scales
- **Compose Utilities**: Combine multiple utilities for complex styles
- **Extract Components**: Create reusable component classes for repeated patterns
- **Configure Theme**: Customize design tokens in `tailwind.config.js` or using `@theme`
- **Verify Changes**: Test at each breakpoint using DevTools responsive mode. Check for visual regressions and accessibility issues before committing.
- **Consistent Spacing**: Use Tailwind's spacing scale (4, 8, 12, 16, etc.)
- **Color Palette**: Stick to Tailwind's color system for consistency
- **Component Extraction**: Extract repeated patterns into reusable components
- **Utility Composition**: Prefer utility classes over `@apply` for maintainability
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/tailwind-css-patterns/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: testability-guide

**Purpose**: Generates a public in-app `/qa` page ("Software Testability Guide for QA") + a tool-agnostic credentials artifact (markdown body) the use...

**Compact Rules**:
- **T1.** NEVER hardcode credential values in the in-app `/qa` page or in the credentials artifact body. Reference environment / config slots by name (e.g. `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`); the real values live in `.env` and in the chosen publisher destination, never in source.
- **T2.** NEVER bypass drift detection. When the host-stack signature changes, respect the snapshot-comment mechanism (`/* qa-guide-snapshot: stack=…, generated=… */`) and propose a surgical patch — do NOT regenerate the page from scratch when a targeted diff suffices.
- **T3.** Gate `/qa` in production ONLY when the host is an internal tool / customer-facing product where an operational page would leak. For a **public practice / demo platform** (where `/qa` IS the teaching surface, e.g. the page that onboards external testers), the page is intentionally public — do NOT gate it. Detect the project type in pre-flight; when unsure, ask. Either way the page NEVER inlines real secrets (T1), so "public" means "public docs", not "public credentials".
- **T4.** NEVER include PII, real customer data, or production data examples in the testability guide. Demo users and sanitized fixtures only.
- **T5.** NEVER duplicate the credentials-artifact body across multiple publisher targets. The markdown body in `references/credentials-content-template.md` is the single source of truth; publishers are thin adapters.
- **T6.** NEVER assume idempotency without re-checking the snapshot comment. Re-runs MUST read the snapshot, diff against current detected stack, and only then decide no-op vs surgical patch vs fresh scaffold.
- **T7.** NEVER write the deployed commit SHA into the generated `/qa` source. The hero build stamp (`data-testid="qa-build-sha"`) reads it at RUNTIME from the platform env var whose NAME detection put in `qaConfig.build` (on Vercel `VERCEL_GIT_COMMIT_SHA`), with a visible fallback line when absent; the value stays out of the snapshot comment and the content-hash, so a redeploy is never drift (`references/page-craft.md` → Build stamp).
- **T8.** NEVER pick the testers' DB MCP from habit or hand them the agent's own `db` credential. The DB layer resolves from `stack.database` (`references/mcp-and-env-setup.md` §4.0): DBHub logged in as a `qa_*` read-only role by default; the Supabase MCP only as a `--read-only --project-ref` alternative for people who already hold a Supabase account; the `SUPABASE_ACCESS_TOKEN` personal access token is never published. Provisioning the read-only role is a database change on the route `stack.database.migrations_tool` names (`agentic-dev-core/references/db-change-doctrine.md`): this skill hands over the SQL and never applies it.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/testability-guide/SKILL.md` · phase: `foundation-extension` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: typescript-advanced-types

**Purpose**: Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for bu...

**Compact Rules**:
- Building type-safe libraries or frameworks
- Creating reusable generic components
- Implementing complex type inference logic
- Designing type-safe API clients
- Building form validation systems
- Creating strongly-typed configuration objects
- Implementing type-safe state management
- Migrating JavaScript codebases to TypeScript
- **Use `unknown` over `any`**: Enforce type checking
- **Prefer `interface` for object shapes**: Better error messages
- **Use `type` for unions and complex types**: More flexible
- **Leverage type inference**: Let TypeScript infer when possible
- **Create helper types**: Build reusable type utilities
- **Use const assertions**: Preserve literal types
- **Avoid type assertions**: Use type guards instead
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/typescript-advanced-types/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: ui-ux-pro-max

**Purpose**: UI/UX design intelligence for web and mobile.

**Compact Rules**:
- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces
- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries
- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/ui-ux-pro-max/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: unit-testing

**Purpose**: Focused skill for unit-test design — TDD workflow (red-green-refactor), test naming (AAA, Given-When-Then), mocking patterns (mocks/spies...

**Compact Rules**:
- **U1.** NEVER test implementation details (private helpers, internal state, call counts on internal methods). Test public behavior and observable contracts — implementation details refactor freely, tests should not.
- **U2.** NEVER over-mock. When a test mocks every collaborator, it verifies the mock graph rather than the code under test. Prefer real implementations + dependency injection at the seam; mock only true external boundaries (HTTP, DB, filesystem, time, randomness).
- **U3.** NEVER skip the red phase in TDD. Writing the test AFTER the code defeats the design feedback loop — the test must fail for the right reason before any production code is written.
- **U4.** NEVER use weak assertions (`expect(result).toBeTruthy()`, `expect(x).toBeDefined()`) when you actually mean an exact value. Weak assertions hide regressions; assert the specific value, shape, or error.
- **U5.** NEVER share mutable state between tests (module-level vars, singleton caches, shared fixtures mutated in-place). Order-dependent flakes are the result. Reset state in `beforeEach` or scope it inside the test.
- **U6.** NEVER chase 100% line coverage as a goal. Coverage is a signal, not a target — 100% with brittle mock-heavy tests is worse than 80% with behavior-driven tests. Mutation testing is the better signal when the question is "are my tests actually catching bugs?".
- **U7.** NEVER mock what you own without a real reason. Prefer dependency injection at the seam so the test can pass a fake or stub explicitly; reach for `jest.mock` / `vi.mock` only when the seam is unavoidable (module-level side effects, third-party SDK).
- **U8.** NEVER let a flaky test ship green. Either fix the root cause (timing, shared state, network) or quarantine with a tracked ticket — ignoring flakes erodes trust in the entire suite.
- **U9.** NEVER write tests for framework code (matchers behaving correctly, library internals, ORM mechanics). Test YOUR logic; trust the framework's own test suite.
- **Runner and command come from `stack:`** (`.agents/project.yaml`): the runner is `stack.test_runner`, the command is `{{stack.package_manager}} run {{stack.scripts.test}}`, test files live under `stack.app_root` next to their siblings. A non-null runner is the app's own: extend it, never add or swap in a second one. Only `stack.test_runner: null` (not chosen yet) opens runner setup, and the choice is recorded with `bun run agents:setup --stack`. A null `stack.scripts.test` is said, never invented.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix; none available at the step that needs it → STOP per `agentic-dev-core/references/mcp-capabilities.md` §4, never a silent substitute (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/unit-testing/SKILL.md` · phase: `implementation` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: vercel-cli

**Purpose**: Vercel CLI cookbook for this Next.js + Supabase + Vercel boilerplate.

**Compact Rules**:
- **`--no-wait` on deploy, `--wait` on inspect — never the other way around.** Inverting these means you either block for 10 minutes waiting on a deploy URL you needed immediately, or you race an unfinished deployment with a smoke test.
- **`vercel ls -m githubCommitSha=<sha>` is the canonical "find MY deploy" query.** No grep, no parsing, no race. Use `--format json` and `jq`.
- **Status filter values are UPPERCASE.** `vercel ls --status READY` works; `--status ready` returns empty with no error.
- **`vercel env pull` writes to `.env.local` by default.** That file is in `.gitignore` for a reason — never commit it. If you need a different filename, pass it as a positional arg.
- **Multi-team accounts need `--scope <team-slug>` on EVERY mutating command.** Otherwise the operation hits the wrong team's project, or fails with a confusing 404.
- **Always `--format json`** on `ls`, `env ls`, `teams ls`. Human tables include ANSI color and lose columns at narrow widths.
- **Always `--no-wait` on `vercel deploy`** in scripts. Capture the URL, then poll with `vercel inspect --wait` separately.
- **Always `--wait --timeout=10m`** on `vercel inspect` when verifying. Default behavior returns immediately with whatever state the deploy is in when the command runs — usually `BUILDING`, which tells you nothing.
- **Always pass `--scope <team-slug>`** if `vercel teams ls` shows more than one team. If the project is already linked, the `orgId` in `.vercel/project.json` / `.vercel/repo.json` resolves the team automatically and you can omit `--scope`.
- **Never grep `vercel ls` output for URLs.** Use metadata filters (`-m githubCommitSha=$SHA`) + `--format json` + `jq`. ANSI codes will break naive regex.
- **Never commit `.env.local`** produced by `vercel env pull`. It's gitignored; keep it that way.
- **Verify exit codes.** `vercel inspect --wait` exits 0 only on `READY`. Any non-zero is a real failure — surface it, don't swallow it.
- **Pin the CLI version in CI.** New majors have shifted flag shapes (e.g. `--confirm` → `--yes`). Document the pinned version in `package.json` devDependencies or in the CI workflow.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/vercel-cli/SKILL.md` · phase: `implementation` · kind: `utility` · source: frontmatter `compact_rules` (verbatim)
