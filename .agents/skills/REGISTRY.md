# Skill Registry (auto-generated)

> Generated: `2026-11-20T05:23:00.376Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.agents/skills/agentic-dev-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 39

---
## Skill: acli

**Purpose**: Atlassian CLI (`acli`) for Jira, Confluence and org admin.

**Compact Rules**:
- Pass `--paginate` (or an explicit `--limit`) on any search whose result is counted, iterated or decided on. Pagination is opt-in and truncation is silent: there is no warning.
- Exit 0 does not prove a subcommand exists. An unknown subcommand falls back to the parent help and exits 0, so check that the help body actually changed. Every multi-word flag is kebab-case; do not invent flags.
- Verify auth status before any bulk mutation (`acli jira auth status`). Auth is per product (jira, confluence, admin and global are separate sessions), and a silent expiry leaves the batch half-applied with no clean rollback.
- Pass the non-interactive confirmation flag on every mutating command in CI, or the command hangs waiting on stdin.
- Author rich text in Markdown, convert it with `scripts/md-to-adf.ts` and pass the ADF. The CLI never converts Markdown and stores the literal characters, and hand-written ADF trips the combined-marks bug.
- Let the converter's validation gate run on every ADF document before publishing, and read the field back after writing. The gate catches node-level errors; only the read-back catches Jira's silent server-side coercion.
- Measure the serialized ADF of every rich-text value (description, comment, rich-text custom field) before writing it: `jq -c . <file>.adf.json | wc -m` must stay at or under 30000. Jira's cap counts the ADF JSON, which is several times longer than the Markdown. Over budget means stop and propose which sections move where; truncating, or splitting one value across two fields or comments, is off the table. Detail: "Size budget" under "Publishing rich text".
- `workitem edit` takes no custom-field values. It hard-rejects every shape with exit 1, so editing a custom field on an existing item works only through the REST PUT path.
- `--status` matches a status name, not a transition id; when two transitions reach one status, use REST `POST .../transitions` with the id.
- Custom fields on `workitem create` go in `additionalAttributes` of `--from-json`, by numeric id.
- `workitem edit` does not set COMPONENTS either: there is no flag and no `--from-json` key, so the edit succeeds and leaves components untouched without saying so. Set them at create time, or change them through the same REST PUT path.
- The vendor's own `--help` examples are not safe to copy. Several omit the subcommand the flags live on (`workitem comment --key …` instead of `workitem comment create --key …`) and fail with `unknown flag`. The forms in this skill's references are the tested ones.
- Resolve a `customfield_NNNNN` id through the host project's slug catalog instead of hardcoding it in a script or generated output. Ids differ per workspace; slugs travel.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and is read through the accessor. An environment copy goes stale and points scripts at the wrong site.
- Creating an issue link: `--out` and `--in` are empirically inverted against Jira's semantics. `--out` takes the prerequisite, `--in` the dependent. List the link afterwards to verify the direction, and delete and recreate it with swapped flags if it landed backwards.
- Capture and surface the trace id from any backend failure. It is the only debug signal, and Atlassian Support needs it.
- Known blind spots (enumerating custom fields, editing custom-field values, workflows, issue types, versions, components, attachments, watchers, adding an item to a sprint) go through REST or the opt-in Atlassian MCP, not through forcing the CLI.
- A REST fallback that needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` runs inside the `.env` loader (`bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'`) or through a bundled script that loads `.env` itself (`scripts/jira-attach-media.ts`). Exporting them, running `source .env` or printing them in the agent's shell is off the table.
- Prefer API-token auth in scripted contexts, and pin the binary to an explicit version in production pipelines: tracking `latest` has caused same-day mass failures.

**Read full SKILL.md when**: composing a specific command, publishing rich text, running the REST PUT workaround, or working any surface outside Jira work items.

> Source: `.agents/skills/acli/SKILL.md` · phase: `unknown` · kind: `utility` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-core

**Purpose**: Shared doctrine host for the workflow skills: briefing, dispatch, decisions, secrets, ADRs, DB changes.

**Compact Rules**:
- `agentic-dev-core` is a passive reference library: it creates or modifies no file, runs no external command (no `bun install`, `git` or `gh`) and provides no bootstrap or init action. The layer installs whole: `create-agentic-dev` for a new project, `create-agentic-dev --adopt` then `/project-adoption` for an existing app.
- Work that looks adjacent belongs to another skill. `.context/` files go to `/agentic-dev-onboard` and `/project-foundation`. Tests, fixtures and test components go to `/unit-testing` and any test-automation skill. Adapting the framework to a stack goes to `/project-bootstrap` (new project) or `/project-adoption` (existing app). Project facts in `AGENTS.md` go to the docs follow-through (`references/docs-follow-through.md`), run inside the change that moved the fact. OpenAPI and API schemas go to `bun run api:sync`.
- Secret hygiene (Critical Rule #1, binds every skill and subagent): use a secret only through its variable name (`$VAR` in the shell, a name in the MCP loader's `--filter` list). Do not open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`, and do not print a value (`printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`). Check presence with `bun run setup:doctor --json` (set or missing per name). Do not run `varlock load`, even with `--agent`, against a schema `bun run vars:schema:check` has not passed: a scratch schema is banned because `--agent` redacts only `@sensitive` items. The human types every secret into `.env`; the AI writes a non-sensitive value (URL, project key, flag, port) only when asked, and only through `bun run env:set KEY=value`. Safe command shapes and the leak response: `references/secret-hygiene.md`.
- Instructions maintenance (ADR-0014, binds every skill and subagent): any change to `AGENTS.md`, a section under `.agents/instructions/`, the router or a `triggers:` list follows `references/instructions-doctrine.md`. Place each sentence with its §2 decision tree, run its §6 procedure and close with `bun run instructions:check`. Section prose stays out of `AGENTS.md`. A router row changes only with the ADR that decides it (`bun run instructions:check --accept-router ADR-NNNN`). A trigger miss is fixed in the section's `triggers:` plus a labelled prompt in `cli/lib/fixtures/instruction-router-eval.json`, and the eval set is never relabelled to hide it.
- GUARD architecture (ADR-0023, binds every skill and subagent that writes or reviews app code): code lives in four layers (`src/platform`, `src/adapters`, `src/features/<name>`, `src/app`) that import only downward, each feature has one door (`index.ts`, imported as `@features/<name>`), and `guard-manifest.json` is read before creating a feature or an action. Layers, rules R1 to R6, the layer map and the example: `references/guard-architecture.md`.
- Correction to check (ADR-0023, binds every skill and subagent): when a review finding repeats, the first remedy is a `guard` lint rule or a guard-manifest check whose message names the doctrine and the root-cause fix. Prose is the remedy only for what a machine cannot judge.
- Documentation contracts (ADR-0017, binds every skill and subagent that changes this boilerplate): close every change that adds, renames or retires a skill, a `package.json` script or a doc path, or that changes a behaviour a page describes, with the docs follow-through (`references/docs-follow-through.md`), decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) included, in the same PR. When an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line), update every page its `LINT.ThenChange(...)` names in the same push. Add `Docs-Checked: <label> <reason>` to a commit message only when the documented behaviour did not change, and never by reflex or without a reason; pre-push and CI block otherwise. A drift found later gets a new marker. When the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, run the drift sweep (follow-through §6) after the verification gates. It is report-only: it greps the doc surface for prose that describes the old behaviour and counts the `Docs-Checked:` trailers the change used.
- Sweep pending decisions (SPD, ADR-0019, binds the session the human types into: a top-level conductor, a super-conductor, an independent worker): when a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), ask all of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option. With no tool, or a refused call, use a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) never asks the human: no question tool, no `mkd` deck, no sweep. It sends what `references/decision-protocol.md` §5 escalates (§5.1 applied) and every error or blocker it cannot clear to its launcher (`ask`, then it ends its turn; `escalation`; or a `BLOCKED: ` status without a dispatch), which relays it. The one exception is a request the human typed into that session, or one its brief grants in writing; the session then tells its launcher what it asked and the answer. Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/agentic-dev-core/SKILL.md` · phase: `foundation` · kind: `core` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: agentic-dev-onboard

**Purpose**: Onboard a newcomer to this repo's dev flow and hand off to the right skill.

**Compact Rules**:
- Use `library-docs` (Context7) for "how to use X": official docs, current API
- Use `web-search` (Exa or Tavily, connected at harness level) for "how to solve X": community fixes, troubleshooting
- Use Atlassian only as a fallback; prefer the `/acli` skill (fewer tokens, faster)
- What this skill does not do:
- Implement features: use `/sprint-development`
- Write unit tests: use `/unit-testing`
- Refine acceptance criteria: use `/product-management`
- Define a brand-new product: use `/project-foundation`
- Scaffold backend or frontend code: use `/project-bootstrap` (greenfield only; `bun run bootstrap:guard` refuses its base phases on an existing app)
- Teach the agentic layer an existing app: use `/project-adoption`
- Generate the in-app `/qa` page and credentials artifact: use `/testability-guide`
- Entry path: `.template/installer.lock.json` with `adopted: true` is an adopted app (tour the adoption hand-off, never the `/project-bootstrap` base phases); otherwise it is a new project. Stack facts come from the `stack:` block of `.agents/project.yaml`, never from this skill's defaults.

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
- **A cloud worker writes code only; the conductor keeps everything that needs an authentication.** A worker in a Claude Code cloud session has no tracker, no Slack, no orchestration runtime and no database access token: it reports through PR comments (`STATUS`, `MIGRATION-READY`, `DONE`, `BLOCKED`), never merges, never applies a migration, and never keeps throwaway data. The conductor applies the migration only after the file is on `origin` and its SHA-256 equals the declared one, re-reads the live definition, runs the tests the cloud could not (a secret kept out of the environment), recounts the shared database, merges with a merge commit and walks the tracker with a read-back. The cloud environment is chosen per launch (`--settings`), never by rewriting the owner's account-wide default. Method, scripts and measured traps: `references/cloud-execution.md`.

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

**Purpose**: Writes DESIGN.md (Google Labs spec) for a product's visual identity, and designs one story's screen just in time.

**Compact Rules**:
- **D1.** Keep hex colours, font sizes and spacing values out of component code. They live in `DESIGN.md` frontmatter tokens and reach components through the Tailwind config or CSS variables.
- **D2.** Answer "what colour is X?" and "what is the spacing scale?" by reading `DESIGN.md`. The file is the source of truth, for the assistant too, so a guess is never an answer.
- **D3.** Rebrand surgically: upsert the tokens that change, keep the section order and the rationale prose. Regenerating from scratch loses both.
- **D4.** Ship a token rename with a migration path for its consumers. A silent rename breaks every downstream import and `tailwind.config.js` reference.
- **D5.** Do not override tokens inline (`style={{ color: '#fff' }}`, `className="text-[#1A1C1E]"`). The escape hatch becomes the rule and the token system rots.
- **D6.** Accept a designer's hand-off only as exported token JSON or a built `DESIGN.md`, never a Figma URL alone. Downstream scaffolds need design intent a machine can read.
- **D7.** Run the screen phase only on an explicit user opt-in, and take every mockup from a design tool: supplied by the user into `.context/designs/<project>/` (Mode B), commissioned through the Open Design MCP and exported there (Mode A, see `references/screen-design-mapping.md` S1), produced by Claude Code's own `design` skill, or generated as HTML through a loaded design skill (Mode C: the design set loaded before the first line of HTML, `agentic-dev-core/references/skill-composition-strategy.md` §3.5). The orchestrating AI never writes mockup markup itself with no design skill loaded. A prototype that settles one logic question is inspiration only, never a mockup or a spec. A human ratifies every mockup, whatever produced it.
- **D8.** In `extract` mode, copy the LIVE theme and nothing else: pick no catalog brand, invent no token, write no application code. `DESIGN.md` mirrors `tailwind.config.*`, the stylesheet the root layout imports and `components.json`, each value in its own CSS format with a `# <file> <selector>` provenance comment. A kind the code lacks is omitted and reported as a Discovery Gap. Only `DESIGN.md` (plus an accepted variant) and `.session/design-system/` may change. Lint must reach `errors: 0`, and a sub-AA warning the app ships is reported, never fixed in the token (`references/extract-from-code.md`).
- **D9.** Feature UI lives in `src/features/<x>/`, and shared primitives (the components built from the tokens) live in the design system (`agentic-dev-core/references/guard-architecture.md` §1).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/design-system/SKILL.md` · phase: `foundation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: design-taste-frontend

**Purpose**: tasteskill 2.5.1, the anti-slop frontend skill.

**Compact Rules**:
- **No caption or description under any image, render or visual.** Licence credits go in one
- **Every visual renders, never an empty ground,** at 1440, 1024, 768 and 390.
- **One section per screen:** the hero alone on the first screen, every section exactly one or
- **Equal left and right content edges.**
- **Hover micro-animations:** a linked card lifts 2px, a photo zooms 1.02-1.03 inside its frame,
- **More and better real photographs where they fit;** nicer backgrounds; better heroes, layouts
- **Real full-colour icons** (a known product's real icon, never a drawn one); small diagram
- **The big award-site scenes and creative moments are part of the skill:** every page deals its
- **Addresses:** street and district only (no street given: the district), no house number, postcode or coordinates; no register
- **Place** (a cafe, bakery, guesthouse, shop). Photographs lead: 12 to 20 on the full page, 8 to
- **Product and service** (site-kind other). Photographs lead: the product, the people, the rooms,
- **Every product page** (photographed, in stand-ins or rendered on a 3D ask, hardware too; the bar is Figure and 1X;
- **Tech** (software, gaming, hardware). The client's own subject leads at true size. Software: its
- **One object never carries the page.** The product or hero object whole leads the hero and **two more sections at
- **The client's own assets get slots.** A trailer, key art, screenshots, CAD renders or a motion
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/design-taste-frontend/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: emil-design-eng

**Purpose**: Emil Kowalski's design-engineering philosophy for UI polish, component design, animation decisions, and the invisible details that make s...

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

**Purpose**: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.

**Compact Rules**:
- Accenting just a single word or phrase in a headline, like putting one word in italic/bold or a different color.
- Using all caps for labels.
- Adding unnecessary typographic labels above content.
- a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757 — Anthropic's own Claude-interaction accent, so on a user's brief it reads as a tell);
- a near-black background with a single bright acid-green or vermilion accent;
- a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns;
- the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration;
- template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots ('A · B · C'); labels built as 'WORD — fragment' with a spaced em dash; tinted near-black (#0B0B0B, #111) standing in for black; a monospace face for small data labels; a '→' appended to link and button text.
- Color: describe the core base palette as 4–6 named hex values.
- Type: the typefaces and their roles.
- Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Include alignment guidance; should the content be left aligned, center aligned, justified?
- Principles: the high-level guidance for what makes this page unique.

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

**Purpose**: Administer Jira in two approval-gated modes: Components reconciliation and instance migration.

**Compact Rules**:
- Take the mode from the first token of `$ARGUMENTS`; with no match, ask, and a bare "fix Jira" or "sync Jira" picks none.
- One mode per run. Load only its reference, never combine the two or fall through into the other, and run only the selected reference's verification steps.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials is a hard stop (`AGENTS.md` Critical Rule #9). Name the exact env var, point at `.env` and `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read the live state before authoring any plan. Nothing is created, applied, deleted or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect, author the plan file, dry-run, wait for explicit approval, then `--apply`.
- `instance-migration`: resolve and confirm both instances, audit and verify reachability, wait for explicit approval, then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global, so a re-login repoints every repo on the host, not only this one.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and nowhere else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination: delete it, never update it, because a second copy is what goes stale.
- Template-repo carve-out: when `.agents/project.yaml` has `project.project_name` set to `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` as `null`, say so in the report, and do not create a commit to hide the emptiness.

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

**Purpose**: Renamed: load agent-orchestration.

**Compact Rules**:
- This skill was renamed: load the user-level skill `/agent-orchestration` (from `upex-galaxy/agentic-user-skills`) and follow it instead.
- If it is not installed, run `bun setup`; until then a fleet runs on one-shot subagents plus the `launch.txt` lines a human pastes.
- This repo's own parts are `agentic-dev-core/references/fleet-launch-seam.md`, `agentic-dev-core/references/fleet-provisioning.md` and `agentic-dev-core/references/fleet-project-profile.md`.
- This stub is deleted once every downstream repo has synced (ADR-0025).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/orca-orchestration/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

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

**Purpose**: Reviews a colleague's pull request as a Tech Lead against the repo's development doctrine, citing doctrine or code for every finding.

**Compact Rules**:
- Run the strictness preflight (Flexible, Standard or Strict) before reading any diff. If the invocation already answered it, do not ask again.
- At Flexible and Standard, a doctrine-pattern deviation is an observation framed as a comparison, never an error, and it does not move the score the way a Real defect does. Strict widens what counts as a finding; it does not turn a pattern note into an error.
- When the target repo ships its own doctrine (`AGENTS.md`, `.agents/skills/`, `.context/`), load it before analyzing. Only when it has none is this repo's doctrine the reference standard, and the output says so once, up front.
- Present a "best practice" as a repo requirement only with a `file §section` citation. An ungrounded call is labeled as opinion, in those words.
- Put every finding in exactly one bucket (Real, Pattern or Positive) with a severity from the shared scale in `sprint-development/references/review-pr.md` §"Adjudication contract" (`BLOCKER`, `MAJOR`, `MINOR`, `NIT`).
- Fill the Positive bucket. A review with no positives on a PR that clearly has some is uncalibrated, not rigorous.
- Read the actual diffs, never the PR description. On a PR too large for one diff, page the per-file patches, and check the commit headlines first so a lockfile, generated-types or vendor-sync commit is not reviewed line by line.
- When the PR has a ticket, plan or acceptance criteria to check against, review on two axes, Spec and Standards, each by its own reviewer in a fresh context, with the briefs in `sprint-development/references/review-pr.md` `## Two-axis review`. Check the new tests for lying tests (LT-1 and LT-2 with Spec, LT-3 with Standards), defined in `unit-testing/references/tdd-workflow.md`.
- Present the findings table, the positives and a score out of 10 as a checkpoint, then let the user triage and re-classify. Their context decides what ships; do not defend the first-pass severity.
- Skip what `guard` lint and `guard-manifest.json` already check (layer direction, feature door, thin app, registry). Spend GUARD review on judgment (`agentic-dev-core/references/guard-architecture.md`): is the action named as the business names it, is the feature a deep module (deletion test), is a new adapter a real seam or a hypothetical one (one adapter is hypothetical), does each exception carry an `eslint-disable` with a reason.
- Post to GitHub only after an explicit go-ahead on the final draft. Approval for a different PR does not carry over, and silence is not approval. The comment carries no AI-generated marker.
- With no person to ask, follow `## Who holds the gates`: the brief's strictness or Standard, no triage, and the draft saved to the report unless the brief names this PR and says to post.
- Drafting and posting stay with the orchestrator, because tone and an outward action are not for a subagent.
- Write the posted comment in English (Critical Rule #12) unless the user asked for another language for that comment.
- Review the PR and leave the fixing to its author: push nothing to the PR under review. A fix the user wants goes through the PR author or a separate branch through `/git-flow-master`. Submit a formal GitHub approval or change request only when the user asks for that action; the default artifact is a plain comment.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

> Source: `.agents/skills/pr-review-lead/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: product-management

**Purpose**: Manages the Jira product backlog after the PRD exists.

**Compact Rules**:
- **I1.** Never hardcode `customfield_NNNNN` IDs in skill or AI output. Resolve them through `{{jira.<slug>}}`.
- **I2.** Never prefix a story summary with `FR-XXX` and a dash. Put `**Source spec:** FR-XXX` as the first line of the body.
- **I3.** Never copy AC, Scope or Out-of-Scope content into the description. They live only in their custom fields.
- **I4.** Never let two stories in the same epic share a literal Scope bullet. Surface it as `overlap_alert` and have it resolved.
- **I5.** Never invent acceptance criteria, scope items or business rules. The source is the PRD, the SRS, a business map or explicit user input. With no source, report a `gap`, halt that field and continue with the rest.
- **I6.** Never batch several ADF custom fields in one MCP update call. Split per field, or pre-convert with `md-to-adf.ts`.
- **I7.** Never nest inline `code` inside `**bold**` markdown headed for ADF. The converter combines incompatible marks and Jira rejects the call with HTTP 400.
- **I8.** Never create stories without running the dependency-linking phase right after. Local declarations are not enough; the Jira links must exist.
- **I9.** Never hardcode `acli`, `mcp__atlassian__` or REST URL examples in this skill. Use `[ISSUE_TRACKER_TOOL]` pseudo-code; the tool skill owns the syntax.
- **I10.** Never use the word "Wave". Say "Sprint" (or "Master Sprint" or "Execution Sprint" when the layer matters).
- **I11.** Never skip sprint-sequencing after creating several linked stories.
- **I12.** Never hardcode link-type names (`"Dependencies"`, `"Blocks"`, `"Relates"`). Use `{{jira.link_types.<slug>}}`.
- **I13.** Never use `Relates` for a dependency whose order matters: it is symmetric and loses the direction. Use `Dependencies`, or flag the fallback explicitly as a degradation.
- **I14.** Never ignore cycle detection in sprint-sequencing. A cycle in the `dependencies` graph is a bug: halt and report.
- **I15.** Never put implementation surface in `{{jira.acceptance_criteria}}`, `{{jira.scope}}`, `{{jira.out_of_scope}}` or `{{jira.workflow}}`. Implementation surface means API or endpoint paths, HTTP status codes, DB table or column names, error-code identifiers (such as `VALIDATION_ERROR`), framework or library names, transaction or locking patterns, and internal algorithms. Those describe how; AC, Scope and Workflow describe what the persona observes, does or receives, and the how belongs in the impl-plan from `/sprint-development`. `{{jira.business_rules_specification}}` tolerates domain rules (boundaries, role gates, retry semantics, audit guarantees) but not internal algorithms. Exception: when the persona is an API consumer (DevEx, integration agent, headless client), endpoint paths and response shapes are part of their observable experience. Test: if the criterion stays true after a stack swap it is in business voice; if a swap breaks it, rewrite it.
- **I16.** Never populate `{{jira.ai_effort}}`, `{{jira.development_token_usage}}` or `{{jira.quality_token_usage}}` on create or edit. QA sets AI Effort in shift-left, the dev and QA agents measure the two token fields, and the PO refines the story. A `High` AI Effort is a size warning for the dev, never a gate: the PO may propose splitting the story (clone it, refine both, leave both Ready For Dev), and whoever resolves a split may add one optional label (`split-accepted`, `split-edited` or `split-rejected`; no label is valid), but nobody waits for it. No story points, no planning poker.
- **I17.** Never write `{{jira.acceptance_criteria}}` as plain text. Wrap every scenario in a fenced ```gherkin code block, on the first create and on every edit or re-format pass, because Jira ADF renders the fence as monospaced, highlighted text and that is the only readable shape for Given/When/Then in the Jira UI. When refining existing AC that was written unfenced, rewrite the whole field to apply the fence.
- **I18.** Never create or edit a story or epic before an active dependency-discovery pass over the current backlog graph (`.context/PBI/epic-tree.md`, the live Jira link graph and, when generated, the data map from `bun run context:map business-data-context`). The default is that no global or infrastructural dependency becomes a story link: generic prerequisites (auth exists, the DB exists, the framework is set up) are noise. Only feature-level, observable, explicit dependencies become candidate links. The output is a `(from, to, source-of-decision)` matrix, confirmed before any Jira link is written. "Link only if obviously needed" is rejected: discovery is an active step.
- **I19.** Never use a generic actor ("the user", "the customer", "the system") in the `As a` line of a story. The persona resolves to a named entity in `.context/PRD/user-personas.md` (a business-maps project with no PRD: an actor the domain glossary or the data map's `access-control` section names). When no persona matches, surface a `gap` and never invent one.
- **I20.** Never write the `As a … I want to … so that …` sentence as the story summary. The summary is `{Feature} | {Action}` (see Story title format) and the full sentence lives only in the description's `## User story` section. Persona and benefit never appear in the title. Domain-entity prefixes that collide with agile or QA vocabulary carry the `TMS-` (project-domain) tag; cross-cutting features stay plain. Epics keep noun-phrase titles (no pipe, no verb).
- **I21.** Never publish Jira content whose domain entity, process or state names diverge from `.context/business/domain-glossary.md`, and never use a term its anti-glossary bans (use the prescribed replacement). A needed term missing from the glossary is a `gap` for the PM to add through the glossary's change protocol, never a term to invent mid-story.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and never substitute silently (the built-in `WebSearch` or `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/product-management/SKILL.md` · phase: `management` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-adoption

**Purpose**: Adopts an existing app into the agentic layer after the `--adopt` install, with one approved plan and no change to the app.

**Compact Rules**:
- Run exactly one mode: `adopt` (the default, Phases 0 to 9 in `references/adoption-workflow.md`) or `check` (the Phase 0 signals plus the `bun run setup:doctor` stack drift section; read-only). Forward the rest of `$ARGUMENTS` unchanged.
- Entry gate: `.template/installer.lock.json` records `adopted: true` and `git status --porcelain` is empty (the adoption install is committed). A missing lock means the files were never installed: stop and say to run `bun <boilerplate clone>/cli/update-boilerplate.ts --adopt` first. A greenfield lock (`adopted` absent) means the repo was scaffolded: stop, because `/project-bootstrap` and `bun run agents:setup` own it.
- Phases 0 to 2 are sealed, with no tracked file changing. The seal is measured: `git status --porcelain` after Phase 2 differs from Phase 0 only by `.context/reports/project-adoption-plan.md`. Phase 3 starts once the person approves that plan in this run (`Status: PENDING APPROVAL` becomes `APPROVED`). Resume a plan from an earlier run and never rewrite it.
- The v1 support set is `V1_SUPPORTED` in `cli/lib/stack-descriptor.ts` (Next.js plus the Postgres family, bun). Anything outside it stops at analysis and names the field and value (owner decisions OD2, OD3), because adapting an unsupported stack or switching a package manager is what this limit prevents.
- One app per adoption: `stack.app_root` names it (OD6). A monorepo with several Next.js apps means you ask which one, and you never adopt two in one run.
- The refusal list binds every write and every briefing. Never write or delete a file under `stack.app_root` that existed before adoption. Never run a migration, apply SQL, change RLS, seed data or open a database connection in any environment (the adoption never touches a database; OD4 = C governs later delivery work, not this skill). Never add, remove, upgrade or downgrade an app dependency or regenerate its lockfile. Never edit CI workflows, `README.md`, `tsconfig.json`, eslint or prettier config, `.gitattributes`, `middleware.ts` / `proxy.ts` or an app `package.json` script. Never change git history, remotes, branch protection or rulesets. Never create Jira projects, fields, workflows or issues. Never push. Never write a secret value anywhere, `.env` included: the person types secrets, and `.env` takes non-sensitive values only.
- Writes stay on the agentic surfaces the approved plan names: `.agents/project.yaml` (identity, `stack:` through `bun run agents:setup --stack`, environments, `updater.protected_paths`), non-sensitive `.env` values, the Jira catalogs under `.agents/`, a hand-copied framework skill (upstream's copy saved under `.agents/prompts/adopt-upstream/` only, on its own approval line, the app's copy backed up first), `api/openapi*` when absent before adoption, the saved instruction merge (`.agents/prompts/adopt-instructions.md`, own approval line, originals under `.backups/project-adoption/`), the app's `<app>-context` skill (its `description` only; a legacy `## 0.` block moves verbatim into `references/app-instructions.md` on its own line, and that file is never rewritten) with its pointer in `.agents/instructions/agent-project.md`, the plaintext MCP credential copies `bun run harness:env` retires, the plan file, `.context/reports/project-adoption-architecture.md` and `.session/project-adoption/`. The full allowlist is `references/adoption-workflow.md` §Refusal list.
- A collision is refused file by file (OD7): a path the app already owned stays the app's, gets an `updater.protected_paths` entry and is reported. Never `take upstream` on an adopted repo, except for the app's hand copy of a framework skill (a folder upstream ships under `.agents/skills/`): it stays unprotected, and its row proposes `take upstream` on its own approval line (Phase 3).
- Web platform pass (Phase 1.7): run `npx modern-web-guidance@latest legacy-scan .` from `stack.app_root` (read-only) and put the findings in the plan as a modernization proposal, never applied. Record the Baseline target the questionnaire returned (`## Web platform` in `agent-project.md`, written at Phase 6 only on its approval line).
- Detection never guesses: an undetected value goes to the Phase 1 questionnaire or under `## Discovery Gaps`, and a null `stack.scripts.<x>` is skipped, with a note.
- The app is intact when its own `build`, `lint`, `types` and `test` exit codes after Phase 7 equal the Phase 1 baseline. Run a script that may reach a shared database or a paid API only when the questionnaire confirmed it is safe; otherwise record it as not measured.
- Fail-closed prerequisites a live app may lack (`testing.automation_identity`, `autonomous_delivery.automation_gh_account`, a dedicated DB role) go in the plan as owed by the team. This skill never creates them.
- An adopted app's product docs are the business maps and the glossary (OD5). Never invent a PRD or SRS: `/sprint-development` accepts the maps instead, and `/project-foundation` Discovery-only adds the dev guide and glossary.
- Close with the signal table, the plan marked `Status: COMPLETED` with its results block, and the hand-offs of the body table (`/project-context refresh-all` first, in a fresh session). Never chain them automatically, and propose the commit through `/git-flow-master` instead of making it silently.
- GUARD on an adopted app (`agentic-dev-core/references/guard-architecture.md` §3): the app keeps its folders and maps them to layers in its own `eslint.config.js` as `settings.guard.layers`. The plan proposes that block, derived from the folders the analysis found, and the team applies it, because eslint config is on the refusal list. Lint runs at `warn` and the team fixes violations over time. Copy no example into the app: the example belongs to new projects.
- Every gate that waits for a person has a path for a supervised worker and for a routine with nobody (the body section "With nobody at the keyboard", `agentic-dev-core/references/decision-protocol.md` §5.2).

**Read full SKILL.md when**: the entry gate fails in an unexpected way, the app's stack is outside the v1 set, the instruction merge is pending, or a verification step disagrees with the baseline.

> Source: `.agents/skills/project-adoption/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-bootstrap

**Purpose**: Scaffolds a new project's backend and frontend, plus API add-ons, once the PRD and SRS exist.

**Compact Rules**:
- **B0. Brownfield guard (fail-closed).** Run `bun run bootstrap:guard` at entry, before the session plan, and record its verdict and exit code in `plan.md`. Exit 2 (`existing-app`: an adoption lock, an app `package.json` or app files) refuses the base phases (backend setup and frontend setup: tables, RLS, seed, clients, `middleware.ts` / `proxy.ts`, layout, theme, `tailwind.config`, `shadcn init`, `next@latest`, README, demo pages, demo credentials). Quote the signals and route to `/project-adoption` (design identity: `/design-system extract`). The add-on phases stay available and read `stack:`. A base phase runs only on a plan that recorded exit 0, so a missing verdict means refused. Never override the verdict by reading the tree yourself.
- **B1.** A new project uses the GUARD default layout (`agentic-dev-core/references/guard-architecture.md` §1: `src/app`, `src/features`, `src/adapters`, `src/platform`), with the example already inserted by the installer. The backend `api/`, `schemas/` and `db/` boundaries are its layer map (`api/` routes in `app`, `schemas/` and domain in `features`, `db/` in `adapters`), and the design-system structure stays in the frontend. That structure is framework architecture, and AGENTS.md §2 SIMPLICITY FIRST exempts it from the ban on speculative abstraction.
- **B2.** Validate env vars at boot (Zod or an equivalent schema check). A missing variable that passes silently shows up as a cryptic production failure far from its cause.
- **B3.** Never clobber existing scaffolding. B0 refuses the base phases on an existing app, so this rule binds the add-ons and a resumed greenfield run. Detect prior state under `app/`, `lib/` and `db/`, apply upsert semantics, patch surgically and keep the user's edits.
- **B4.** Keep credentials, URLs and environment-specific values out of scaffolded code: secrets go in `.env`, non-secret config in `.agents/project.yaml`.
- **B5.** Scaffold the frontend only once `DESIGN.md` exists at the repo root. Its tokens are the input contract for Phase 2, so run `/design-system` first. Never emit `tailwind.config`, `globals.css` or CSS variables over an app's existing theme: `/design-system extract` records an existing design identity, and nothing here replaces it.
- **B6.** Generate the Supabase types whenever you scaffold the DB layer. Runtime TypeScript types have to match the live schema, because drift is a silent bug factory.
- **B7.** Ship bearer-token auth with rate limiting and secret-rotation guidance in the same scaffold. Auth without both is a half-finished feature.
- **B8.** Scaffold OpenAPI with the Scalar UI route at `/api/docs` (the `@scalar/nextjs-api-reference` route handler), so the contract is browsable from day one and downstream consumers trust it. Scalar is the standard for this stack: do not ship Redoc or Swagger instead. An existing app that already serves its own docs UI keeps it, and Scalar goes beside it only on the user's OK, never as a replacement.
- **B9.** Load the stack skills before writing the DB layer or the UI layer. `supabase` and `supabase-postgres-best-practices` come before any install, DB-MCP schema, RLS or migration call, or type generation. The design set (`frontend-design`, `ui-ux-pro-max`, `impeccable`, `emil-design-eng`, `modern-web-guidance`, strategy doc §3.5), `shadcn` and `tailwind-css-patterns` come before the component strategy (Phase 1.6 of `references/frontend-setup.md`). A skill that is not installed is said once, with a pointer to `bun setup`, and the work continues; never skip silently (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- **B10.** Database changes go through the DB MCP under `agentic-dev-core/references/db-change-doctrine.md`: read `list_migrations` before the first write, run DDL only through `apply_migration`, take the route `stack.database.migrations_tool` names, verify at the destination, and record an ADR for an architecturally significant migration.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and never substitute silently (the built-in `WebSearch` / `WebFetch` only when the user chooses them).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/project-bootstrap/SKILL.md` · phase: `foundation` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: project-context

**Purpose**: Generate or refresh project context: the business data, feature and API maps, the master implementation plan and the dev roadmap.

**Compact Rules**:
- Run exactly one mode: `data`, `features`, `api`, `master-plan`, `dev-roadmap`, `refresh-all` or `context-skill`. The first token of `$ARGUMENTS` is the mode when it matches one of these; otherwise resolve it from the trigger phrases in Mode routing. Load only that mode's reference, and open a second one only when `refresh-all` reaches it.
- When the user named no mode, ask. A generic "refresh the context" is not `refresh-all`, because that chain rewrites five artifacts and the user has to ask for it.
- The Mode routing table below maps each mode to its reference and its output file. Map modes write into the context skill's `references/<map>.html`; `master-plan` and `dev-roadmap` write `.context/master-implementation-plan.md` and `.context/dev-roadmap.md`.
- `context-skill` scaffolds a project-owned `<aspect>-context` (`references/context-skill.md`, contract `agentic-dev-core/references/skill-scaffold.md` §3-§5) through `skill-creator` (T3), for an aspect the business maps do not cover. It cites its sources and copies nothing from them, and `refresh-all` never includes it. Its router row goes in the "Project context skills" table of `.agents/instructions/agent-project.md`, not in the synced `agent-skills-and-mcps.md`, because `bun sync` would drop it.
- `refresh-all` runs `data`, `features`, `api`, `master-plan`, `dev-roadmap` in that order, one at a time. Each reference's own validation and approval gate closes before the next one loads.
- A map mode writes only its own skill's `references/<map>.html`, read and checked through `bun run context:map <skill>`. The map skill already exists (delivered by `bun sync`, never scaffolded here). A project's legacy `.context/business/business-*-map.md` (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) is read as input and is never deleted.
- A missing artifact, or a placeholder map, is CREATE mode: write once the analysis completes. An existing artifact is UPDATE mode: generate a candidate (for a map, only its stale sections), show the diff summary and wait for explicit approval. Overwriting without that approval, or regenerating a whole generated map, destroys edits its readers depend on. A map candidate holds its stale sections only (`business-context-maps.md` §4-§5), and `dev-roadmap` UPDATE is surgical: it regenerates the sort section and keeps the hand-authored edges and gates, as its reference defines.
- Read `stack:` once per run (`.agents/project.yaml`, leaves `{{stack.<path>}}`) and parametrize the mode as `## Stack parameters` describes: every app path under `{{stack.app_root}}`, one app per run; the schema from `{{stack.database.schema_source}}` (`live` through `[DB_TOOL]` against the active env, production only when the user names it for this run; `migrations` from the files under `{{stack.database.migrations_dir}}`, offline). A null leaf means the app has none: skip it and say so. A missing block takes the defaults of `.agents/project.schema.yaml` plus one Discovery Gap naming `bun run agents:setup --stack`.
- Hard dependency gates stop the run with the reference's exact message (the table in Dependency gates lists them). `master-plan` needs a generated data map, which `bun run context:map business-data-context` shows by printing sections instead of the placeholder notice. A missing soft dependency is a Discovery Gap and the run continues. `dev-roadmap` needs at least one epic with child stories in the issue tracker, and `api` needs an OpenAPI spec, a route-scannable backend or a Supabase-direct API.
- Business facts come from sources. Read every source the selected reference requires; what stays unverified goes under the output's mandatory `## Discovery Gaps`, not into the body.
- After a map write, review that skill's `## Rules` and `references/gotchas.md` against the new map and propose any change; the rules themselves are not rewritten here.
- After a successful artifact write, add its pointer to `.agents/instructions/agent-project.md` (`## Key paths (this project)`), and only when neither the shared Key paths in `.agents/instructions/agent-context-map.md` nor that file names it yet. `AGENTS.md` is the boilerplate-owned always-on layer and `bun sync` overwrites the shared sections (`agentic-dev-core/references/docs-follow-through.md`). `CLAUDE.md` is the generated `@AGENTS.md` shim and takes no operational prose. Placement follows `agentic-dev-core/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change runs that reference's §6 procedure.
- Forward the rest of `$ARGUMENTS` (everything after the mode token) unchanged to the selected mode: project path, module filter, epic key or Master Sprint name, as each reference defines.
- Resolve each capability in `metadata.requires_capabilities` by tool-name suffix, any prefix (`diagrams`, for the maps' figures, by the `diagram-design` skill's presence). When none is available at the step that needs it, stop as `agentic-dev-core/references/mcp-capabilities.md` §4 says; built-in `WebSearch` and `WebFetch` stand in only when the user chooses them.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

> Source: `.agents/skills/project-context/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-foundation

**Purpose**: Defines a product before code: Constitution, PRD, SRS and discovery docs (business maps, dev guide, glossary).

**Compact Rules**:
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

**Purpose**: Hand a whole session to a fresh successor through a handoff file, so work continues as if the context window had been extended.

**Compact Rules**:
- The file lives in the primary checkout, `<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md`, also from a linked worktree (`.agents/README.md` "Checkout roots"). Do not derive the root from `pwd`.
- `NN` comes from listing that directory (two digits from `01`, across the whole lineage). The successor's session name is the handoff basename.
- Write all ten sections of the capture contract, in order. An empty one gets an explicit `none` line with a reason.
- Label each claim `measured`, `read` or `predicted`. Mark live state `PERISHABLE` with the time it was measured and the exact command that re-verifies it. Perishable beats priority.
- Copy ids verbatim, in backticks (PR number, tracker key, SHA, deploy id, session id, terminal handle). Write every path as absolute.
- Finish the file before launching the successor, in the same worktree and on the same harness. Keep every earlier handoff.
- Launch only when a person is present, the conductor says so, or the delegating brief names the launch. Otherwise print the launch line and report (`## With nobody at the keyboard`).
- A handoff is a repo artifact: English, no AI attribution (Critical Rules #3 and #12), never committed (`.session/` is gitignored). It names the variable a credential lives under (`$STAGING_USER_PASSWORD`), never the value, and leaves out session cookies, tokens and `.auth/**` paths (Critical Rule #1; `AGENTS.md` §3 ephemeral-artifact contract).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/session-handoff/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: shadcn

**Purpose**: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces.

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
- **Use scoped personal access tokens for the Management API, CLI, and MCP server.** A classic personal access token carries the user's full account access, on every organization and project. For scripts, CI, and agents, have the user create a scoped token limited to the organizations, projects, and permissions the task needs. The [personal access tokens guide](https://supabase.com/docs/guides/platform/personal-access-tokens.md) lists the permission each Management API endpoint and MCP tool requires. Look permissions up there rather than guessing.
- **RLS, views, and privileged database code**
- **Views bypass RLS by default.** In Postgres 15 and above, use `CREATE VIEW ... WITH (security_invoker = true)`. In older versions of Postgres, protect your views by revoking access from the `anon` and `authenticated` roles, or by putting them in an unexposed schema.
- **UPDATE requires a SELECT policy.** In Postgres RLS, an UPDATE needs to first SELECT the row. Without a SELECT policy, updates silently return 0 rows — no error, just no change.
- **`auth.role()` is deprecated — use the `TO` clause instead.** Supabase has deprecated `auth.role()` in favour of specifying the target role directly on the policy with `TO authenticated` or `TO anon`. Beyond deprecation, `auth.role() = 'authenticated'` breaks silently when anonymous sign-ins are enabled, because anonymous users carry the `authenticated` Postgres role and pass the check regardless of whether the user is genuinely signed in.
- **`TO authenticated` alone is authentication without authorization (BOLA / IDOR).** Using `TO authenticated` only checks the role — it does not restrict which rows a user can access. The correct pattern combines `TO authenticated` with an ownership predicate in `USING`:
- **UPDATE policies require both `USING` and `WITH CHECK`.** Without `WITH CHECK`, a user can reassign a row's `user_id` to another user:
- **`SECURITY DEFINER` functions bypass RLS.** A `SECURITY DEFINER` function runs with its creator's privileges — typically a role with `bypassrls` (e.g., `postgres`). Never add `SECURITY DEFINER` to resolve a permission error; it silently removes access control without fixing the underlying cause. Prefer `SECURITY INVOKER`.
- **`SECURITY DEFINER` functions in `public` are callable by all roles.** Postgres grants `EXECUTE` to `PUBLIC` by default for every new function, so any `SECURITY DEFINER` function in `public` is a public API endpoint callable by `anon` and `authenticated` (which inherit from `PUBLIC`) without any additional grant. When `SECURITY DEFINER` is genuinely needed (e.g., bypassing RLS on an internal lookup table), keep the function in a non-exposed schema, always include an `auth.uid()` check in the function body, and run `supabase db advisors` after making changes.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/supabase/SKILL.md` · phase: `unknown` · kind: `unknown` · extraction strategy: B

---

## Skill: supabase-postgres-best-practices

**Purpose**: Postgres best practices maintained by Supabase, for Postgres running anywhere.

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

**Purpose**: Builds the in-app `/qa` page ("Software Testability Guide for QA") and a credentials artifact for testers and AI agents.

**Compact Rules**:
- **T1.** The `/qa` page and the credentials artifact body never contain a credential value. They name the slot (`LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`); the real values live in `.env` and at the chosen publisher destination, never in source.
- **T2.** Drift detection decides what gets written. When the host-stack signature changed, read the snapshot comment (`/* qa-guide-snapshot: stack=…, generated=… */`) and propose a surgical patch. Regenerate the page from scratch only when no targeted diff can carry the change.
- **T3.** Gate `/qa` in production only when the host is an internal tool or a customer-facing product where an operational page would leak. A public practice or demo platform, where `/qa` is the teaching surface (for example the page that onboards external testers), keeps the page public. Detect the project type in pre-flight and ask when unsure (with nobody to ask, gate the page and say so in the report). Public means public docs, never public credentials (T1).
- **T4.** The guide contains no PII, real customer data or production data examples. Demo users and sanitized fixtures only.
- **T5.** The markdown body in `references/credentials-content-template.md` is the single source of truth for the credentials artifact. Publishers are thin adapters, so the body is never copied into several publisher targets.
- **T6.** Idempotency is checked, never assumed. A re-run reads the snapshot, diffs it against the detected stack, and only then chooses no-op, surgical patch or fresh scaffold.
- **T7.** The deployed commit SHA never enters the generated `/qa` source. The hero build stamp (`data-testid="qa-build-sha"`) reads it at runtime from the platform env var whose NAME detection put in `qaConfig.build` (on Vercel `VERCEL_GIT_COMMIT_SHA`) and shows a visible fallback line when it is absent. The value stays out of the snapshot comment and the content-hash, so a redeploy is never drift (Build stamp section of `references/page-craft.md`).
- **T8.** The testers' DB MCP comes from `stack.database` (`references/mcp-and-env-setup.md` §4.0), never from habit, and testers never get the agent's own `db` credential. DBHub logged in as a `qa_*` read-only role is the default; the Supabase MCP is only a `--read-only --project-ref` alternative for people who already hold a Supabase account; the `SUPABASE_ACCESS_TOKEN` personal access token is never published. Provisioning the read-only role is a database change on the route `stack.database.migrations_tool` names (`agentic-dev-core/references/db-change-doctrine.md`): this skill hands over the SQL and never applies it.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 instead of substituting silently (built-in `WebSearch` / `WebFetch` only when the user chooses it).

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

**Purpose**: Design and write unit tests: TDD, test naming, mocking, coverage.

**Compact Rules**:
- **U1.** Test public behavior and observable contracts, not implementation details (private helpers, internal state, call counts on internal methods). Implementation refactors freely and the tests should survive it. A test that breaks on a behavior-preserving refactor is a lying test (see Lying tests in `references/tdd-workflow.md`).
- **U2.** Do not over-mock. A test that mocks every collaborator verifies the mock graph, not the code under test. Prefer real implementations plus dependency injection at the seam, and mock only true external boundaries (HTTP, DB, filesystem, time, randomness).
- **U3.** Watch the test fail before writing the production code. A test written after the code gives no design feedback, and it must fail for the right reason (an assertion, not a setup error).
- **U4.** Assert the exact value, shape or error. `expect(result).toBeTruthy()` and `expect(x).toBeDefined()` hide regressions when you mean a specific value (see Lying tests in `references/tdd-workflow.md`).
- **U5.** Keep state out of the space between tests: no module-level variables, singleton caches or fixtures mutated in place. Shared state causes order-dependent flakes, so reset it in `beforeEach` or scope it inside the test.
- **U6.** Treat coverage as a signal, not a target. 100% with brittle, mock-heavy tests is worse than 80% with behavior-driven ones. Mutation testing answers "do my tests catch bugs?" better than line coverage.
- **U7.** Mock what you own only with a real reason. Inject a fake or stub at the seam, and reach for `jest.mock` / `vi.mock` only when the seam is unavoidable (module-level side effects, a third-party SDK).
- **U8.** A flaky test never ships green. Fix the root cause (timing, shared state, network) or quarantine it with a tracked ticket, because ignored flakes erode trust in the whole suite.
- **U9.** Test your own logic, not the framework's (matcher behavior, library internals, ORM mechanics). The framework has its own test suite.
- **U10.** In a GUARD app, test a feature through its door (`@features/<x>`), never its internals; fake adapters at the port. The interface is the test surface (`agentic-dev-core/references/guard-architecture.md` §6).
- **Runner and command come from `stack:`** (`.agents/project.yaml`): the runner is `stack.test_runner`, the command is `{{stack.package_manager}} run {{stack.scripts.test}}`, and test files live under `stack.app_root` next to their siblings. A non-null runner is the app's own: extend it, never add or swap in a second one. Only `stack.test_runner: null` (not chosen yet) opens runner setup, and the choice is recorded with `bun run agents:setup --stack`. A null `stack.scripts.test` is reported, never invented.
- **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 and do not substitute silently (built-in `WebSearch` / `WebFetch` only when the user chooses it).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/unit-testing/SKILL.md` · phase: `implementation` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: vercel-cli

**Purpose**: Vercel CLI cookbook for verifying deploys, syncing env vars, reading logs and rolling back.

**Compact Rules**:
- Use `--no-wait` on `vercel deploy` and `--wait` on `vercel inspect`, never the other way round. Inverted, you either block for 10 minutes on a URL you needed at once, or you smoke-test a deployment that has not finished.
- Find your own deploy with `vercel ls -m githubCommitSha=<sha> --format json` and `jq`. It needs no grep and no parsing, and it cannot race a sibling branch.
- Status filter values are UPPERCASE. `vercel ls --status READY` works; `--status ready` returns an empty list with no error.
- `vercel env pull` writes `.env.local` by default. That file is gitignored, so keep it out of every commit. To write a different file, pass the name as a positional argument.
- Pass `--format json` to `ls`, `env ls` and `teams ls`. The human tables carry ANSI colour and lose columns at narrow widths.
- Pass `--no-wait` to `vercel deploy` in scripts, capture the URL, then poll with `vercel inspect --wait` as a separate step.
- Verify with `vercel inspect <url> --wait --timeout=10m`. Without `--wait` it returns the state at call time, usually `BUILDING`, which tells you nothing.
- On an account with more than one team (`vercel teams ls`), pass `--scope <team-slug>` on every mutating command, or the operation hits the wrong team's project or fails with a confusing 404. A linked project resolves the team from `orgId` in `.vercel/project.json` or `.vercel/repo.json`, so `--scope` can then be omitted.
- Do not grep `vercel ls` output for URLs. ANSI codes break the regex; use the metadata filter, `--format json` and `jq`.
- Treat a non-zero exit from `vercel inspect --wait` as a real failure (only `READY` exits 0), and surface it.
- Pin the CLI version in CI (in `package.json` devDependencies or the workflow). Majors have changed flag shapes, for example `--confirm` to `--yes`.
- A production deploy, a rollback and any env write or removal on the `production` scope are outward actions. Run them when a person asked for them or the delegating brief covers them; otherwise do the reads, stop and report.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/vercel-cli/SKILL.md` · phase: `implementation` · kind: `utility` · source: frontmatter `compact_rules` (verbatim)
