# Session Footer Contract (shared, chat-facing)

> Cited by: every skill marked `metadata.stage_owner: true` in its frontmatter (`REGISTRY.md` prints `stage owner` on their Source line). Utility and core skills are exempt: they run inside a workflow session that already honors this.

This contract covers what the AI tells the human operator, without being asked, when a workflow session closes. It governs the terminal and chat conversation only. A Jira comment, a PR body and a commit keep their own templates and voice.

**Gate:** if you are about to tell the user a session or stage is done and have not printed the blocks below, you are not done reporting.

**Why it exists.** A business-outcome summary ("story shipped") leaves the operator with two questions: what did this session touch (a migration, the API, a production deploy?) and is it really done (did Jira move, is the PR green, is the deploy READY?). Both are cheap to answer up front and expensive to keep re-asking. The second is the one a success code answers wrongly (`AGENTS.md` Critical Rule 16).

---

## Part 1: Evidence paths (whenever a capture exists)

There are two trigger points, and both apply.

**1a. Immediately.** When a screenshot, recorded trace or log excerpt worth keeping is captured (live-UI validation, a failing E2E, a deploy log), state its repo-relative path in chat in that same turn.

**1b. Consolidated at session close.** The final chat report lists every capture the session made, defects first.

```
### Evidence (relative paths)
- .session/sprint-development/<KEY>/evidence/<KEY>-live-ui-<label>.png
```

- Leave the block out when the session captured nothing. No empty headings.
- List only files you verified on disk (`ls` the directory). A capture a subagent said it took, and you did not see, is not listed.
- The session folder is working state at `<<PRIMARY_ROOT>>`, not the gitignored `.context/PBI/` cache (`.agents/instructions/agent-local-context-pbi.md` §9). A capture another machine or a reviewer needs goes to the PR (comment) or to Jira (attachment), and the footer says where.

## Part 2: Session footer, tools used and dev surfaces touched

Print it once, in chat, at session or flow close:

- **Skills loaded**: every skill invoked this session, including the orchestrating workflow skill and anything loaded inside it or inside its subagents.
- **MCPs used**: every MCP server actually called (not just connected), named by the capability it served (`./mcp-capabilities.md` §2).
- **CLIs used**: every CLI actually invoked.
- **Dev surfaces touched**: one line per surface in the table below, each with a short note on what was done there. Write "none" for a surface the work would normally touch but did not, so the reader can tell "untouched" from "forgot to say". Do not pad what did not happen.

| Surface | Means |
|---|---|
| DB / migration | schema, RLS, migration files, seed data; a migration APPLIED anywhere says where |
| API | route handlers, OpenAPI contract, generated types |
| UI | components, pages, navigation (live-UI validated or not) |
| Unit tests | tests written or changed, and whether they ran |
| E2E | end-to-end runs or specs |
| Staging deploy | the deployment for the pushed SHA, and its state |
| Production deploy | same; `none` is the common, correct answer |

```
### Session Footer: Tools & Dev Surfaces
Skills loaded: sprint-development, git-flow-master, vercel-cli, acli
MCPs used: db (supabase), library-docs (context7)
CLIs used: gh, vercel, bun (jira:sync-issues, test, types:check)
Dev surfaces touched:
- DB / migration: one migration adding `profiles.deleted_at`, applied to staging only
- API: none
- UI: profile settings page, live-UI validated against staging
- Unit tests: 6 new tests on the soft-delete helper, all green
- E2E: none (no suite in this project)
- Staging deploy: SHA abc1234 READY
- Production deploy: none
```

### Framing per skill

| Skill | "Dev surfaces touched" means |
|---|---|
| `sprint-development`, `autonomous-delivery` | what the story or bug actually changed and shipped, surface by surface |
| `project-bootstrap` | which layers were scaffolded (DB, API, UI, env, auth) |
| `project-adoption` | `none` for the app's own code, schema and CI by contract; name the agentic files written (`.agents/project.yaml`, `.env`, catalogs, the plan) |
| `project-foundation`, `product-management`, `design-system`, `testability-guide` | usually all `none` (definition work); name the artifact written in the skill's own report |

## Part 3: Light stage verifier (closing checklist of every stage)

Every stage a stage owner runs closes with this checklist. "Light" means the agent answers each line from what it already did or read during the stage, plus at most one extra read per destination to confirm the outcome there and not at the receipt (Critical Rule 16). It is not a re-audit. Its job is to catch the step that was silently skipped.

```
Light stage verifier: <Stage name>
[ ] Tracker status: the issue re-read (bun run jira:sync-issues get <KEY>) shows the status this stage meant to reach
    (artifact-lifecycle.md §1: name the slug fired or verified, or the stated reason it was not)
[ ] Assignee: read back after every transition fired or verified (artifact-lifecycle.md §2), or stated N/A
[ ] DTU: a `DTU cycle N: +x K (total y K) source=<...>` comment and the cumulative `{{jira.development_token_usage}}` when the story reached `ready_for_qa`, or a stated N/A with the reason (no measured figure, or the item never reaches Ready For QA). Empty is valid, never a `NO`
[ ] Tracker writes: every field or comment this stage owns actually landed (re-read the body, not the "created OK")
[ ] PR: exists, base branch matches the git strategy, `gh pr checks` state named (green / red / pending)
[ ] Migration: the schema or migration ledger re-read shows the change (db capability), or stated N/A
[ ] Deploy: the deployment for the pushed commit SHA reads READY (staging / production), or stated N/A
[ ] progress.md checkpoint appended (.session/<skill-slug>/<scope>/progress.md, session-management.md §7)
[ ] Session footer printed in chat (Part 2)
```

Every line is `YES` or a stated `N/A` with its reason. A blank line is a failed verifier. Any `NO` blocks the stage: fix it or surface it to the user before moving on. A destination that could not be read (no credentials, missing capability) is a `NO` with that reason, never a `YES` on the strength of an exit code.

A skill lists only its stage-specific lines inline (which issue, which deploy) and cites this template for the rest.

### With nobody at the keyboard

The footer and the verifier still run. They are printed into the run's report, which goes to whoever launched the run. A supervised worker reports to its conductor or launcher. An unattended routine reports to its brief. A `NO` that a person would have settled is not waited on: the run fixes what it can reversibly, stops before any outward or irreversible action, and reports the `NO` with its reason (`./decision-protocol.md`).

## Multi-subagent aggregation rule

No single subagent sees the whole session, so the orchestrator is the one place that can compile the footer and the verifier. Either every stage subagent's report carries the fields below and the orchestrator unions them at close (preferred for dispatch-heavy flows), or the orchestrator records them as it dispatches. Either way the footer is compiled once, at the very end, never per stage or per subagent.

### Briefing snippet (paste into component 6, Report format)

> **Session-footer fields (mandatory in your structured report):** `skills_loaded` (array), `mcps_used` (array), `clis_used` (array), `dev_surfaces_touched` (array of `{surface, note}`; include a `{surface, note: "none"}` entry for any surface your stage would normally touch but did not), `evidence_captured` (array of repo-relative paths). Never drop a field; report an empty array explicitly. Also report `tokens_used`: the tokens this dispatch measurably spent (K = input plus output, cache reads apart) with its source (`harness` or `human`), or `unknown`; never an estimate. The orchestrator sums the figures into the DTU cycle.
