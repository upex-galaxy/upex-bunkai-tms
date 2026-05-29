---
name: testability-guide
description: 'Generates a public in-app `/qa` page ("Software Testability Guide for QA") + a tool-agnostic credentials artifact (markdown body) the user publishes to Jira Epic (default), Confluence, Notion, any MCP/CLI-reachable tool, or via manual paste. Idempotent — re-runs detect host-stack drift via a snapshot comment in the generated page and propose surgical patches instead of rewriting. Invoke whenever the user asks to create, update, regenerate, or publish a QA testing guide, testability guide, /qa page, credentials Epic, or says "guía de testeabilidad", "credenciales para testing", "publish credentials artifact", "/testability-guide". Do NOT use for: PRD definition (`/project-foundation`), infrastructure scaffolding (`/project-bootstrap`), per-story implementation (`/sprint-development`), unit testing (`/unit-testing`), or formal QA test cases / TMS workflows (out of scope here).'
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
phase: foundation-extension
complementary_categories:
  - frontend-framework
  - frontend-ui
  - issue-tracker
  - testing-e2e
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # architectural decisions during pre-flight + idempotency diff
  planning: sonnet       # structured writing for references
  implementation: sonnet # default for page codegen
  review: opus           # security audit before publish
  archive: haiku         # mechanical re-runs that report no-op
-->

# Testability Guide — `/qa` page + credentials artifact

`testability-guide` builds and maintains the bridge between a working app and the humans (and AI agents) who test it. It produces two artifacts:

1. **A public `/qa` page inside the app** titled _"Software Testability Guide for QA"_ — explains the architecture, demo users, DB-level testing via DBHub MCP, API-level testing via OpenAPI MCP, UI-level testing via Playwright (scripted and agentic). The page links out to the real credentials but never inlines them.
2. **A tool-agnostic credentials artifact** (a markdown body) that holds the real DB connection, API login, demo passwords, OpenAPI spec URL, and Swagger UI link. The user picks where this artifact gets published: a Jira Epic (default), a Confluence page, a Notion page, any tool reachable via an MCP or a CLI, or — as a last resort — manual paste.

The skill is idempotent. On re-run it reads a snapshot comment at the top of the generated page (`/* qa-guide-snapshot: stack=…, generated=… */`), diffs against the current detected stack, and proposes a **surgical patch** only when something drifted. Identical stack → no-op + report.

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a testability-guide run. Read in order; stop earlier when the run is small enough (e.g. a snapshot no-op) that later inputs add no signal.

1. `.agents/project.yaml` — project identity, env URLs, default branch, MCP names.
2. `.mcp.json` — available MCP servers (Atlassian, Notion, etc.). Determines which publisher targets are reachable.
3. `app/qa/page.tsx` snapshot (or framework-equivalent location) when present — current state of the `/qa` page; needed for the idempotency / drift-detection check (Phase 2).
4. The publisher target's API contract — varies by Q1 answer: Jira Epic via `[ISSUE_TRACKER_TOOL]`, Confluence page via `[KNOWLEDGE_BASE_TOOL]`, Notion page via Notion MCP, generic MCP / CLI per `references/publishers/`.
5. `.env.example` — to know which credentials slots the credentials artifact should reference by name (NEVER quote the actual values).

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand from its references:

- `agentic-dev-core/references/briefing-template.md` — used when dispatching parallel sub-agents (e.g. page codegen + credentials-artifact publish in parallel).
- `agentic-dev-core/references/dispatch-patterns.md` — picks Single / Sequential / Parallel for each phase.
- `agentic-dev-core/references/skill-composition-strategy.md` — composition contract consumed by the auto-resolve step below.
- `agentic-dev-core/references/orchestration-doctrine.md` — mandatory subagent dispatch (main thread is command center).
- `agentic-dev-core/references/session-management.md` — Phase 0 resume contract, plan-first persistence at `.session/testability-guide/`, archive on completion.

---

## Composable Skills (auto-resolved at skill entry)

Run once when this skill is invoked, before any phase. Follows the contract in `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter.
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. Classify tier per strategy doc §2.
4. Apply threshold rule per strategy doc §3.2:
   - **T1 / T3** matches → load silently. Cache for the session.
   - **T4** matches → ASK user once: `"Detected <skill> (T4). Apply for this run? Y/N"`. Cache the answer.
5. Inject a `## Composable Skills` block per strategy doc §6.2 into every sub-agent prompt.

Expected matches on a Next.js + Supabase project (illustrative — actual list depends on what is installed):

| Category             | Likely matches                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `frontend-framework` | `next-best-practices`, `next-cache-components`                                                 |
| `frontend-ui`        | `tailwind-css-patterns`, `shadcn`, `frontend-design`, `emil-design-eng`, `ui-ux-pro-max`       |
| `issue-tracker`      | `acli` (T1) — used by the Jira Epic + Confluence publishers                                    |
| `testing-e2e`        | `playwright-cli` — used during §verification                                                   |

Skip only if the registry cache is missing AND no session-start skill list is available. When skipped, log `skill_resolution: "fallback-inline"` plus `missing: [<categories with no resolution>]` in the result envelope (per strategy doc §3.4).

---

## When to use

Use this skill when:

- A working app exists and QA (humans or AI agents) need a single page in the product that explains how to test it.
- The user wants to create or refresh the credentials artifact (Jira Epic, Confluence, Notion, or another destination) that backs the `/qa` page's CTA.
- The host project's stack drifted (auth changed, DB moved, new MCP available) and the existing `/qa` needs to be brought back in sync.
- The user explicitly invokes `/testability-guide` or asks for a "QA guide page", "guía de testeabilidad", or similar.

Do NOT use this skill for:

- Defining the product (PRD, user journeys, architecture decisions) — that is `/project-foundation`.
- Setting up the backend, frontend, OpenAPI, auth, or env scaffolding — that is `/project-bootstrap`. This skill MAY run AFTER `/project-bootstrap` completes.
- Implementing an individual user story — that is `/sprint-development`.
- Writing unit tests — that is `/unit-testing`.
- Authoring formal QA test cases or wiring a test-management system — out of scope here.

If the project still lacks a backend / frontend / auth scaffolding, surface that to the user before continuing — the `/qa` page describes a real app, and there is little value in generating it against a hollow scaffold.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **project-scope**: no `<scope>` segment. Session state lives directly at `.session/testability-guide/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 + §9.

**Snapshot ≠ session.** This skill has TWO separate persistence mechanisms; do not conflate them:

- The `/* qa-guide-snapshot: stack=…, generated=… */` comment at the top of the generated `/qa` page detects **cross-run code drift** (host stack changed between two completed runs).
- `.session/testability-guide/` detects **in-flight interruption within a single run** (the AI got cut off between Phase 4 codegen and Phase 6 publish, and needs to resume).

Both stay. Phase 0 reads the session directory; Phase 2 (idempotency check) reads the snapshot comment.

## Phase 0 — Resume check (MANDATORY, inline)

Before any subagent dispatch and before Phase 1 (pre-flight discovery) runs, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/testability-guide/progress.md` exists.
2. If it does NOT exist → proceed to Phase 1 (pre-flight discovery) which also writes `plan.md` after Phase 3 decisions land.
3. If it DOES exist:
   1. Read `.session/testability-guide/plan.md` in full.
   2. Read the tail of `.session/testability-guide/progress.md` (last ~3 entries).
   3. Surface to the user: plan Goal, last completed phase + timestamp, next planned phase, any blocking notes (e.g. "publisher = Jira Epic but `acli` auth failed; user asked to install MCP fallback").
   4. Offer three options and WAIT for input: **resume** / **restart** (archive to `.session/.archive/<YYYY-MM-DD>-testability-guide-project-aborted/`) / **abort**.

Phase 0 is inline — no subagent dispatch.

## Phase 1 — Write `plan.md` (after Phase 3 batched decisions)

Phase 3 below collects the user's batched answers to Q1–Q5 (credentials destination, DB role policy, page route, redirect of old route, language). Immediately after those answers land, write `.session/testability-guide/plan.md` per the schema in `agentic-dev-core/references/session-management.md` §6:

- Frontmatter: `topic_key: session/testability-guide/project/plan`, `skill: testability-guide`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections (fixed H2 order): `## Goal` · `## Inputs` (host stack from Phase 1 discovery, snapshot diff from Phase 2 idempotency check, Q1–Q5 answers from Phase 3) · `## Approach` · `## Phase breakdown` (Phase 4 page codegen, Phase 5 credentials content build, Phase 6 publish via chosen channel, Phase 7 security audit, Phase 8 verification, Phase 9 commit / PR — with dispatch pattern per row, Single / Parallel / inline as documented in §"Subagent dispatch") · `## Risks & open questions` · `## Verification checklist` (mirrors `references/verification-checklist.md`) · `## Cross-references` (target `/qa` page path, chosen credentials destination URL, branch name handed to `/git-flow-master`).

Dispatch: inline draft is normal — the Phase 3 answers are the deciding inputs and they are short.

After `plan.md` is written and the user accepts the plan, transition `status: draft → approved` and proceed to Phase 4.

> **Progress checkpoint**: after each of Phase 1 (discovery), Phase 3 (decisions captured + `plan.md` written), Phase 4 (page codegen), Phase 5 (artifact content built), Phase 6 (publish completed or fallback to manual-paste), Phase 7 (security audit), Phase 8 (verification), Phase 9 (commit / PR opened), the orchestrator appends a phase entry to `.session/testability-guide/progress.md` per `agentic-dev-core/references/session-management.md` §7. Phase 2 (idempotency check) emits a checkpoint with `status: skipped` when the snapshot reports no drift (so the no-op branch is still resumable for audit).

## Phase walkthrough

Phases are mostly sequential, but page codegen and credentials-artifact authoring are independent and can run in parallel sub-agents once the decisions are locked.

### 1. Pre-flight discovery (read-only)

Detect the host stack, UI kit, icon library, auth model, DB, existing `/qa` or `/guide` / `/docs` / `/integration` page, existing test infrastructure, available MCPs (Atlassian, Notion, etc.), i18n, OpenAPI / Swagger location, default branch.

Full checklist: `references/pre-flight-discovery.md`.

**Then score testability (same phase).** Immediately after detection, rate UI / API / DB and emit a `testability:` flag. The page is built regardless of score, but a ⚠️ / ❌ layer surfaces a flag + a concrete remediation the team should act on. The highest-leverage case: when auth has **no programmatic token path** (passwordless / OAuth / SSO only, no PAT issuer), recommend the canonical pattern — **a normal user+password login PLUS an API endpoint that issues a token with expiry**, used to request as the authenticated user. Adapt to what exists; flag what's missing; never implement the remediation here (that is `/project-bootstrap` / `/sprint-development`). Rubric + levels + remediation: `references/testability-assessment.md`.

### 2. Idempotency check

If `/qa` already exists, read its snapshot comment, re-run discovery, diff. If identical → exit with a no-op report. If drifted → proceed to step 3 but mark the run as a **surgical patch**, not a fresh scaffold.

Rules + snapshot format: `references/idempotency-snapshot.md`.

### 3. Batched decisions (ONE message, wait for answers)

Ask Q1 through Q5 in a single message: credentials destination, DB role policy, page route, redirect of old route, language. Defaults documented + tradeoffs explained.

Question text + defaults + tradeoffs: `references/decision-questions.md`.

### 4. Page codegen — `/qa`

Generate the page in the host framework's idiomatic location (Next App Router, Pages, Remix, Astro, SvelteKit, Vite+RR). Reuse the host UI kit and icon library — never add a new dependency. Apply the host language for visible copy (**Spanish is the default in this ecosystem** — the page is for QA); keep code identifiers + `data-testid`s in English. EVERY endpoint, host, spec URL, docs route, and MCP block comes from Phase-1 detection via the `qaConfig` object — zero hardcode (`pre-flight-discovery.md`).

Section order + copy: `references/page-structure.md` (§1–§7).

Visual target + golden file (own layout, sticky TOC, RSC split, `qaConfig` bridge, components, color system, dark/light): `references/page-craft.md`.

MCP + env content inside §3–§6 (4-agent config tabs, env-var strategy + activation, 2-ways DB, 2-ways API + auth flow): `references/mcp-and-env-setup.md`.

Routing + redirect-of-old-route per framework: `references/routing-patterns.md`.

### 5. Credentials artifact — content build (SOURCE OF TRUTH)

Build the markdown body of the credentials artifact. This is the content that will live wherever the user chose in Q1. The same body works across publishers — only the wrapper changes.

Template: `references/credentials-content-template.md`. This is the **canonical** content. Treat publisher-specific references as thin adapters around this body.

### 6. Publish the artifact (channel adapter)

Route the markdown body to the chosen destination:

| Q1 answer                           | Read                                       | Tool used                                        |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Jira Epic (default)                 | `references/publishers/jira-epic.md`       | `/acli`                                          |
| Confluence page                     | `references/publishers/confluence-page.md` | `/acli` (Confluence) or Atlassian MCP            |
| Notion page                         | `references/publishers/notion-page.md`     | Notion MCP if installed, else fallback           |
| Any other tool reachable via an MCP | `references/publishers/generic-mcp.md`     | detected MCP                                     |
| Any other tool reachable via a CLI  | `references/publishers/generic-cli.md`     | detected CLI                                     |
| None of the above is reachable      | `references/publishers/manual-paste.md`    | hand the user the markdown + the destination URL |

If the chosen destination is not reachable (MCP missing, CLI absent), the skill **always falls back to manual paste** and tells the user exactly which tool to install or which URL to paste into. The artifact body is never lost.

### 7. Security audit before publish

Before any external publish call fires, the skill runs the security rules in `references/security-rules.md`. Hard refusals include: admin / schema-owner credentials, session-signing secrets (`NEXTAUTH_SECRET`, JWT signing keys), and credentials already exposed in git history without prior rotation.

If the only DB credential available is a superuser, the skill stops and asks the user to provision a `qa_*` read-only role first.

### 8. Verification

Run the verification checklist (`references/verification-checklist.md`):

1. Project's typecheck script — zero errors.
2. Project's build script — succeeds.
3. Project's lint script — clean or only pre-existing warnings.
4. Dev server + browser smoke via `/playwright-cli`: page loads, CTA opens credentials source in new tab, accordions expand, code blocks render with copy buttons, redirect (if any) works.
5. The published artifact renders snippets correctly in its destination.
6. `git diff` is free of passwords, tokens, or private-shaped hostnames.

If a step fails → fix and re-run from step 1. Never paper over a failure.

### 9. Commit + PR

Delegate to `/git-flow-master`. This skill never invokes `git push`, `gh pr create`, or branch operations inline. The orchestrator hands `/git-flow-master` the branch name (`feature/testability-guide` if fresh, `fix/testability-guide-drift-YYYY-MM-DD` if surgical patch), the commit-message stems (one for page, one for redirect, one per dep bump), and the PR title `feat(qa): add Software Testability Guide for QA at /qa` (or `fix(qa): refresh testability guide after stack drift`).

**Never push to `main` directly.** Always PR. CLAUDE.md Rule #4 + Rule #11.

---

## Subagent dispatch

Page codegen and credentials-artifact publish are independent once decisions are locked. Use the parallel pattern in `agentic-dev-core/references/dispatch-patterns.md`:

- Sub-agent A: page codegen + routing + redirect.
- Sub-agent B: credentials-artifact build (template) + publish (chosen channel).
- Sequential after both: verification (Sub-agent C, browser smoke + lint/build) → `/git-flow-master` (branch, commit, PR).

Each sub-agent briefing must follow the 6-component template in `agentic-dev-core/references/briefing-template.md` and cite the specific reference file the sub-agent must read.

---

## Hand-offs

After the skill completes, the page + artifact are live. Hand off to:

- **`/sync-ai-memory`** — registers the new `/qa` page + credentials-artifact URL in the AI persistent memory so future skills know they exist.
- **`/sprint-development`** — QA-found bugs that touch the page itself become normal stories.
- **`/business-feature-map`** — flag the `/qa` page so future map refreshes record it as an internal-only operational page (no PRD coverage required).

---

## Verification rule

The skill is "done" only when every box in `references/verification-checklist.md` is checked. Self-check questions live at the bottom of that reference (mirroring the source prompt's §11). Do not declare completion until all eight items are true.

On successful completion (all eight verification items pass), the orchestrator runs Archive per `agentic-dev-core/references/session-management.md` §8 — moves `.session/testability-guide/` to `.session/.archive/<YYYY-MM-DD>-testability-guide-project/` and calls `mem_session_summary` with the archive path included so future `mem_search` calls can navigate back. The `/qa` page snapshot comment is left in place — it is the cross-run drift signal for the NEXT invocation, independent of the archived session directory.

---

## Anti-patterns — NEVER do these

- **T1.** NEVER hardcode credential values in the in-app `/qa` page or in the credentials artifact body. Reference environment / config slots by name (e.g. `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`); the real values live in `.env` and in the chosen publisher destination, never in source.
- **T2.** NEVER bypass drift detection. When the host-stack signature changes, respect the snapshot-comment mechanism (`/* qa-guide-snapshot: stack=…, generated=… */`) and propose a surgical patch — do NOT regenerate the page from scratch when a targeted diff suffices.
- **T3.** Gate `/qa` in production ONLY when the host is an internal tool / customer-facing product where an operational page would leak. For a **public practice / demo platform** (where `/qa` IS the teaching surface, e.g. the page that onboards external testers), the page is intentionally public — do NOT gate it. Detect the project type in pre-flight; when unsure, ask. Either way the page NEVER inlines real secrets (T1), so "public" means "public docs", not "public credentials".
- **T4.** NEVER include PII, real customer data, or production data examples in the testability guide. Demo users and sanitized fixtures only.
- **T5.** NEVER duplicate the credentials-artifact body across multiple publisher targets. The markdown body in `references/credentials-content-template.md` is the single source of truth; publishers are thin adapters.
- **T6.** NEVER assume idempotency without re-checking the snapshot comment. Re-runs MUST read the snapshot, diff against current detected stack, and only then decide no-op vs surgical patch vs fresh scaffold.

---

## Notes

- Security non-negotiables live in `references/security-rules.md`. Read it before any publish.
- MCP credentials are cached at MCP-spawn time (CLAUDE.md Rule #11). If a publish path fails on `401` / `403`, stop, point the user at the right `.env` variable, and ask them to restart the agent session. Do NOT work around.
- This skill assumes English visible copy by default. Switch to the host language whenever the host app exposes a clear signal (root `lang` attribute, i18n config, copy already in another language). Code identifiers + `data-testid`s stay English regardless.
- The skill never adds new dependencies. If the host UI kit lacks a `<CodeBlock>` component, create a minimal local one with a copy button — do not pull in a library for it.
