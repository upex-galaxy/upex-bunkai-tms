# Jira Operations — Tool Routing Decision Table

> **Purpose**: Central tool-routing decision table consumed by every product-management workflow that touches Jira. This file owns the question "which tool layer handles which Jira operation?" so sibling references (`epic-creation.md`, `add-feature.md`, `product-backlog-seed.md`, `story-refinement.md`, `acceptance-criteria.md`, `dependency-linking.md`, `sprint-sequencing.md`) can cite operation semantics without re-deciding tool routing or leaking syntax.
> **Use when**: Any workflow step needs to read or write Jira state. Look up the operation in the decision table below, then load the owning tool skill for the exact HOW.
> **Companion references**:
>
> - `dependency-linking.md` — link-creation operations (depends on this routing layer).
> - `jira-publishing-gotchas.md` — ADF rich-text bugs that affect rich-text writes (description + custom fields).
> - `description-custom-field-dedup.md` — what content goes into which slot before any write happens.

---

## Tool Resolution recap

Routing follows the canonical table in `CLAUDE.md` §6 (Tool Resolution). For Jira:

`[ISSUE_TRACKER_TOOL]` resolves to a three-tier stack:

| Tier        | Layer                | Owning skill / source                                                                                                                                |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary     | `/acli` skill        | `.claude/skills/acli/SKILL.md` — local CLI, lowest token cost, best for scripting and bulk reads.                                                    |
| Fallback    | Atlassian MCP server | Opt-in (MCP tool namespace shown in the session-start tool list once enabled). Use when the primary CLI is unavailable, unauthenticated, or hits one of its documented blind spots. |
| Last resort | REST `PUT/POST /rest/api/3/...` | Direct HTTP using `ATLASSIAN_API_TOKEN` from `.env`. Only when both higher tiers fail OR when an `acli`-documented workaround mandates it.   |

**Hard rule**: this file describes routing only. The exact command syntax, JSON shapes, flag names, pagination logic, and error semantics live inside the owning tool skill. For `acli`-specific command syntax (including the REST PUT workaround for editing rich-text custom fields on existing issues), see `.claude/skills/acli/SKILL.md` §Publishing rich text.

---

## Operation decision table

Each row names a single Jira operation and the recommended tool tier. Pick the leftmost tier that satisfies the pre-conditions in the next section.

| Operation                              | Primary `[ISSUE_TRACKER_TOOL]` tier | Fallback                             | Last resort                                                                       |
| -------------------------------------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Create issue (Epic / Story / Bug)      | `/acli` — issue create              | Atlassian MCP                        | REST `POST /rest/api/3/issue`                                                     |
| Update existing description (rich-text) | `/acli` — issue edit (description)  | Atlassian MCP — `description` only auto-converts Markdown | REST `PUT /rest/api/3/issue/{KEY}` with ADF payload                  |
| Update existing ADF custom field       | **`/acli` cannot edit custom fields on existing issues** — escalate immediately | Atlassian MCP, one call per field (see `jira-publishing-gotchas.md` Gotcha 2) | REST `PUT /rest/api/3/issue/{KEY}` per field — canonical workaround documented in `.claude/skills/acli/SKILL.md` §Publishing rich text |
| Transition issue status                | `/acli` — workitem transition       | Atlassian MCP                        | REST `POST /rest/api/3/issue/{KEY}/transitions`                                   |
| Create issue link (Dependencies / Blocks / Relates) | `/acli` — workitem link create     | Atlassian MCP                        | REST `POST /rest/api/3/issueLink`                                                 |
| Get issue with custom fields           | `/acli` — workitem view (`--json`)  | Atlassian MCP                        | REST `GET /rest/api/3/issue/{KEY}?fields=...`                                     |
| Bulk fetch (search by JQL)             | `/acli` — workitem search (`--paginate --json`, lowest token cost) | Atlassian MCP    | REST `GET /rest/api/3/search?jql=...`                                             |

Cells describe **what the operation is**, not **how to run it**. For literal command shapes, load the owning tool skill.

---

## Pre-conditions per operation

Before invoking any of the above, satisfy the operation-specific pre-conditions. These are methodology gates — skipping them produces silent corruption.

- **Rich-text writes (description, ADF custom fields, comments)** — must be ADF-aware. Markdown does NOT auto-convert outside the top-level `description` field on Atlassian MCP. Cross-link: `references/jira-publishing-gotchas.md` documents the two known authoring bugs (combined `code`+`strong` marks → HTTP 400; MCP batched custom-field rejection).
- **Custom-field writes** — resolve the slug via `{{jira.<slug>}}` against `.agents/jira-required.yaml`. Numeric custom-field IDs come from `.agents/jira-fields.json` (refreshed by `bun run jira:sync-fields`). Never hardcode the numeric ID in skill content or AI output.
- **Issue-link creation** — resolve the link type via `{{jira.link_types.<slug>}}` against `.agents/jira-required.yaml`. Workspace-level link-type names come from `.agents/jira-link-types.json` (refreshed by `bun run jira:sync-link-types`). Determine directionality (which issue is `outwardIssue`, which is `inwardIssue`) per `dependency-linking.md`.
- **Status transitions** — resolve the status slug via `{{jira.statuses.<slug>}}` against `.agents/jira-required.yaml` (e.g. `epic_default`, `story_default`). Workspace-level transition catalog comes from `.agents/jira-workflows.json` (refreshed by `bun run jira:sync-workflows`). If the slug is unset or absent, apply the `fallback_literal` declared in the catalog and surface a warning.
- **Bulk fetch** — always request pagination explicitly. The primary CLI silently truncates to the first page when pagination is omitted; the workflow that consumes the result must request all pages or scope the JQL narrowly enough to fit a single page.

---

## Degradation rules

When the primary tier is unavailable or fails, follow this protocol:

1. **Escalate to the next tier** in the operation row. Do not skip tiers (e.g. do not jump from Primary to Last resort if Fallback would have worked).
2. **Log the degradation** in the workflow output so the user can see which tier ran. Format: `tool_layer: primary | fallback | last_resort` plus a one-line reason (e.g. primary CLI not installed, MCP not opted in, primary returned 5xx).
3. **Surface semantic degradation explicitly** when the tier change loses meaning:
   - Issue-link fallback from `dependencies` to symmetric `relates` — direction is lost. The workflow MUST tell the user this happened and recommend creating the canonical `Dependencies` link type in the workspace.
   - Status transition skipped because the slug resolves to an absent workspace status — workflow MUST report `transition_skipped: <slug>` and continue without halting.
4. **Halt only on hard failures**, not on tier degradation. A hard failure is: all three tiers exhausted, or a write operation that cannot be retried safely.

---

## What this file does NOT contain

Command flags, JSON shapes, ADF payload structure, pagination cursors, authentication setup, and error-code semantics — those live in the owning tool skill (`/acli` for the primary tier, the MCP server docs for the fallback, the Atlassian REST API docs for the last resort). Re-route any HOW-questions to the tool skill rather than expanding this file. This file owns routing decisions only; the moment a question becomes "what flag do I pass?", load the owning skill.
