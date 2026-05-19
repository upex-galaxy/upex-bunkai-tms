---
name: acli
description: 'Atlassian CLI (official `acli` binary, v1.3+ as of 2026) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal. Use whenever the user wants to create, view, edit, transition, assign, clone, archive, comment on, link, or bulk-operate on Jira work items (Story, Bug, Task, Epic) from the command line; list or manage projects, boards, sprints, filters, dashboards, or custom-field definitions; create or update Confluence spaces, pages, or blog posts; activate/deactivate users at the org level; or authenticate to Atlassian from a shell or CI pipeline. Triggers on: `acli`, Atlassian CLI, Jira from the terminal, Confluence from the terminal, transition Jira ticket, transition story to In Review, create Jira issue from CLI, create bug from CLI, fetch story details from CLI, link PR to story, bulk Jira operations, create issues from a JSON/CSV file, script Jira, automate Jira tickets, transition a bunch of issues, CI pipeline that touches Jira, log in to Jira CLI, switch Atlassian sites, API-token auth for Jira. Use this skill even when the user does not say the word `acli` — if the task is CLI-driven Jira or Confluence work, this is the right tool. Do NOT use for: full sprint-development orchestration (use /sprint-development), code review workflow (use /sprint-development Stage 3), product backlog seeding (use /product-management), Bitbucket command-line needs (acli does not cover Bitbucket), or the legacy Appfire/Bob Swift `acli` tool (a different product that happens to share the binary name).'
license: MIT
compatibility: [claude-code, cursor, codex, opencode]
allowed-tools: Bash(acli:*)
complementary_categories:
  - issue-tracker
---

# Atlassian CLI (`acli`)

`acli` is Atlassian's official command-line tool for Jira Cloud, Confluence Cloud, and org admin operations. In this DEV boilerplate it serves as the primary `[ISSUE_TRACKER_TOOL]` — see `CLAUDE.md` Tool Resolution table. The Atlassian MCP server is OPT-IN (not enabled by default) and documented as a fallback in docs/mcp/ for users who choose to install it manually.

This skill teaches how to drive `acli` for any DEV intent: fetching story details for an implementation plan, transitioning a ticket through the Ready For Dev → In Progress → In Review → Ready For QA workflow, creating bugs from inside `/sprint-development`, linking PRs to stories, and scripted/CI Jira automation.

## Why this skill exists

`acli` has several traits that make it easy to misuse:

1. **Silent pagination truncation.** `workitem search` without `--paginate` returns the first page only — no warning. Scripts that count or iterate keys read the wrong number of items.
2. **Auth is per-product.** `acli jira auth login` does not authenticate `acli admin`, `acli confluence`, or `acli rovodev`. There is also a top-level `acli auth` for global OAuth (newer surface). Each scope has its own session.
3. **The "work item" vs "issue" split.** The CLI renamed commands (`jira issue` → `jira workitem`) but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType`/`parentIssueId` spellings. Mixing old and new terminology in the same script works, but confuses readers.
4. **Unknown subcommands fail silently.** Typing `acli jira workflow --help` does NOT error — it falls back to `acli jira --help` with exit 0. So "no error" ≠ "command exists". Always verify by checking the help body actually changed.
5. **Hard limits the docs do not advertise.** `acli` cannot list custom fields, edit custom-field values on existing items, manage workflows, manage issue types, or touch project versions/components. See `references/gotchas.md`.

The body below covers the core that applies to almost every DEV session. The `references/` directory holds the deep material — load only the one you need.

## Composable Skills (auto-resolved at skill entry)

`acli` is itself the canonical issue-tracker skill — there are no T3 skills that overlap its category in `.claude/skills/agentic-dev-core/references/skill-composition-strategy.md` §5.1. Composition is therefore minimal and exists for protocol consistency only.

Steps:

1. Read `complementary_categories` from this skill's frontmatter (`issue-tracker`).
2. Resolve via local skill-registry script (`scripts/build-skill-registry.ts` → cached at `.claude/skills/REGISTRY.md`). Fallback: scan the session-start `system-reminder` skill list.
3. Apply threshold rule per strategy doc §3.2 (T1/T3 silent; T4 ASK).
4. The Atlassian MCP fallback documented below is OPT-IN, not a skill — enable manually via docs/mcp/.

Expected matches: typically none. If the user has installed a future T4 skill in the `issue-tracker` category (e.g. an `acli` extension authored by a third party), it would surface here under the ASK rule.

Skip step if the catalog is unavailable; log `skill_resolution: "fallback-inline"` plus `missing: [<categories>]` per §3.4.

## Fallback: Atlassian MCP

> **Opt-in only**: this MCP is NOT enabled in the default boilerplate. To use it, copy the atlassian block from `docs/mcp/<agent>.template.*` into `.mcp.json` / `opencode.jsonc`, ensure `ATLASSIAN_*` in `.env` are set, and restart the agent. Behavior below applies only after opt-in.

If `acli` is not installed or authenticated, fall back to the Atlassian MCP server (MCP tool namespace: `mcp__atlassian__*` or similar — check the MCP tool list for the exact prefix in the current environment).

**When to prefer MCP over acli**:

- `acli` binary is not installed in the environment.
- `acli` auth fails and cannot be fixed in the current session.
- The operation is one of the documented `acli` blind spots: enumerate custom fields, edit custom-field values on existing work items, manage workflows / issue types / priorities / resolutions / project versions / components, upload attachments, add watchers, add an item to a sprint.

**When to prefer acli over MCP**:

- Bulk operations (acli consumes far fewer tokens per call).
- Scripting / CI pipelines.
- Operations that return large result sets (MCP payloads inflate token usage).

**Coverage parity**: MCP and `acli` overlap for issues, projects, boards, sprints, comments, and basic Confluence ops. For org-admin user lifecycle and Confluence space CRUD, `acli` is more direct. For schema/admin reads (field catalog, workflow definitions), MCP/REST is the only viable path.

## Role inside the DEV workflow

This skill complements the `/sprint-development` mega-orchestrator. It does NOT drive the sprint loop — it is the underlying CLI surface that `/sprint-development` and other DEV skills call when they need to talk to Jira:

| DEV moment                                                                          | What this skill does                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/sprint-development` Stage 1 (Planning) — fetch ticket                             | `acli jira workitem view UPEX-123 --json` → ACs, Gherkin, Scope, Mockup, Workflow custom fields |
| `/sprint-development` Stage 1 — transition story to In Progress                     | `acli jira workitem transition --key UPEX-123 --status "{{jira.status.story.in_progress}}"`     |
| `/sprint-development` Stage 3 (Code Review) — transition to In Review               | `acli jira workitem transition --key UPEX-123 --status "{{jira.status.story.in_review}}"`       |
| `/sprint-development` Stage 4 — handoff to QA                                       | `acli jira workitem transition --key UPEX-123 --status "{{jira.status.story.ready_for_qa}}"`    |
| `/sprint-development` Stage 3 — found a defect mid-implementation                   | `acli jira workitem create --project UPEX --type Bug --summary "..." --parent UPEX-123`         |
| Linking the merged PR back to the ticket                                            | `acli jira workitem link create --out UPEX-123 --in <pr-issue-or-remote-link>`                  |
| `/product-management` — bulk-create stories from a CSV                              | `acli jira workitem create-bulk --from-csv stories.csv --yes`                                   |
| `/product-management` (workflow G) — pull all in-flight stories for a sprint report | `acli jira workitem search --jql "..." --paginate --json`                                       |

Issue types DEV cares about: **Story**, **Bug**, **Task**, **Epic**. Test-management issue types live in the sister QA repo and are not handled here.

## Command structure

```
acli <product> [<feature>] <action> [flags]
```

| Product      | Purpose                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `jira`       | Jira Cloud — work items, projects, boards, sprints, filters, dashboards, custom-field definitions |
| `confluence` | Confluence Cloud — spaces (CRUD), blog posts, page view                                           |
| `admin`      | Organization admin — API-key auth, user lifecycle                                                 |
| `auth`       | Global OAuth (cross-product, newer top-level surface)                                             |
| `rovodev`    | Rovo Dev AI coding agent (separate beta product)                                                  |
| `feedback`   | Send feedback or a bug report to Atlassian                                                        |
| `config`     | Atlassian Government Cloud configuration (`gov-cloud`)                                            |
| `completion` | Generate shell-autocompletion script (bash / zsh / fish / powershell)                             |

Every level has `--help`. Use it aggressively when unsure:

```bash
acli --help
acli jira --help
acli jira workitem --help
acli jira workitem create --help
```

## Quick start (DEV flow)

```bash
# 1. Authenticate against a site using an API token (scriptable path)
echo "$ATLASSIAN_API_TOKEN" | acli jira auth login \
  --site "{{ATLASSIAN_SITE}}" \
  --email "you@example.com" \
  --token

# 2. Verify
acli jira auth status

# 3. Fetch the story you are about to implement (impl-plan input)
acli jira workitem view UPEX-123 --json | jq '.fields | {summary, status, assignee, customfield_acceptance_criteria_gherkin}'

# 4. Move it into "In Progress" when /sprint-development Stage 1 starts
acli jira workitem transition --key UPEX-123 --status "{{jira.status.story.in_progress}}"

# 5. Search for everything you own that is still open (sprint dashboard)
acli jira workitem search \
  --jql "assignee = currentUser() AND status in ('Ready For Dev','In Progress','In Review')" \
  --paginate --json
```

## Top-level command map

### Jira (`acli jira`)

| Subcommand  | What it covers                                                                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`      | login · logout · status · switch — API-token or OAuth                                                                                                                                                                                                           |
| `workitem`  | archive · assign · attachment (list / delete) · clone · comment (create / delete / list / update / visibility) · create · create-bulk · delete · edit · link (create / delete / list / type) · search · transition · unarchive · view · watcher (list / remove) |
| `project`   | archive · create · delete · list · restore · update · view                                                                                                                                                                                                      |
| `board`     | create · delete · get · list-projects · list-sprints · search                                                                                                                                                                                                   |
| `sprint`    | create · delete · list-workitems · update · view                                                                                                                                                                                                                |
| `filter`    | add-favourite · change-owner · get · get-columns · list · reset-columns · search · update                                                                                                                                                                       |
| `dashboard` | search                                                                                                                                                                                                                                                          |
| `field`     | cancel-delete · create · delete · update — **custom-field DEFINITIONS only**, NOT values, and **no listing**                                                                                                                                                    |

### Confluence (`acli confluence`)

| Subcommand | What it covers                                                |
| ---------- | ------------------------------------------------------------- |
| `auth`     | login · logout · status · switch — same model as `jira auth`  |
| `space`    | archive · create · list · restore · update · view (full CRUD) |
| `blog`     | create · list · view                                          |
| `page`     | view (read-only as of v1.3.18 — page CRUD not yet exposed)    |

### Admin (`acli admin`)

| Subcommand | What it covers                                 |
| ---------- | ---------------------------------------------- |
| `auth`     | login · logout · status · switch — API key     |
| `user`     | activate · deactivate · delete · cancel-delete |

## The selector pattern (the thing to internalize)

Most mutating `workitem` commands (`edit`, `transition`, `assign`, `archive`, `clone`, `comment create`) accept **one of** these target selectors:

| Selector            | When to use                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `--key KEY-1,KEY-2` | You already know the exact keys (the common DEV case — you have a UPEX-XXX) |
| `--jql "..."`       | You want everything matching a JQL query (sweeps, bulk transitions)         |
| `--filter 10001`    | You want to reuse a saved Jira filter                                       |
| `--from-file f`     | You have a file listing keys (`archive`/`unarchive`/`assign`)               |

When the selector matches many items, the command is **a batch operation**. Two flags almost always matter:

- `-y, --yes` — skip the interactive confirmation prompt. Required in CI; if omitted the command hangs waiting on stdin. **Note:** this flag does NOT exist on `admin user delete` / `admin user cancel-delete` (use `--ignore-errors` there instead).
- `--ignore-errors` — do not abort the batch when a single item fails.

## Output and piping

All list/search/view commands support three shapes:

- default table (human-readable)
- `--json` (for `jq` / scripts)
- `--csv` (spreadsheet-friendly)

Example pipe patterns:

```bash
# Count only — how many stories are still in "In Progress"?
acli jira workitem search --jql "project = UPEX AND status = 'In Progress'" --count

# Save a sprint snapshot to CSV
acli jira workitem search --jql "project = UPEX AND sprint in openSprints()" --paginate --csv > sprint.csv

# Extract a single field with jq (story summary for the impl-plan header)
acli jira workitem view UPEX-123 --json | jq '.fields.summary'
```

The JSON shape from `workitem search` has a top-level `issues` array (not `workitems`) — the Jira REST v3 wire format shows through.

## Five gotchas to keep in mind always

1. **`--paginate` is opt-in.** Default limit is server-side (30–50 depending on command). No warning on truncation. If you are counting, iterating, or making decisions based on the result, pass `--paginate`.
2. **Custom fields on `workitem create` go through `additionalAttributes` in `--from-json`.** Numeric IDs only (`customfield_10122`), no name-addressing. Documented value shapes in the `create` template are: `{"value": "..."}` (single-select), bare number, bare string. **`workitem edit` does NOT document custom-field input** — for editing custom-field values on existing items, fall back to REST/MCP. See `references/workitem.md` and `references/gotchas.md`.
3. **`acli` cannot enumerate custom fields.** `acli jira field` only does create/update/delete/cancel-delete. To discover field IDs, use `workitem view --json | jq` against an item that has the field set, or call `GET /rest/api/3/field` directly. There is no in-CLI listing. In this boilerplate, `bun run jira:sync-fields` writes the canonical map to `.agents/jira-fields.json` — reference fields by slug via `{{jira.<slug>}}` instead of hardcoding numeric IDs.
4. **Transitions match by status name, not transition ID.** When two transitions lead to the same status with different validators, the CLI picks one and may fail. No `--transition-id` escape hatch exists — fall back to REST if this hits.
5. **Trace IDs are the only debug signal.** An `unexpected error, trace id: XXXXXXXX` line is all you get on backend failures. Capture and log the trace ID always; Atlassian Support needs it.

## Top-level utilities

Quick-reference for the top-level surface that doesn't fit under a product. None of these need a separate reference file — they're documented here in full.

### `acli completion` — shell autocompletion

```bash
acli completion bash       > /etc/bash_completion.d/acli
acli completion zsh        > "${fpath[1]}/_acli"
acli completion fish       > ~/.config/fish/completions/acli.fish
acli completion powershell > acli.ps1
```

Each subcommand prints a shell script to stdout. Pipe to the location your shell expects (above are the conventional paths).

### `acli feedback` — report a problem to Atlassian

```bash
acli feedback \
  --summary "JSON shape on edit --generate-json is misleading" \
  --details "The template doesn't include additionalAttributes for custom fields..." \
  --email "you@example.com" \
  --time "1h" \
  --attachments error.log,trace.txt
```

Flags: `-s, --summary`, `-d, --details`, `-e, --email`, `-t, --time` (estimated timeframe like `1h`, `15m`), `-a, --attachments` (multiple files).

### `acli auth` — global OAuth (newer surface)

A top-level OAuth login that authenticates across products in one step. Distinct from per-product `jira auth` / `admin auth` / `confluence auth`. Use the per-product login for token-based CI; use the global one for interactive multi-product browsing.

```bash
acli auth login           # interactive OAuth
acli auth status
acli auth switch
acli auth logout
```

See `references/auth.md` for the full auth model.

### `acli config gov-cloud` — Atlassian Government Cloud

```bash
acli config gov-cloud --enable
acli config gov-cloud --status
```

Niche — only relevant if your org is on Atlassian Government Cloud. Not used in standard commercial Jira/Confluence.

## Navigation — when to load which reference

Load the reference that matches the user's current need. Do not preload all of them.

| If the user wants to…                                                                                           | Load                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Log in, switch sites, handle tokens, authenticate in CI                                                         | `references/auth.md`                  |
| Work with Jira tickets (create, edit, transition, search, bulk, comments, links, watchers, custom-field shapes) | `references/workitem.md`              |
| Manage projects, boards, sprints, filters, dashboards, custom-field definitions                                 | `references/project-board-sprint.md`  |
| Work with Confluence spaces, blogs, pages                                                                       | `references/confluence.md`            |
| Run org-level admin tasks (API key, user lifecycle)                                                             | `references/admin.md`                 |
| Pipe output, produce JSON/CSV, dry-run, run on CI/CD                                                            | `references/output-and-automation.md` |
| Diagnose surprising behavior, known bugs, REST fallback points                                                  | `references/gotchas.md`               |

## Working style

- **Prefer API-token auth in scripted contexts.** `--web` / OAuth is for humans at a terminal.
- **Always pass `--yes` in CI** for any mutating command (where the flag exists).
- **Always pass `--paginate`** when a downstream script consumes the result.
- **Scaffold complex payloads with `--generate-json`** (create, edit, project create, project update, link create, create-bulk). Pipe to a file, edit, submit with `--from-json`. Note: `--generate-json` is **static** — it does NOT introspect the actual project schema, so for custom-field shapes you may need to view a real item.
- **Capture the trace ID on any failure** and surface it when reporting to the user.
- **Do not invent flags.** When unsure, run `acli <path> --help` — it is authoritative and version-pinned to the installed binary. Convention: every multi-word flag is **kebab-case** (`--from-json`, `--searcher-key`, `--filter-id`, `--order-by`). camelCase variants will fail.
- **Verify subcommand existence before assuming.** Unknown subcommands silently fall back to parent help with exit 0 — they do NOT error. Read the help body, don't trust the exit code.
- **Know what `acli` cannot do.** All of the following require REST or MCP — `acli` does not cover them as of v1.3.18:
  - Enumerate custom fields (`field` has no `list`).
  - Edit custom-field values on existing work items (`workitem edit` does not document custom-field input).
  - Manage workflows, workflow schemes, statuses, or transition definitions.
  - Manage issue types, priorities, resolutions, project versions, project components.
  - Add a work item to a sprint (`JRACLOUD-97107`).
  - Upload attachments, add watchers.
  - Rich ADF comments on `comment create` (only on `comment update`).
  - Retrieve the cached auth token for reuse in another tool.
  - Bitbucket operations (out of scope entirely).
  - Confluence page CRUD beyond `page view` (as of v1.3.18 — space and blog have full CRUD).

  See `references/gotchas.md` for the full list with REST recipes.

## Installation (reference only)

Users usually already have `acli` installed. If not, point them at:

- Official guide: https://developer.atlassian.com/cloud/acli/guides/install-acli/
- macOS: `brew tap atlassian/homebrew-acli && brew install acli`
- Linux (Debian/Ubuntu): `apt install acli` (after adding the Atlassian apt repo)
- Linux (RHEL/Fedora): `yum install acli` (after adding the Atlassian yum repo)
- Windows: PowerShell `curl` install (no Chocolatey/MSI yet)
- CI one-liner (Linux): `curl -LO "https://acli.atlassian.com/linux/1.3.18/acli_linux_amd64/acli" && chmod +x acli`

Pin to a version URL in production pipelines — `latest/` has caused same-day mass failures. Each release is supported for six months. Run `acli --version` to check.
