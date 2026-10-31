---
id: project
title: "Project instructions"
load_when: "anything specific to this project: its own rules, conventions, exceptions and its reading of shared doctrine"
triggers: ["\\bbunkai\\b", "next build", "bun run build", "\\bmockups?\\b", "master-design-plan", "apply_migration", "\\bstacked PRs?\\b", "\\bchained PRs?\\b", "\\bruleset\\b"]
paths: [".context/design/", ".context/designs/", "supabase/migrations/"]
---

# Project instructions

> Section `project` of the project instructions: the PROJECT-OWNED overlay. Every other file in `.agents/instructions/` is shared doctrine that `bun sync` keeps in step with the boilerplate; this one holds what is true only for this repository, and no sync ever touches it. A rule here may narrow a shared rule for this project and must say which one; it never silently contradicts a Critical Rule.

Bunkai TMS is designed, specified and built end to end by AI. The rules below are this repository's own. They carry names, not numbers: the numbered Critical Rules in `AGENTS.md` are the boilerplate's, and a Bunkai rule cited as "Critical Rule #N" before the 2026-10-30 boilerplate sync now goes by its name here (volatile-ok: migration note for old citations).

## Bunkai rule LIVE-UI-FIRST (narrows Critical Rule #14)

The CURRENT LIVE UI is the source of truth for fidelity, not the mockup. The mockup is inspiration to stay close to or improve upon, adapted to what already exists.

1. Before building UI, inspect the current live components and reuse them.
2. Never blind-copy the mockup where it conflicts with the improved live UI.
3. Navigation (how a user reaches and moves through the app) is paramount for UX.
4. If the mockup has something genuinely good the live UI lacks, do not force it into the current story: file it as a future tech story or tech debt.

Live-UI validation (`/sprint-development`) checks consistency with the current app and the design system, not pixel-match to the mockup. It composes with DESIGN-FIDELITY below: a deliberate departure with no mockup is still recorded as a §5 spec-only divergence of the master design plan (plus an ADR when architectural).

## Bunkai rule DESIGN-FIDELITY (narrows Critical Rule #14)

The design contract is `.context/design/master-design-plan.md`, the visual analog of the master implementation plan. Before writing or reviewing any UI for a user story:

1. Read that plan.
2. Find the story in its §8 US→Screen map to know which screens it renders into.
3. Open that screen's spec in §4 and the frozen contract in §2.
4. Implement against the mockup (`.context/designs/bunkai-test-management-tool/`), guided by LIVE-UI-FIRST.

<!-- binds-in-section: UI work routes here through the design triggers and paths of this file; the design set load is Critical Rule #14 -->
NEVER invent UI on the fly and NEVER re-pick colors, radii, fonts or spacing: reuse the frozen tokens (§2). Maximize UI fidelity to the mockup WITHOUT backend refactors: UI-only gaps get corrected; backend-cost divergences (auth infra, schema) get a faithful UI as a presentation layer, never a schema or auth revert. A deliberate departure from the mockup is ratified in §5 plus an ADR first; silent divergence is a defect. A new story adds its §8 row before development starts.

## Bunkai rule NO-LOCAL-BUILD

<!-- binds-in-section: build requests route here through the `next build` / `bun run build` triggers; stack.scripts.build in .agents/project.yaml carries the same pointer -->
NEVER run `next build`, `bun run build` or any production build locally. It writes `.next/`, the same directory a running `next dev` uses, and clobbers the dev server's chunks (CSS and JS 404, unstyled app). Local verification uses `bun run dev` only, and type safety uses `bun run types:check` (tsc, no build). Deploy builds run on Vercel. The single exception is an explicit, important justification AND user approval first: stop, state why a build (not dev) is required, ask, wait for yes.

## Bunkai rule AI-LED-DECISIONS (configures decision-protocol §5.1)

There is no human product owner in the loop. `.agents/project.yaml` → `decision_authority.product: decide` carries this rule; `agentic-dev-core/references/decision-protocol.md` §5.1 is the procedure (decision subagents `AI Product Owner / Business Analyst` and `AI Tech Lead`, scored alternatives, the ruling published to the ticket under a heading that names the deciding profile, then the cache resynced with `bun run jira:sync-issues get <KEY> --include-comments`).

Bunkai specifics on top of §5.1:

- The `AI Product Owner / Business Analyst` reads `.context/PRD/`, `.context/SRS/`, `.context/business/` (including `domain-glossary.md`), `.context/design/master-design-plan.md`, the epic's sibling stories and the ticket's own PBI folder before deciding.
- The only legitimate blockers are a genuine dependency (story B must ship before story A is buildable) and missing shift-left refinement (a story that never went through shift-left: a QA-authoring gap, recorded for whoever runs shift-left, never invented here).
- The human decides only when explicitly reserved, in flow ("stop here, I decide this one") or by a ticket that names a specific human. Destructive or irreversible actions, credentials and pushes to protected branches still follow Critical Rules #1, #4, #5 and #13.

## Bunkai rule MVP-ONE-DATABASE

Bunkai TMS is an MVP under continuous build. ONE Supabase project serves local, staging and "production" (`.agents/project.yaml` → `environments.*.db_project_ref`), and it holds no real customer data. At the official product release a brand-new clean Supabase project becomes the real production database.

<!-- binds-in-section: migration work routes here through the apply_migration trigger and the supabase/migrations/ path -->
- **Until that release**: applying a reviewed migration (Supabase MCP `apply_migration`, ledger per `supabase/migrations/README.md`) is a normal dev step, not a production deploy. Apply it once its PR review is approved, before merge, so staging code and schema stay in sync. NEVER run DDL through `execute_sql`; migrations stay additive and idempotent, and the repo files remain the schema source of truth (`stack.database.schema_source: migrations`).
- **From the release on**: migrations become a gated production action (explicit user approval per apply, production database separate from staging). When the new production database exists, update this rule and `.agents/project.yaml`.

## Bunkai rule ONE-PR-PER-STORY (narrows the git section and `git-flow-master`)

A user story, bug or tech story is delivered as exactly ONE pull request, whatever its size. Size is handled with atomic commits (one responsibility each, tests with their behaviour, every commit green) and commit-by-commit review, never by splitting the PR. Merge it with a merge commit (`--no-ff`), never squash, so the per-commit history survives on `staging`. NEVER stack or chain PRs unless the user explicitly asks for it in that run. A story that is genuinely too large is split in the backlog through `/product-management` (each resulting story gets its own PR), never by PR. This replaces the boilerplate's chained-PR planning wherever the shared sections mention it.

Jira moves a story to `Ready For QA` when a PR carrying its key is merged, and the workflow has no way back, so a ticket-keyed PR merges only into its final target (`staging`), only when truly ready.

The rule binds executors through the `## Compact Rules` of `git-flow-master` and `sprint-development` (both on `updater.protected_paths` in `.agents/project.yaml`, so no sync reverts them). Detail: `.agents/skills/git-flow-master/SKILL.md` Step 4 and `.agents/skills/sprint-development/references/workload-forecast.md`.

## Git Strategy (this repository)

`git_strategy:` in `.agents/project.yaml` is the source of truth (`main-integration`, chosen in Strategy Setup). What follows is this repository's reading of it.

**One environment per branch**: `localhost` (dev) → `staging` (integration, its own Vercel environment) → `main` (production, its own Vercel environment). Work branches cut from `staging`; their PRs merge back with a merge commit.

**Core invariant**: `main` is always an ancestor of `staging`, which makes release promotion a clean fast-forward. Anything landing on `main` without going through `staging` (a hotfix) breaks it and is back-merged into `staging` the same day.

```
localhost ──> feature/fix branch ──(PR, merge commit)──> staging ──(release PR, ff-only)──> main
                  (branched off staging)                 (Vercel staging env)              (Vercel prod env)
```

**Release promotion** (`staging` → `main`) is a local fast-forward, never the GitHub merge UI, which rewrites SHAs. The release PR still exists for review and visibility.

```bash
git checkout main && git pull
git merge --ff-only staging   # fails loudly if main is not an ancestor of staging: a hotfix was not back-merged
git push origin main
```

**Hotfix**: branch off `main`, PR to `main`, merge, then `git checkout staging && git merge main && git push origin staging` the same day.

**Protection is enforced through rulesets, not classic branch protection.** `GET repos/{o}/{r}/branches/{b}/protection` returns `404` on both branches, which is not evidence they are unprotected: read `GET repos/{o}/{r}/rules/branches/{b}` instead. Commits must be signed.

**Ruleset `16809486` "ProtectPublic"** covers `~DEFAULT_BRANCH`, `staging`, `main` and `dev` with `deletion`, `non_fast_forward`, `creation`, `required_signatures` and `pull_request` (merge method `merge` only). Its `bypass_actors` list gives `OrganizationAdmin` an `always` bypass, and the automation identity (`autonomous_delivery.automation_gh_account`) is an org admin, so a direct push from it to `staging` or `main` would succeed. `direct_push_to_protected: confirm` is therefore the policy layer on top of a permissive host: Critical Rules #4 and #5 are the only guard, and a bypass is reported as a bypass, never as permission. Query the ruleset live (`bun run git:policy verify`) before asserting any of its parameters; a reading quoted from this file is not current state.

Two traps that already cost time:

1. **`dismissal_restriction` is not a bypass.** It governs only who may dismiss an existing review. The real bypass is the separate Bypass list (`bypass_actors` in the API).
2. **`bypass_actors` changes.** It once read `null` and `OrganizationAdmin/always` on the same day. Read it live.

`required_review_thread_resolution: true` is deliberate and does not block agents (any identity with write access resolves its own threads, and the admin bypass covers it); it keeps unresolved human review conversations gating a human's merge. The repo has no `CODEOWNERS` file; if `require_code_owner_review` is ever turned back on, adding one starts gating every routine merge for non-admins.

## MCP servers (this project)

Bunkai declares six servers in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`: `context7`, `tavily`, `supabase`, `n8n`, `playwright` and `dbhub`. `tavily`, `playwright` and `dbhub` are project-only (the boilerplate ships the first four minus `tavily`, which it moved to harness level). Every server that needs a `.env` value starts through the `.env` loader (`varlock run --filter <its vars>`); the project variables they read (`TAVILY_API_KEY`, `DBHUB_*`) are declared in `.env.schema`.

- `tavily` is the `[WEB_SEARCH_TOOL]` primary for this repo: prefer it over the built-in `WebSearch` / `WebFetch` for community fixes, error lookups and non-doc research.
- `dbhub` is read-only SQL through the QA inspector role (`dbhub.toml`, Supabase session pooler); values come from `.env` (`DBHUB_*`).
- `playwright` is the MCP fallback for `[AUTOMATION_TOOL]`; `/playwright-cli` is primary.

## Key paths (this project)

- `.context/business/domain-glossary.md`: Bunkai's canonical domain terms (ATC = Acceptance Test Case, KATA, IQL, the TMS entities). Any domain term in Jira content, docs or UI copy matches it; its anti-glossary lists the banned terms.
- `.context/PBI/`: the gitignored Jira cache. It was untracked in this repo in one migration; the tag `pbi-pre-cache-migration` points at the last commit that still tracked it, for recovery only.

## Updater protected paths

`.agents/project.yaml` → `updater.protected_paths` lists the synced files Bunkai merged by hand, each with its reason inline: Bunkai facts in `CONTEXT.md`, the autonomous-delivery "both files or neither" rule, the DBHub block of `.env.example`, the BK-502 comment fix in `scripts/sync-jira-issues.ts` and its test (reverted twice before they were protected), and the ONE-PR-PER-STORY doctrine in eleven `sprint-development`, `git-flow-master` and `agentic-dev-core` files. `bun sync` never overwrites them, so an upstream change to one of them arrives as a parity row and is ported by hand.

## ADR numbering

`.context/ADR/` holds two numbering series side by side: the boilerplate's ADRs (synced) and Bunkai's own. Several numbers exist twice with different slugs (for example `ADR-0012-rpc-authorization-invariant.md` is Bunkai's, `ADR-0012-mcp-env-loader.md` the boilerplate's). Cite an ADR by number AND slug. A new Bunkai ADR takes the next number free in both series (`ADR-0021` onward); the index of Bunkai ADRs is `.context/ADR/README.md`.

## Community skills (this project)

Bunkai keeps some community skills the synced `cli/install.ts` no longer lists. `next-best-practices`, `next-cache-components` and `next-upgrade` stay committed and route through the table below. The n8n skills (`czlonkowski/n8n-skills`), `resend-cli`, `accessibility`, `seo`, `react-hook-form` and `zod` are installed per machine from `skills-lock.json` and gitignored: their vendor content links to files the repo does not ship. A fresh clone has none of them until they are installed (`bunx skills add <source>` per `skills-lock.json` entry). Their `metadata.kind` frontmatter is a local addition the skill linter needs; a vendor update drops it.

## Project context skills

The `<aspect>-context` skills this project created (`/project-context context-skill`), one row each. The prompt hook routes a prompt that matches a row's Triggers to that skill's `SKILL.md`, and `bun run docs:check` counts a skill listed here as rostered. This file survives `bun sync`, so a row here keeps routing after every update; the shared skills section does not. Triggers are backticked, case-insensitive regexes separated by commas; write a `|` inside one as `\|`.

<!-- project-skills:start -->
| Skill | Load when | Triggers | Loaded by |
| --- | --- | --- | --- |
| `next-best-practices` | writing or reviewing Next.js App Router code: file conventions, RSC boundaries, data patterns, metadata, route handlers | `next\.?js best practice`, `\bRSC\b`, `server component` | prompt hook (community skill, committed) |
| `next-cache-components` | Next.js Cache Components: PPR, `use cache`, cacheLife, cacheTag | `cache components`, `use cache`, `cacheLife`, `\bPPR\b` | prompt hook (community skill, committed) |
| `next-upgrade` | upgrading Next.js to a newer version with the official codemods | `upgrade next`, `next\.?js upgrade`, `codemod` | prompt hook (community skill, committed) |
<!-- project-skills:end -->
