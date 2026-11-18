# Jira Operations: tool routing decision table

> **Purpose**: Says which tool layer handles which Jira operation, so the sibling references (`epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md`, `acceptance-criteria.md`, `dependency-linking.md`, `sprint-sequencing.md`) can cite an operation without re-deciding the routing or copying syntax.
> **Use when**: A workflow step reads or writes Jira state. Find the operation in the decision table, then load the owning tool skill for the exact command.
> **Companion references**:
>
> - `dependency-linking.md`: link-creation operations (built on this routing layer).
> - `jira-publishing-gotchas.md`: ADF rich-text bugs that affect rich-text writes (description and custom fields).
> - `description-custom-field-dedup.md`: which content goes into which slot before any write happens.

---

## Tool Resolution recap

Routing follows the canonical table in `.agents/instructions/agent-tool-resolution.md` §6 (Tool Resolution). For Jira:

`[ISSUE_TRACKER_TOOL]` resolves to a three-tier stack:

| Tier        | Layer                | Owning skill / source                                                                                                                                |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary     | `/acli` skill        | `.agents/skills/acli/SKILL.md`: local CLI, lowest token cost, best for scripting and bulk reads.                                                     |
| Fallback    | Atlassian MCP server | Opt-in (MCP tool namespace shown in the session-start tool list once enabled). Use when the primary CLI is unavailable, unauthenticated, or hits one of its documented blind spots. |
| Last resort | REST `PUT/POST /rest/api/3/...` | Direct HTTP using `ATLASSIAN_API_TOKEN` from `.env`. Only when both higher tiers fail OR when an `acli`-documented workaround mandates it.   |

This file covers routing only. Command syntax, JSON shapes, flag names, pagination logic and error semantics live in the owning tool skill. For `acli` syntax, including the REST PUT workaround for editing rich-text custom fields on existing issues, see `.agents/skills/acli/SKILL.md` §Publishing rich text.

---

## Operation decision table

Each row names one Jira operation and its tool tiers. Pick the leftmost tier that satisfies the pre-conditions in the next section.

| Operation                              | Primary `[ISSUE_TRACKER_TOOL]` tier | Fallback                             | Last resort                                                                       |
| -------------------------------------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Create issue (Epic / Story / Bug)      | `/acli`: issue create              | Atlassian MCP                        | REST `POST /rest/api/3/issue`                                                     |
| Update existing description (rich-text) | `/acli`: issue edit (description)  | Atlassian MCP (`description` only auto-converts Markdown) | REST `PUT /rest/api/3/issue/{KEY}` with ADF payload                  |
| Update existing ADF custom field       | **`/acli` cannot edit custom fields on existing issues**, so escalate immediately | Atlassian MCP, one call per field (see `jira-publishing-gotchas.md` Gotcha 2) | REST `PUT /rest/api/3/issue/{KEY}` per field, the canonical workaround documented in `.agents/skills/acli/SKILL.md` §Publishing rich text |
| Transition issue status                | `/acli`: workitem transition       | Atlassian MCP                        | REST `POST /rest/api/3/issue/{KEY}/transitions`                                   |
| Create issue link (Dependencies / Blocks / Relates) | `/acli`: workitem link create     | Atlassian MCP                        | REST `POST /rest/api/3/issueLink`                                                 |
| Read issue **with custom fields** (single) | `bun run jira:sync-issues get <KEY>` materializes per-field files locally (REST under the hood). **`acli view` does NOT return custom fields**, so never use it to read AC / Scope / OOS / Business Rules / Workflow / plans. | Atlassian MCP | REST `GET /rest/api/3/issue/{KEY}?fields=...` |
| Read issues **with custom fields** (batch) | `bun run jira:sync-issues jql "<JQL>"` materializes every match locally with the same per-field strategy | Atlassian MCP | REST `POST /rest/api/3/search/jql` |
| Read standard fields / structure only  | `/acli`: workitem view / search (`--json`, lowest token cost) | Atlassian MCP | REST `GET /rest/api/3/issue/{KEY}` |

The cells say what the operation is, not how to run it. For command shapes, load the owning tool skill.

---

## Pre-conditions per operation

Each operation has a gate that skipping turns into silent corruption.

- **Rich-text writes (description, ADF custom fields, comments).** The content must be ADF-aware. Markdown does not auto-convert outside the top-level `description` field on Atlassian MCP. `references/jira-publishing-gotchas.md` documents the two known authoring bugs (combined `code`+`strong` marks give HTTP 400; MCP rejects batched custom-field updates).
- **Custom-field writes.** Resolve the slug via `{{jira.<slug>}}` against `.agents/jira-required.yaml`. Numeric custom-field IDs come from `.agents/jira-fields.json` (refreshed by `bun run jira:sync-fields`) and never appear in skill content or agent output.
- **Issue-link creation.** Resolve the link type via `{{jira.link_types.<slug>}}` against `.agents/jira-required.yaml`. Workspace-level link-type names come from `.agents/jira-link-types.json` (refreshed by `bun run jira:sync-link-types`). Set directionality (which issue is `outwardIssue`, which is `inwardIssue`) per `dependency-linking.md`.
- **Status transitions.** Resolve the status slug via `{{jira.statuses.<slug>}}` against `.agents/jira-required.yaml` (for example `epic_default`, `story_default`). The workspace transition catalog comes from `.agents/jira-workflows.json` (refreshed by `bun run jira:sync-workflows`). When the slug is unset or absent, apply the `fallback_literal` declared in the catalog and surface a warning.
- **Bulk fetch.** Request pagination explicitly. The primary CLI silently truncates to the first page otherwise, so the consuming workflow must request all pages or scope the JQL to fit one.

---

## Degradation rules

When the primary tier is unavailable or fails:

1. Escalate to the next tier in the operation row, one tier at a time. Do not jump from Primary to Last resort when Fallback would have worked.
2. Log the degradation in the workflow output so the user can see which tier ran: `tool_layer: primary | fallback | last_resort` plus a one-line reason (primary CLI not installed, MCP not opted in, primary returned 5xx).
3. Say so explicitly when the tier change loses meaning:
   - Issue-link fallback from `dependencies` to symmetric `relates` loses direction. Tell the user and recommend creating the canonical `Dependencies` link type in the workspace.
   - A status transition whose slug resolves to an absent workspace status runs the unmapped-status fallback in `agentic-dev-core/references/artifact-lifecycle.md` §4: list the live transitions, ask ONE question for the whole batch, fire the live id, and recommend `bun run jira:sync-workflows`. Report `transition_skipped: <slug>` only for a skip the user chose. Either way the batch continues without halting.
4. Halt only on hard failures: all three tiers exhausted, or a write that cannot be retried safely. A tier downgrade alone never halts.

---

## Reading & materializing issue state (canonical path)

Read Jira issue state through the local sync script, not through `acli view`:

- **`bun run jira:sync-issues get <KEY>`** fetches one issue (any type) with all its custom fields and materializes it locally. The output is a hybrid: `story.md` index + one Markdown file per rich-text field (`acceptance-criteria.md`, `business-rules.md`, `scope.md`, `out-of-scope.md`, `workflow.md`, `mockup.md`, `implementation-plan.md`, `acceptance-test-plan.md`, `acceptance-test-results.md`; epics also get `feature-implementation-plan.md` + `feature-test-plan.md`). A field file is written only when its Jira field is non-empty.
- **`bun run jira:sync-issues jql "<JQL>"`** fetches every issue matching a raw JQL and materializes each the same way (batch read).

**Why not `/acli` view.** Its default projection omits every `customfield_*`, so reading AC, Scope and the rest through it returns `null`, and a richly populated field looks empty (measured; see the `/acli` skill gotchas). Read custom fields through the sync script or REST `GET /rest/api/3/issue/{KEY}?fields=...`.

**No local authoring.** Issue content lives in Jira, and the sync script is the only tool that materializes it locally, so `.context/PBI/**` (epic.md, story.md, per-field files) is never hand-written. Author in Jira (create or REST PUT), then run `get`, `jql` or `pull` to refresh the local cache. The one exception is `.context/dev-roadmap.md`, which is not part of this sync-owned cache: `/project-context dev-roadmap` owns it (it regenerates §4 from the dependency graph and hand-authors §2/§3/§5/§6), so do not treat it as part of the read-only PBI mirror.

### Auditing an already-populated story (gap-safe review)

When asked to review or verify that a story's fields are complete (the story exists and may already be fully populated):

1. Run `bun run jira:sync-issues get <KEY>` and read the materialized per-field files (not `acli view`).
2. Run the Pre-flight voice & format gate (`SKILL.md`) against each field: persona (I19), business voice (I15), AC fenced per scenario as ` ```gherkin ` (I17), no description dedup (I3), source-spec format (I2).
3. Rewrite only the violating field, with one REST PUT per field. Clean fields stay untouched.

### Batch creation (many stories, many rich fields)

To create N stories that each carry M rich-text custom fields, follow the Batch pattern in the `acli` skill (`.agents/skills/acli/SKILL.md`, "Publishing rich text" then "Batch pattern"). A generator converts each field's Markdown to ADF via `scripts/md-to-adf.ts` and writes one `create --from-json` payload per story (custom fields under `additionalAttributes`), then a loop runs `acli create`. Editing custom fields on an existing issue still needs REST PUT, because `acli edit` rejects custom fields.

### Not handled here: sprint assignment is manual

Putting issues into a Jira Sprint object is left to a person. `acli` cannot add an issue to a sprint (`JRACLOUD-97107`), and sprints often start after a wait that a human decides. The methodology computes Execution Sprints (dependency order, see `sprint-sequencing.md`); a human assigns the Jira Sprint on the board UI (or via the REST agile API) when ready. Do not create or assign Sprint objects agentically.

---

## What this file does NOT contain

Command flags, JSON shapes, ADF payload structure, pagination cursors, authentication setup and error-code semantics. Those live in the owning tool skill (`/acli` for the primary tier, the MCP server docs for the fallback, the Atlassian REST API docs for the last resort). When a question becomes "what flag do I pass?", load the owning skill and keep this file to routing.
