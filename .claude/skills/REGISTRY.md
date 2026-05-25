# Skill Registry (auto-generated)

> Generated: `2026-05-25T08:48:10.839Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.claude/skills/agentic-dev-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 12

---
## Skill: acli

**Purpose**: Atlassian CLI (official `acli` binary, v1.3+ as of 2026) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal.

**Compact Rules**:
- **Silent pagination truncation.** `workitem search` without `--paginate` returns the first page only — no warning. Scripts that count or iterate keys read the wrong number of items.
- **Auth is per-product.** `acli jira auth login` does not authenticate `acli admin`, `acli confluence`, or `acli rovodev`. There is also a top-level `acli auth` for global OAuth (newer surface). Each scope has its own session.
- **The "work item" vs "issue" split.** The CLI renamed commands (`jira issue` → `jira workitem`) but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType`/`parentIssueId` spellings. Mixing old and new terminology in the same script works, but confuses readers.
- **Unknown subcommands fail silently.** Typing `acli jira workflow --help` does NOT error — it falls back to `acli jira --help` with exit 0. So "no error" ≠ "command exists". Always verify by checking the help body actually changed.
- **Hard limits the docs do not advertise.** `acli` cannot list custom fields, edit custom-field values on existing items, manage workflows, manage issue types, or touch project versions/components. See `references/gotchas.md`.
- Read `complementary_categories` from this skill's frontmatter (`issue-tracker`).
- Resolve via the host repo's skill-registry cache (`.claude/skills/REGISTRY.md`, built by `scripts/build-skill-registry.ts`). Fallback: scan the session-start `system-reminder` skill list.
- Apply the threshold rule per the host repo's skill-composition strategy doc (T1 / T3 silent; T4 ASK).
- The Atlassian MCP fallback documented below is OPT-IN, not a skill — enable manually via `docs/mcp/`.
- `acli` binary is not installed in the environment.
- `acli` auth fails and cannot be fixed in the current session.
- The operation is one of the documented `acli` blind spots: enumerate custom fields, edit custom-field values on existing work items, manage workflows / issue types / priorities / resolutions / project versions / components, upload attachments, add watchers, add an item to a sprint.
- Bulk operations (acli consumes far fewer tokens per call).
- Scripting / CI pipelines.
- Operations that return large result sets (MCP payloads inflate token usage).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/acli/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: agentic-dev-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- agentic-dev-core/references/briefing-template.md
- agentic-dev-core/references/dispatch-patterns.md
- Read `complementary_categories` from this skill's frontmatter (`language`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply when consulting agentic-dev-core/references/typescript-patterns.md? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents that consume `references/typescript-patterns.md`, inject a `## Composable Skills` block per strategy doc §6.2.
- Provide a bootstrap or init action — clone the full repo instead.
- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/agentic-dev-onboard` and `/project-foundation`).
- Generate or scaffold tests, fixtures, or test components (that belongs to `/unit-testing` and test-automation skills).
- Adapt the framework to a specific stack (that belongs to `/project-bootstrap`).
- Sync project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-core/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: agentic-dev-onboard

**Purpose**: Walks new users through this repo's dev flow — Next.js + Supabase stack, Jira workflow (Ready For Dev → In Progress → In Review → Ready F...

**Compact Rules**:
- Read `complementary_categories` from this skill's frontmatter.
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- Apply threshold rule per strategy doc §3.2 (T1/T3 silent; T4 ASK).
- Inject a `## Composable Skills` block per strategy doc §6.2 only when (rarely) dispatching a sub-agent.
- Use **Context7** for "how to use X" — official docs, current API
- Use **Tavily** for "how to solve X" — community fixes, troubleshooting
- Use **Atlassian** only as fallback — prefer `/acli` skill (fewer tokens, faster)
- **§1 CRITICAL RULES** — 12 rules that override defaults (credentials, plan-before-coding, no AI attribution, MCP credential failure protocol, `READ package.json DIRECTLY`).
- **§4 CONTEXT LOADING MAP** — task → trigger phrase → skill → context files → primary tool.
- **§5 SKILLS + COMMANDS + MCPs REGISTRY** — full T1/T3/T4 skill model.
- **§12 PROACTIVE MEMORY TRIGGERS** — when to call `mem_save` without being asked.
- [ ] Did you run the setup script (`bun run setup` — verify name in `package.json`)?
- [ ] Did you fill `.env` with your own credentials (`LOCAL_*`, `STAGING_*`, `ATLASSIAN_*`, `TAVILY_API_KEY`, `SUPABASE_*`)?
- [ ] Does the agents linter (`bun run vars:check` per `package.json`) exit clean (0 errors)?
- [ ] Does Engram appear in the active MCP list (restart your agent if not)?
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/agentic-dev-onboard/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: design-system

**Purpose**: Genera un DESIGN.md (formato Google Labs Apache-2.0) en el root del proyecto antes del scaffolding del frontend.

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching to a subagent (Open Design or Claude Design handoff conversion).
- `agentic-dev-core/references/dispatch-patterns.md` — selects Single / Sequential / Parallel for the chosen path.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/design-system/`, archive on completion.
- `.context/business/business-model.md` — industria, value-prop, tone implícito.
- `.context/PRD/personas.md` — target visual, demographic signal.
- `.context/PRD/executive-summary.md` — positioning, success KPIs.
- Read `complementary_categories` from this skill's frontmatter (`frontend-ui`, `accessibility`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this design-system work? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents (Open Design conversion, Claude Design handoff, LLM-authored custom DESIGN.md), inject a `## Composable Skills` block per strategy doc §6.2.
- A new project just finished the PRD and needs to define visual identity before the SRS architecture phase.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/design-system/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: git-flow-master

**Purpose**: End-to-end Git operator for any branching strategy.

**Compact Rules**:
- "I want to start work on UPEX-123" → branch creation
- "commit and push", "subir cambios", "push to main" → commit + push flow
- "abrí un PR contra staging" → PR creation
- "tengo conflictos al hacer pull" → conflict resolution
- "este PR va a quedar enorme" → chained-PR planning hand-off
- "qué estrategia de git usamos en este repo" → strategy detection / persistence
- "el push fue rechazado" → diagnostic + recovery flow
- Read `complementary_categories` from this skill's frontmatter.
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for these Git operations? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents (PR creation, conflict resolution, chained-PR planning), inject a `## Composable Skills` block per strategy doc §6.2.
- Current branch.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/git-flow-master/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: product-management

**Purpose**: Orchestrates continuous product management work — initial backlog seed from PRD, incremental feature addition, epic creation, story refin...

**Compact Rules**:
- A new feature or epic needs to be added to the backlog
- A story has rough or ambiguous acceptance criteria that need sharpening
- A story needs INVEST validation or a 3-amigos session before development starts
- You're systematically enumerating edge cases / failure modes for a feature
- You're seeding the very first product backlog from a freshly minted PRD
- `/project-foundation` should have produced `.context/PRD/` and `.context/SRS/` (required for the initial backlog-seed workflow; useful context for all others)
- `.agents/project.yaml` populated with `{{PROJECT_KEY}}`, `{{ISSUE_TRACKER}}`, `{{ATLASSIAN_URL}}` — these ship with the cloned boilerplate; if missing, clone the full repo
- Atlassian / Jira tooling reachable (Atlassian CLI `acli` preferred, MCP Atlassian as fallback) for any workflow that writes to Jira
- `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
- `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
- `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping.
- `.agents/jira-workflows.json` — workflow + transition catalog.
- `.agents/jira-link-types.json` — slug → workspace link-type mapping (when present).
- `.context/master-implementation-plan.md` — Master Sprint roadmap.
- `.context/PRD/mvp-scope.md` — what's in vs out of the MVP.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/product-management/SKILL.md` · phase: `management` · extraction strategy: B

---

## Skill: project-bootstrap

**Purpose**: Scaffolds the technical infrastructure of a new project: backend (DB schemas, API base, types, error handling), frontend (design system,...

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel scaffolding subagents (e.g. backend + frontend in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-bootstrap/`, archive on completion.
- Read `complementary_categories` from this skill's frontmatter (`frontend-framework`, `frontend-ui`, `backend-db`, `runtime`, `language`, `ci-cd`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2 (path-based: `.claude/skills/` → T1; PROJECT_LEVEL_SKILLS → T3; USER_LEVEL_SKILLS → T4).
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this bootstrap? Y/N"`. Cache the answer for the session.
- When dispatching scaffolding sub-agents (Backend setup, Frontend setup, Incremental features), inject a `## Composable Skills` block per strategy doc §6.2 listing the resolved skills + project standards (test command, runtime, etc).
- A fresh repo has its product foundation (`/project-foundation` already ran) but no code yet.
- An existing repo needs an incremental infrastructure feature added (e.g. "add OpenAPI to the API", "add bearer auth", "wire Supabase types into the frontend").
- Define the product (PRD, user journeys, architecture decisions) — that's `/project-foundation`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-bootstrap/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: project-foundation

**Purpose**: Orchestrates the foundational definition of a new product/project: Constitution (business model + market context), Architecture (PRD + SR...

**Compact Rules**:
- `agentic-dev-core/references/briefing-template.md` — used when dispatching subagents to research market data, audit competitors, or interview users.
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase below.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/project-foundation/`, archive on completion.
- Read `complementary_categories` from this skill's frontmatter (`creativity`).
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- For each matched skill, classify tier per strategy doc §2.
- Apply threshold rule per strategy doc §3.2:
- **T1 / T3** matches → load silently. Cache for the session.
- **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this foundation work? Y/N"`. Cache the answer for the session.
- When dispatching sub-agents (Constitution, PRD, SRS, Discovery), inject a `## Composable Skills` block per strategy doc §6.2.
- Stakeholder brief or initial PRD draft — whatever the user provides as the seed for this foundation pass (paste, doc link, voice-memo transcript, etc.).
- `.context/PRD/` — existing PRD outputs if a prior version exists. UPSERT semantics: re-invoking a phase refines what's there; it does NOT rewrite from scratch.
- `.context/business/` — existing personas, business model, market context if prior research exists. Surface what's there; never invent replacements.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/project-foundation/SKILL.md` · phase: `foundation` · extraction strategy: B

---

## Skill: sprint-development

**Purpose**: Orchestrates the per-story dev loop end-to-end: Planning -> Implementation -> Code Review -> Staging deploy -> (gated) Production deploy.

**Compact Rules**:
- **New user story** (most common) -> Stage 1 (story-plan) -> Stage 2 (implement-story) -> ... -> Stage 4
- **New feature with multiple stories** -> Stage 1 macro (feature-plan) -> loop Stage 1+2 per story -> Stage 4 per merge
- **Bug fix** -> skip to Stage 2 with `bug-fix-workflow.md` (root cause first), then Stage 3+4
- **Resume from interruption** -> Stage 2 entry via `continue-implementation.md`
- **PR feedback / code review iteration** -> Stage 3 with `fix-issues.md`, fix-and-iterate loop
- **Production deploy** (separate event) -> Stage 5, only after QA green + business approval
- `.agents/project.yaml` populated. If missing, clone the full boilerplate — foundation files ship with the repo.
- Story exists in the issue tracker with refined Acceptance Criteria. If backlog is empty or AC are unclear, run `/product-management` first.
- Branch policy clear and CI configured. First-time-only setup lives in `references/setup-linting.md` and `references/ci-cd-setup.md`.
- Working directory is the **target project repo**. Sprint-dev runs there, not in the boilerplate.
- `.env` populated with environment URLs and credentials. Never hardcode credentials.
- `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
- `.agents/jira-required.yaml` — canonical slug catalog (custom fields, statuses, link types) for the active workspace.
- `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping for `{{jira.<slug>}}` resolution.
- `.agents/jira-workflows.json` — workflow + transition catalog (resolves Ready For Dev → In Progress → In Review → Ready For QA).
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/sprint-development/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: testability-guide

**Purpose**: Generates a public in-app `/qa` page ("Software Testability Guide for QA") + a tool-agnostic credentials artifact (markdown body) the use...

**Compact Rules**:
- **A public `/qa` page inside the app** titled _"Software Testability Guide for QA"_ — explains the architecture, demo users, DB-level testing via DBHub MCP, API-level testing via OpenAPI MCP, UI-level testing via Playwright (scripted and agentic). The page links out to the real credentials but never inlines them.
- **A tool-agnostic credentials artifact** (a markdown body) that holds the real DB connection, API login, demo passwords, OpenAPI spec URL, and Swagger UI link. The user picks where this artifact gets published: a Jira Epic (default), a Confluence page, a Notion page, any tool reachable via an MCP or a CLI, or — as a last resort — manual paste.
- `.agents/project.yaml` — project identity, env URLs, default branch, MCP names.
- `.mcp.json` — available MCP servers (Atlassian, Notion, etc.). Determines which publisher targets are reachable.
- `app/qa/page.tsx` snapshot (or framework-equivalent location) when present — current state of the `/qa` page; needed for the idempotency / drift-detection check (Phase 2).
- The publisher target's API contract — varies by Q1 answer: Jira Epic via `[ISSUE_TRACKER_TOOL]`, Confluence page via `[KNOWLEDGE_BASE_TOOL]`, Notion page via Notion MCP, generic MCP / CLI per `references/publishers/`.
- `.env.example` — to know which credentials slots the credentials artifact should reference by name (NEVER quote the actual values).
- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel sub-agents (e.g. page codegen + credentials-artifact publish in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the auto-resolve step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/testability-guide/`, archive on completion.
- Read `complementary_categories` from this skill's frontmatter.
- Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- Classify tier per strategy doc §2.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/testability-guide/SKILL.md` · phase: `foundation-extension` · extraction strategy: B

---

## Skill: unit-testing

**Purpose**: Focused skill for unit-test design — TDD workflow (red-green-refactor), test naming (AAA, Given-When-Then), mocking patterns (mocks/spies...

**Compact Rules**:
- "Write unit tests for this function/class"
- "TDD this slice" / "red-green-refactor"
- "What should I mock here?"
- "How do I name this test?"
- "What's the right coverage target for this module?"
- Mid-flight from `/sprint-development` Stage 2 (Implementation) when implementing TDD-friendly code (pure functions, complex branching, bug fix reproducers)
- Project has a unit test runner configured (Jest, Vitest, Mocha, or similar)
- Test command exists in `package.json` (`bun test`, `npm test`, `vitest`, etc.)
- For TDD: test runner supports watch mode (`--watch`)
- If no runner is configured, the first task is to set one up — see `references/unit-testing.md` § Setup
- The function / module under test — read its public interface first; that's the contract the tests must lock in.
- Existing tests for the same module (sibling `*.test.ts` / `*.spec.ts` in the same folder) — extend, don't duplicate.
- The function's callers (search by symbol) — informs which collaborators are external (mock) vs internal (use real).
- Test framework config (`vitest.config.ts` / `jest.config.ts` / equivalent) — env vars, setup files, coverage thresholds, path aliases.
- Test helpers / fixtures used by sibling tests in the same folder — reuse the project's seams instead of inventing parallel ones.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/unit-testing/SKILL.md` · phase: `implementation` · extraction strategy: B

---

## Skill: vercel-cli

**Purpose**: Vercel CLI cookbook for this Next.js + Supabase + Vercel boilerplate.

**Compact Rules**:
- **`vercel ls | grep` is the wrong tool to check whether YOUR deploy is ready.** ANSI color codes break the regex, and the output mixes new and old deploys for the same branch. The canonical "is this exact commit deployed" question has a different answer: `vercel ls -m githubCommitSha=<sha> --format json` to find the URL, then `vercel inspect <url> --wait --timeout=10m` to block until terminal state.
- **`vercel deploy` blocks by default; `vercel inspect` does NOT.** That asymmetry is backwards from intuition and trips agents constantly. Rule: **always pass `--no-wait` to `vercel deploy`** (return URL immediately), **always pass `--wait` to `vercel inspect`** (block until READY / ERROR / CANCELED). See `references/gotchas.md`.
- **Env-var scopes are not the same string in the CLI and the dashboard.** CLI uses lowercase `production` / `preview` / `development`; the dashboard shows "Production" / "Preview" / "Development". The CLI is the authoritative spelling — if you need to script env mutations, use the CLI form.
- Read `complementary_categories` from this skill's frontmatter (`deploy-vercel`).
- Look up the local skill-registry script (`scripts/build-skill-registry.ts` → `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
- If `/deploy-to-vercel` is installed (default project-level community skill per `cli/install.ts`), prefer it for any "I haven't deployed this project yet" intent.
- **`--no-wait` on deploy, `--wait` on inspect — never the other way around.** Inverting these means you either block for 10 minutes waiting on a deploy URL you needed immediately, or you race an unfinished deployment with a smoke test.
- **`vercel ls -m githubCommitSha=<sha>` is the canonical "find MY deploy" query.** No grep, no parsing, no race. Use `--format json` and `jq`.
- **Status filter values are UPPERCASE.** `vercel ls --status READY` works; `--status ready` returns empty with no error.
- **`vercel env pull` writes to `.env.local` by default.** That file is in `.gitignore` for a reason — never commit it. If you need a different filename, pass it as a positional arg.
- **Multi-team accounts need `--scope <team-slug>` on EVERY mutating command.** Otherwise the operation hits the wrong team's project, or fails with a confusing 404.
- **Always `--format json`** on `ls`, `env ls`, `teams ls`. Human tables include ANSI color and lose columns at narrow widths.
- **Always `--no-wait` on `vercel deploy`** in scripts. Capture the URL, then poll with `vercel inspect --wait` separately.
- **Always `--wait --timeout=10m`** on `vercel inspect` when verifying. Default behavior returns immediately with whatever state the deploy is currently in — usually `BUILDING`, which tells you nothing.
- **Always pass `--scope <team-slug>`** if `vercel teams ls` shows more than one team. If the project is already linked, the `orgId` in `.vercel/project.json` / `.vercel/repo.json` resolves the team automatically and you can omit `--scope`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.claude/skills/vercel-cli/SKILL.md` · phase: `implementation` · extraction strategy: B
