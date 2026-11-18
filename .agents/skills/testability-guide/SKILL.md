---
name: testability-guide
description: 'Builds the in-app `/qa` page ("Software Testability Guide for QA") and a credentials artifact for testers and AI agents. Use when creating, updating or regenerating the QA testability guide, the `/qa` page or the credentials Epic; publishing the credentials to Jira, Confluence, Notion, an MCP or CLI tool, or by manual paste. Not for PRD, scaffolding, stories or unit tests.'
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: foundation-extension
complementary_categories:
  - frontend-framework
  - frontend-ui
  - issue-tracker
  - testing-e2e
# compact_rules is consumed verbatim by scripts/build-skill-registry.ts (frontmatter first,
# no truncation). These rules live only here; the body points at them.
compact_rules: |
  - **T1.** The `/qa` page and the credentials artifact body never contain a credential value. They name the slot (`LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`); the real values live in `.env` and at the chosen publisher destination, never in source.
  - **T2.** Drift detection decides what gets written. When the host-stack signature changed, read the snapshot comment (`/* qa-guide-snapshot: stack=…, generated=… */`) and propose a surgical patch. Regenerate the page from scratch only when no targeted diff can carry the change.
  - **T3.** Gate `/qa` in production only when the host is an internal tool or a customer-facing product where an operational page would leak. A public practice or demo platform, where `/qa` is the teaching surface (for example the page that onboards external testers), keeps the page public. Detect the project type in pre-flight and ask when unsure (with nobody to ask, gate the page and say so in the report). Public means public docs, never public credentials (T1).
  - **T4.** The guide contains no PII, real customer data or production data examples. Demo users and sanitized fixtures only.
  - **T5.** The markdown body in `references/credentials-content-template.md` is the single source of truth for the credentials artifact. Publishers are thin adapters, so the body is never copied into several publisher targets.
  - **T6.** Idempotency is checked, never assumed. A re-run reads the snapshot, diffs it against the detected stack, and only then chooses no-op, surgical patch or fresh scaffold.
  - **T7.** The deployed commit SHA never enters the generated `/qa` source. The hero build stamp (`data-testid="qa-build-sha"`) reads it at runtime from the platform env var whose NAME detection put in `qaConfig.build` (on Vercel `VERCEL_GIT_COMMIT_SHA`) and shows a visible fallback line when it is absent. The value stays out of the snapshot comment and the content-hash, so a redeploy is never drift (Build stamp section of `references/page-craft.md`).
  - **T8.** The testers' DB MCP comes from `stack.database` (`references/mcp-and-env-setup.md` §4.0), never from habit, and testers never get the agent's own `db` credential. DBHub logged in as a `qa_*` read-only role is the default; the Supabase MCP is only a `--read-only --project-ref` alternative for people who already hold a Supabase account; the `SUPABASE_ACCESS_TOKEN` personal access token is never published. Provisioning the read-only role is a database change on the route `stack.database.migrations_tool` names (`agentic-dev-core/references/db-change-doctrine.md`): this skill hands over the SQL and never applies it.
  - **Capabilities** (`metadata.requires_capabilities`): resolve each by tool-name suffix, any prefix. When none is available at the step that needs it, stop per `agentic-dev-core/references/mcp-capabilities.md` §4 instead of substituting silently (built-in `WebSearch` / `WebFetch` only when the user chooses it).
metadata:
  kind: workflow
  stage_owner: true
  requires_capabilities: [library-docs, web-search]
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

# Testability guide: the `/qa` page and the credentials artifact

`testability-guide` connects a working app to the people and AI agents who test it. It produces two artifacts:

1. A public `/qa` page inside the app, titled _"Software Testability Guide for QA"_. It explains the architecture, the demo users, and how to test at the DB level (through the DB MCP the `stack:` block resolves: DBHub as a read-only role by default, `references/mcp-and-env-setup.md` §4.0), the API level (OpenAPI MCP) and the UI level (Playwright, scripted and agentic). It links to the real credentials and never inlines them.
2. A tool-agnostic credentials artifact (a markdown body) holding the real DB connection, API login, demo passwords, OpenAPI spec URL and Swagger UI link. The user picks where it is published: a Jira Epic (default), a Confluence page, a Notion page, any tool reachable through an MCP or a CLI, or, as a last resort, manual paste.

> **Division of labor**: the credentials artifact holds the real values plus a copy-paste `.env` block. The `/qa` page holds placeholders and explains how things work. Each links to the other: the page's CTA opens the credentials destination, and the credentials body links back to `/qa`.

The skill is idempotent. On a re-run it reads the snapshot comment at the top of the generated page (`/* qa-guide-snapshot: stack=…, generated=… */`), diffs it against the detected stack, and proposes a surgical patch only where something drifted. An identical stack ends in a no-op report.

The rules T1 to T8 in the frontmatter bind every phase below.

---

## Inputs

Read these in order, and stop early when the run is small (a snapshot no-op, say).

1. `.agents/project.yaml`: project identity, env URLs, default branch, MCP names and the `stack:` block (`stack.framework`, `stack.app_root`, `stack.database.*`, `stack.ui`, `stack.hosting`, `stack.scripts`). Phase 1 starts from it and confirms it against the code.
2. `.mcp.json`: the available MCP servers (Atlassian, Notion and so on), which decide the reachable publisher targets.
3. The `/qa` page under `{{stack.app_root}}` when it exists (`app/qa/page.tsx` on the App Router, `pages/qa.tsx` on Pages). Its snapshot comment drives the Phase 2 drift check.
4. The publisher target's API contract, which depends on the Q1 answer: a Jira Epic through `[ISSUE_TRACKER_TOOL]`, a Confluence page through `[KNOWLEDGE_BASE_TOOL]`, a Notion page through the Notion MCP, or a generic MCP or CLI per `references/publishers/`.
5. `.env.example`, to learn which credential slots the artifact references by name. Quote slot names only, never values.

---

## Dependencies

Requires `agentic-dev-core`. Loads on demand from its references:

- `agentic-dev-core/references/briefing-template.md`: dispatching parallel sub-agents.
- `agentic-dev-core/references/dispatch-patterns.md`: Single, Sequential or Parallel for each phase.
- `agentic-dev-core/references/skill-composition-strategy.md`: the composition contract used by the step below.
- `agentic-dev-core/references/orchestration-doctrine.md`: mandatory subagent dispatch, with the main thread as command center.
- `agentic-dev-core/references/session-management.md`: the Phase 0 resume contract, plan-first persistence and archive.
- `agentic-dev-core/references/decision-protocol.md`: who decides what when nobody is at the keyboard.

---

## Composable Skills (auto-resolved at skill entry)

Run this once on entry, before any phase, following `agentic-dev-core/references/skill-composition-strategy.md` §3.

1. Read `complementary_categories` from this skill's frontmatter.
2. Scan the skills actually installed (strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is never this scan.
3. Classify each tier per strategy doc §2.
4. Apply the threshold rule (strategy doc §3.2). T1 and T3 matches load silently and are cached for the session. A T4 match asks once, `"Detected <skill> (T4). Apply for this run? Y/N"`, and caches the answer.
5. Inject a `## Composable Skills` block (strategy doc §5.2) into every sub-agent prompt.

The `issue-tracker` match (`acli`, T1) serves the Jira Epic and Confluence publishers, and the `testing-e2e` match (`playwright-cli`) serves §8 verification.

Skip the step only when neither the session skill list nor the `.agents/skills/` folder can be read. Then log `skill_resolution: "fallback-inline"` and `missing: [<categories with no resolution>]` in the result envelope (strategy doc §3.4).

---

## When to use

Use it when:

- A working app exists and testers (human or AI) need one page in the product that explains how to test it.
- The user wants to create or refresh the credentials artifact (Jira Epic, Confluence, Notion or another destination) behind the `/qa` page's CTA.
- The host stack drifted (auth changed, DB moved, a new MCP appeared) and the existing `/qa` must be brought back in sync.
- The user invokes `/testability-guide` or asks for a QA guide page.

Other skills own the neighbouring work: the PRD, user journeys and architecture decisions are `/project-foundation`; backend, frontend, OpenAPI, auth and env scaffolding are `/project-bootstrap` (this skill may run after it); one user story is `/sprint-development`; unit tests are `/unit-testing`. Formal QA test cases and test-management wiring are out of scope here.

When the project still lacks backend, frontend or auth scaffolding, tell the user before continuing: the page describes a real app, and generating it against a hollow scaffold has little value. A routine reports that and stops.

---

## Session & Dispatch

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 0.5 (plan write) are NOT optional.
>
> **Session close**: every stage ends with the light stage verifier and the session ends with the chat footer (tools used + dev surfaces touched), both per `agentic-dev-core/references/session-footer-contract.md`.

This skill is project-scope, so there is no `<scope>` segment. Session state lives at `.session/testability-guide/{plan.md, progress.md}` per `agentic-dev-core/references/session-management.md` §3 and §9.

The snapshot and the session are two separate mechanisms:

- The `/* qa-guide-snapshot: ... */` comment at the top of the generated page detects code drift across runs (the host stack changed between two completed runs).
- `.session/testability-guide/` detects an interruption inside one run (the agent was cut off between Phase 4 codegen and Phase 6 publish and must resume).

Phase 0 reads the session directory. Phase 2 reads the snapshot comment.

## Phase 0 (resume check)

This phase runs inline, with no subagent. Before any dispatch and before Phase 1, run the resume contract from `agentic-dev-core/references/session-management.md` §4:

1. Check whether `.session/testability-guide/progress.md` exists.
2. If it does not, go to Phase 1. Phase 0.5 writes `plan.md` once the Phase 3 decisions land.
3. If it does:
   1. Read `.session/testability-guide/plan.md` in full.
   2. Read the last 3 or so entries of `progress.md`.
   3. Tell the user the plan Goal, the last completed phase with its timestamp, the next planned phase and any blocking note (for example "publisher = Jira Epic but `acli` auth failed; the user asked to install the MCP fallback").
   4. Offer three options and wait: **resume**, **restart** (archive to `.session/.archive/<YYYY-MM-DD>-testability-guide-project-aborted/`) or **abort**.

## Phase 0.5 (write `plan.md`, after the Phase 3 decisions)

Phase 3 collects the batched answers to Q1 to Q8: credentials destination, DB role policy, page route, redirect of the old route, language, and the three page-craft questions that detection pre-answers (highlighter, agentic UI driver, request viewer). As soon as those land, write `.session/testability-guide/plan.md` in the schema of `agentic-dev-core/references/session-management.md` §6:

- Frontmatter: `topic_key: session/testability-guide/project/plan`, `skill: testability-guide`, `scope: project`, `status: draft`, `capture_prompt: true`.
- Body sections, in this H2 order: `## Goal`, `## Inputs` (host stack from Phase 1, snapshot diff from Phase 2, Q1 to Q8 answers from Phase 3), `## Approach`, `## Phase breakdown` (Phase 4 page codegen, Phase 5 credentials content build, Phase 6 publish through the chosen channel, Phase 7 security audit, Phase 8 verification, Phase 9 commit and PR, each with its dispatch pattern: Single, Parallel or inline, as in "Subagent dispatch"), `## Risks & open questions`, `## Verification checklist` (mirrors `references/verification-checklist.md`) and `## Cross-references` (the `/qa` page path, the credentials destination URL, the branch name handed to `/git-flow-master`).

Drafting inline is normal. When the user accepts the plan, move `status` from `draft` to `approved` and go to Phase 4.

> **Progress checkpoint**: the orchestrator appends a phase entry to `.session/testability-guide/progress.md` (`agentic-dev-core/references/session-management.md` §7) after each of Phases 1, 3, 4, 5, 6, 7, 8 and 9. Phase 2 writes a checkpoint with `status: skipped` when the snapshot reports no drift, so the no-op stays auditable.

## Phase walkthrough

The phases are mostly sequential. Page codegen and credentials-artifact authoring are independent and can run in parallel sub-agents once the decisions are locked.

### 1. Pre-flight discovery (read-only)

Read the `stack:` block first, then detect and confirm against the code: host stack, UI kit, icon library, auth model, DB, any existing `/qa`, `/guide`, `/docs` or `/integration` page, test infrastructure, available MCPs, i18n, OpenAPI or Swagger location and default branch. Full checklist: `references/pre-flight-discovery.md`.

Then score testability in the same phase. Rate UI, API and DB right after detection and emit a `testability:` flag. The page is built whatever the score, but a ⚠️ or ❌ layer raises a flag with a concrete remediation. The highest-leverage case is auth with no programmatic token path (passwordless, OAuth or SSO only, no PAT issuer): recommend the canonical pattern of a normal user and password login plus an API endpoint that issues a token with an expiry, used to request as the authenticated user. Adapt to what exists, flag what is missing, and leave the remediation to `/project-bootstrap` or `/sprint-development`. Rubric, levels and remediation: `references/testability-assessment.md`.

### 2. Idempotency check

When `/qa` exists, read its snapshot comment, re-run discovery and diff. An identical result ends the run with a no-op report. Drift goes on to step 3, marked as a surgical patch rather than a fresh scaffold. Rules and snapshot format: `references/idempotency-snapshot.md`.

### 3. Batched decisions (one message, wait for the answers)

Ask Q1 to Q5 in a single message: credentials destination, DB role policy, page route, redirect of the old route, language. Each carries a documented default and its tradeoffs. Q6 to Q8 (highlighter, agentic UI driver, request viewer) are answered by detection from the repo, and are asked only when detection is ambiguous. Question text, defaults and tradeoffs, plus each question's routine path: `references/decision-questions.md`.

### 4. Page codegen: `/qa`

Generate the page in the host framework's idiomatic location (Next App Router, Pages, Remix, Astro, SvelteKit, Vite with React Router). Reuse the host UI kit and icon library and add no dependency beyond the one exception in Notes. Visible copy follows the Q5 language, which follows the host's language signal (with no signal, Q5 asks and nothing is assumed). Code identifiers and `data-testid`s stay in English. Every endpoint, host, spec URL, docs route and MCP block comes from Phase 1 detection through the `qaConfig` object, with zero hardcoding (`references/pre-flight-discovery.md`).

- Section order and copy: `references/page-structure.md` (§1 to §7).
- Visual target and golden file (layout, TOC, RSC split, `qaConfig` bridge, components, colors): `references/page-craft.md`.
- MCP and env content inside §3 to §6 (agent config tabs, env-var strategy, DB and API ways, auth flow): `references/mcp-and-env-setup.md`.
- Routing and redirect of the old route per framework: `references/routing-patterns.md`.

### 5. Credentials artifact: content build (source of truth)

Build the markdown body that will live wherever the user chose in Q1. The same body works across publishers, and only the wrapper changes. The canonical template is `references/credentials-content-template.md`; publisher references are thin adapters around it.

### 6. Publish the artifact (channel adapter)

Route the body to the chosen destination:

| Q1 answer                           | Read                                       | Tool used                                        |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Jira Epic (default)                 | `references/publishers/jira-epic.md`       | `/acli`                                          |
| Confluence page                     | `references/publishers/confluence-page.md` | `/acli` (Confluence) or Atlassian MCP            |
| Notion page                         | `references/publishers/notion-page.md`     | Notion MCP if installed, else fallback           |
| Any other tool reachable via an MCP | `references/publishers/generic-mcp.md`     | detected MCP                                     |
| Any other tool reachable via a CLI  | `references/publishers/generic-cli.md`     | detected CLI                                     |
| None of the above is reachable      | `references/publishers/manual-paste.md`    | hand the user the markdown + the destination URL |

The security audit (§7) runs before the publish call. When the destination is unreachable (MCP missing, CLI absent), fall back to manual paste and tell the user which tool to install or which URL to paste into, so the body is never lost.

### 7. Security audit before publish

The number follows §6 for reading order, but the audit runs before §6's publish call. Before any external publish fires, apply the rules in `references/security-rules.md`. Hard refusals include admin or schema-owner credentials, session-signing secrets (`NEXTAUTH_SECRET`, JWT signing keys) and credentials already exposed in git history without rotation.

When the only DB credential available is a superuser, stop and ask the user to provision a `qa_*` read-only role first, handing over the SQL and the route (`references/security-rules.md` Hard refusal 1). The role and its grants are a schema change on the route `stack.database.migrations_tool` names in `agentic-dev-core/references/db-change-doctrine.md`, and a person sets the role's password outside the migration history. The skill never applies any of it.

### 8. Verification

Run `references/verification-checklist.md`: typecheck, build and lint on the host's own scripts, a browser smoke through `/playwright-cli` (page loads, CTA opens the credentials source in a new tab, accordions and copy buttons work, the redirect works), a check that the published artifact renders its snippets, a secret scan of `git diff`, the snapshot check and the self-check. When a step fails, fix it and re-run from step 1. A failure is never papered over.

### 9. Commit and PR

Delegate to `/git-flow-master`. This skill runs no `git push`, `gh pr create` or branch operation inline. The orchestrator hands `/git-flow-master` the branch name (`feat/testability-guide` for a fresh scaffold, `fix/testability-guide-drift-YYYY-MM-DD` for a surgical patch), the commit-message stems (one for the page, one for the redirect, one per dependency bump) and the PR title `feat(qa): add Software Testability Guide for QA at /qa` (or `fix(qa): refresh testability guide after stack drift`).

The work lands through that PR. Whether anything may go straight to a protected branch is `/git-flow-master`'s call: it resolves `git_strategy.policy.direct_push_to_protected` (AGENTS.md Critical Rule #4). This skill never pushes and never decides the push policy.

---

## With nobody at the keyboard

Every point where this skill waits for a person has three paths, per `agentic-dev-core/references/decision-protocol.md` §5.2. A person present gets the interactive step above, unchanged. A supervised worker sends the question to its launcher, which holds the gate, and keeps working on what does not depend on the answer. A routine (an unattended automation, `/autonomous-delivery`, CI) never waits: a brief from the launcher that covers the decision is the approval, and without one the routine does the reversible work, stops before any outward or irreversible action (a Jira, Confluence or Notion write, a push, a message) and reports.

| Wait point | Routine path |
| --- | --- |
| Phase 0 resume, restart or abort | Resume. Restart and abort need a covering brief. |
| Composable Skills T4 prompt | Do not apply the T4 skill. Note it in the report. |
| Phase 0.5 plan acceptance | A covering brief approves the plan. Without one, leave `status: draft` and run only the local work of Phases 4, 5 and 8. |
| Phase 3 questions Q1 to Q5 | Use the brief's answers, else each question's routine path in `references/decision-questions.md`. Report each as DECIDED with the option it beat. |
| T3 project type unclear | Gate the page and say so in the report. |
| Phase 6 publish to Jira, Confluence or Notion | Without a covering brief, build the body, save it locally as the manual-paste handover and report the destination. |
| Phase 7 only a superuser credential exists | Stop and report with the SQL. This holds for every run. |
| Phase 8 step 5 destination check | Record `user-confirmed: pending` in the audit trail. |
| Phase 9 branch, commit, PR | `/git-flow-master` and the routine's brief decide. |
| MCP `401` or `403` on a publish | Stop and report the env variable to fix. A fixed `.env` needs a restarted session. |

---

## Subagent dispatch

Once the decisions are locked, page codegen and credentials-artifact publish are independent. Use the parallel pattern in `agentic-dev-core/references/dispatch-patterns.md`:

- Sub-agent A: page codegen, routing and redirect.
- Sub-agent B: credentials-artifact build (template) and publish (chosen channel).
- Sequential after both: verification (Sub-agent C: browser smoke, lint and build), then `/git-flow-master` (branch, commit, PR).

Each briefing follows the 7-component template in `agentic-dev-core/references/briefing-template.md` and names the specific reference file the sub-agent must read.

---

## Hand-offs

When the skill finishes, the page and the artifact are live. Hand off to:

- Docs follow-through (`agentic-dev-core/references/docs-follow-through.md`): add the new `/qa` page and the credentials-artifact location to `.agents/instructions/agent-project.md` (`## Key paths (this project)`, never `AGENTS.md` or a shared section) and to any doc that lists the app's pages, so future skills know they exist. Placement follows `agentic-dev-core/references/instructions-doctrine.md` §4, closed by `bun run instructions:check`.
- `/sprint-development`: bugs testers find in the page itself become normal stories.
- `/project-context features`: flag the `/qa` page so future map refreshes record it as an internal-only operational page with no PRD coverage required.

---

## Verification rule

The skill is done only when all eight items of `references/verification-checklist.md` are true, self-check included.

After the eight items pass, the orchestrator archives per `agentic-dev-core/references/session-management.md` §8: it moves `.session/testability-guide/` to `.session/.archive/<YYYY-MM-DD>-testability-guide-project/` and calls `mem_session_summary` with the archive path, so a later `mem_search` can navigate back. The `/qa` snapshot comment stays in place. It is the cross-run drift signal for the next invocation, independent of the archived session directory.

---

## Notes

- The security rules are in `references/security-rules.md`. Read them before any publish.
- MCP credentials are cached at MCP-spawn time (AGENTS.md Critical Rule #9). When a publish fails on `401` or `403`, stop, point the user at the right `.env` variable and ask for a restarted agent session. No workaround.
- Visible copy follows the host app's language signal (root `lang` attribute, i18n config, copy already in a language). With no signal, Q5 asks and no language is assumed for a person present (a routine writes English and reports it, per `references/decision-questions.md`). Code identifiers and `data-testid`s stay in English whatever the language.
- One dependency is sanctioned: a server-only syntax highlighter (Shiki, or the host's existing equivalent). When the host has none, the skill may add Shiki, because it runs at build or request time, emits static dual-theme HTML and ships zero client JavaScript. Q6 (`references/decision-questions.md`) and detection gate it: reuse the host's highlighter if one exists, and skip the addition when the host has an explicit "no new deps" policy. Everything else adds no dependency. Tabs, badges, request cards and the highlight pipeline's framing components are local files in the host's style, and a missing `<CodeBlock>` becomes a minimal local component with a copy button.
