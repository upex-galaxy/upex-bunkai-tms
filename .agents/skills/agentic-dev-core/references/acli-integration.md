# `acli` repo integration for the DEV boilerplate

> This file plugs the tool-agnostic `acli` skill (`.agents/skills/acli/SKILL.md`) into the DEV workflow: the slug catalog, the sync-script pipeline and the repo-wide anti-patterns. `acli/SKILL.md` is shared with the QA boilerplate, so everything DEV-specific lives here and the tool surface stays in one place.
> Load it before the first Jira call of a session. It answers which slug, which status, which custom field and which sync script; `acli/SKILL.md` then answers how the binary works.
> Callers: `sprint-development`, `product-management`, `project-foundation`, `project-bootstrap`, `unit-testing` and `testability-guide`, whenever they write `[ISSUE_TRACKER_TOOL]` and it resolves to `/acli`.
> Companions: `acli/references/*.md` (per-command depth), `acli/references/adf-authoring-style.md` (what reads well in ADF), `product-management/references/jira-publishing-gotchas.md` (what breaks when publishing ADF), `scripts/sync-jira-*.ts` (catalog regeneration, run as `bun run jira:sync-*`), `sprint-development/SKILL.md` (the primary consumer).

---

## Role inside the DEV workflow

`acli` resolves one tool tag in this repo: `[ISSUE_TRACKER_TOOL]`. The Atlassian MCP fallback is opt-in and documented in `docs/mcp/`; the default is `/acli`.

Workflow skills write the tag and never call `acli` themselves. The AI resolves the tag, then loads this file and `acli/SKILL.md`. That indirection is what lets the methodology survive a tool swap.

### Reads and writes resolve to different tools

`[ISSUE_TRACKER_TOOL]` covers two kinds of operation, and they go to different places:

| Operation | Tool | Why |
|---|---|---|
| Detailed read (custom fields: ACs, Gherkin, Scope, Mockup, Workflow, implementation plans, bug fields; description; comments) | `bun run jira:sync-issues get <KEY> [--include-comments]`, then read the synced `.md` under `.context/PBI/` | `acli` `view` returns `null` for `customfield_*` unless you pass `--fields "*all"` and parse the JSON by hand. The sync script resolves every slug, converts ADF to Markdown and writes one file per field. |
| Batch read (many issues by JQL) | `bun run jira:sync-issues jql "<query>"` | Same materialization for every match. |
| Write (create, transition, comment, link, assign, custom-field update, bulk create) | `/acli` | The sync only pulls. Every mutation stays on `acli`. |
| Trivial lookup or sprint search (key, summary, status only) | `/acli` search | No materialization needed. |

Whenever you need the content of a custom field, sync it instead of calling `acli` `view`. Synced files live under `.context/PBI/` (`.agents/instructions/agent-local-context-pbi.md` §9): Jira is the source of truth and the local `.md` is a read-only cache. When a field is absent, the sync writes a pointer stub and the content lives in the issue's comments or description, per `fallback:` in `.agents/jira-required.yaml`. `product-management/references/jira-operations.md` and `acceptance-criteria.md` already work this way.

### How `/sprint-development` and `/product-management` use it

`acli` is the CLI surface underneath the `/sprint-development` orchestrator. It does not drive the sprint loop. Command shapes live in `acli/SKILL.md`; this table maps each DEV moment to the action and the slug substitutions.

| DEV moment | Action (shape in `acli/SKILL.md`) | DEV-specific substitutions |
|---|---|---|
| `/sprint-development` Stage 1 (Planning), fetch ticket detail | not acli: `bun run jira:sync-issues get <KEY> --include-comments` | `<KEY>` = `{{PROJECT_KEY}}-NNN`. ACs, Gherkin, Scope, Mockup and Workflow are custom fields, so read them from the synced `.md`. |
| Stage 1, transition the story to In Progress | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_progress}}` |
| Stage 3 (Code Review), transition to In Review | same command | `<STATUS>` = `{{jira.status.story.in_review}}` |
| Stage 4, hand off to QA | same command | `<STATUS>` = `{{jira.status.story.ready_for_qa}}` |
| Stage 3, defect found mid-implementation | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key |
| Link a merged PR back to the ticket | `jira workitem link create --out <KEY> --in <PR>` | `<KEY>` = Story key; `<PR>` = remote-link issue or PR identifier |
| `/product-management`, bulk-create stories from CSV | `jira workitem create-bulk --from-csv <FILE> --yes` | `<FILE>` = path to the seed CSV |
| `/product-management` workflow G, sprint report | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = sprint scope query rooted in `{{PROJECT_KEY}}` |

The issue types DEV handles are Story, Bug, Task and Epic. Test, Test Plan and Test Execution live in the sister QA repo.

---

## DEV quick start (slug substitutions on top of `acli/SKILL.md`)

The DEV flow uses the same command shapes as `acli/SKILL.md` §Quick Start, with slug-resolved arguments. Load that file for the canonical form instead of retyping a binary call from here.

| DEV step | Action (shape in `acli/SKILL.md`) | DEV-specific substitutions |
|---|---|---|
| Auth | `jira auth login` | `--site "$(bun run --silent jira:url --slug)"` (the host comes from `.agents/project.yaml`, not an env var), `--email "$ATLASSIAN_EMAIL"`, token piped from `$ATLASSIAN_API_TOKEN` (both from `.env`) |
| Verify auth | `jira auth status` | None. Run it before every `bun run jira:sync-*` and before any bulk mutation (D1). |
| Fetch the story you are about to implement (plan input) | not acli: `bun run jira:sync-issues get <KEY> --include-comments` | `<KEY>` = `{{PROJECT_KEY}}-NNN`. Read ACs and Scope from the synced `.md`. |
| Move into In Progress (Stage 1 start) | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_progress}}` |
| Sprint dashboard, what you own that is still open | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = `assignee = currentUser() AND project = {{PROJECT_KEY}} AND status in ('Ready For Dev','In Progress','In Review')` |
| File a bug mid-implementation | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key (`{{PROJECT_KEY}}-NNN`) |

Anything wrapped in `{{jira.<slug>}}` resolves against `.agents/jira-fields.json` (custom-field IDs) or `.agents/jira-workflows.json` (status and transition names) before the command runs. Literal `customfield_` IDs and literal status names are out (D7).

---

## Slug catalog and sync-script pipeline

| File | Owns | Regenerate with |
|---|---|---|
| `.agents/jira-fields.json` | Custom-field slug to numeric ID map | `bun run jira:sync-fields` |
| `.agents/jira-workflows.json` | Status and transition slugs per work type | `bun run jira:sync-workflows` |
| `.agents/jira-link-types.json` | Issue-link-type slug map | `bun run jira:sync-link-types` |
| `.agents/jira-required.yaml` | Which fields are required per work type | Hand-curated; stays aligned with `jira-fields.json` |

Slug syntax (`.agents/instructions/agent-project-variables.md` §7):

- `{{jira.<slug>}}` is a custom-field ID (`{{jira.acceptance_criteria}}` is the workspace-specific numeric ID).
- `{{jira.status.<work_type>.<slug>}}` is a status name (`{{jira.status.story.in_progress}}` is `"In Progress"`).
- `{{jira.transition.<work_type>.<slug>}}` is a transition name (`{{jira.transition.story.start_working}}` is `"Start working"`).
- `{{jira.work_type.<slug>}}` is a Jira issue-type name (`{{jira.work_type.story}}` is `"Story"`).

The sync scripts call `acli` underneath, so stale auth poisons their output silently (D1). A slug that fails to resolve at runtime stops the step: report the missing entry and re-run the matching sync script, because a literal fallback moves the wrong thing. A missing transition or status slug has its own protocol in `artifact-lifecycle.md` §4, which also maps which stage fires which slug.

---

## Anti-patterns for DEV

These add to the tool-level anti-patterns T1 to T5 in `acli/SKILL.md`. Both layers apply.

- **D1.** Before any `bun run jira:sync-*`, log in fresh with `jira auth login` (shapes in `acli/SKILL.md`). Stale or expired auth produces silent partial syncs that poison `.agents/jira-fields.json`, `jira-workflows.json` and `jira-link-types.json`, so every later skill resolves a slug to the wrong field. The failure surfaces hours later as "Jira rejected payload" and the cause is hours old.
- **D2.** Workflow skills (`sprint-development`, `product-management`, `project-foundation`, `project-bootstrap`, `unit-testing`, `testability-guide`) cite `[ISSUE_TRACKER_TOOL]` and load this file plus `acli/SKILL.md`. They do not call `acli` directly, because the methodology survives a tool rotation only if the how lives behind the tag.
- **D3.** Resolve the project key through `{{PROJECT_KEY}}` from `.agents/project.yaml`. A hardcoded key (`UPEX`, `MYM`, `SQ`) in a command, JQL or doc breaks portability across downstream consumers and re-installs.
- **D4.** Against a production Jira workspace from a developer workstation, ask for an explicit confirmation per operation. Transitions, deletions and bulk edits are irreversible: `--yes` is fine in CI, which runs against agreed scopes, and not ad hoc against prod. A supervised worker asks its conductor; a routine with nobody stops before the write and reports (`decision-protocol.md`).
- **D5.** In CI, capture the full per-item response (HTTP code, trace ID, JSON) of a batched transition or mutation. Quiet flags hide failures, and the trace ID is the only debug signal Atlassian Support accepts.
- **D6.** Pin a minimum `acli` version in CI and document it in `docs/`. Teammates do not all run the same one, and subcommand surfaces (`workitem` vs the legacy `issue`) and flag shapes have shifted between minor releases.
- **D7.** Resolve every custom field through the slug catalog (`{{jira.<slug>}}` against `.agents/jira-required.yaml` and `.agents/jira-fields.json`), never a literal `customfield_NNNNN` in a skill, script, prompt or AI output. IDs differ per workspace and slugs travel. A missing field means `bun run jira:sync-fields`.
- **D8.** Read custom fields (ACs, Gherkin, Scope, implementation plans, bug fields) through `bun run jira:sync-issues get <KEY> [--include-comments]` or `jql "<query>"`, then the synced `.md` under `.context/PBI/`. `acli` `view` returns `null` for them. `acli` view and search stay for trivial summary, status and key-list lookups.
- **D9.** Treat Jira-mirrored files in `.context/PBI/` as read-only: `story.md`, `epic.md`, `epic-tree.md`, `acceptance-*.md`, `scope.md`, `out-of-scope.md`, `implementation-plan.md`, `feature-implementation-plan.md` and the per-field files. The order is author the content, push it to the Jira field (or its `fallback:` comment), run the sync, read the materialized file. The sync overwrites every `[SYNC]` file on every run, because Jira is the source of truth. Only the `[LOCAL]` files of `agent-local-context-pbi.md` §9 (`context.md`, `progress.md`, `evidence/`) are hand-authored there. `product-management/references/jira-operations.md` already enforces this; it is repo-wide.
- **D10.** Read `product-management/references/jira-publishing-gotchas.md` before publishing ADF rich text to a Jira field. Its two edges (inline `code` together with `strong` or `em`, and the MCP variant of `[ISSUE_TRACKER_TOOL]` silently dropping ADF on batched custom-field updates) both show up as HTTP 400 only at publish time. Format a naturally mappable field per `acli/references/adf-authoring-style.md` (tables, panels, nested lists) when it adds something, and let the field's hard rule win (AC stays fenced Gherkin, `I17`).

---

## Composability: who loads this

These DEV skills load this file on demand, next to `acli/SKILL.md`, and declare both in their `## Dependencies` block.

| Skill | When this file is loaded |
|---|---|
| `sprint-development` | Stage 1 (Planning): fetch the Story, transition through `in_progress`, `in_review`, `ready_for_qa`. Stage 3: file a Bug under the parent Story. |
| `product-management` | Bulk-create Stories and Epics from CSV, sprint reporting by JQL, backlog grooming |
| `project-foundation`, `project-bootstrap` | Reverse-engineering: inventory existing issue types, statuses and custom fields; seed the `.agents/jira-*` catalogs |
| `unit-testing` | Comment unit-test status on the parent Story when applicable |
| `testability-guide` | Read Story ACs to assess testability before code |

---

## When the integration changes

Edit this file when:

- a new Jira custom field enters `.agents/jira-fields.json` and a DEV workflow reads or writes it;
- a new sync script lands under `scripts/sync-jira-*.ts`;
- a repo-wide anti-pattern surfaces from a real DEV session;
- the slug syntax in `agent-project-variables.md` §7 changes.

The boundary: a change about the `acli` binary goes in `acli/SKILL.md` and reaches DEV and QA alike; a change about how DEV uses `acli` goes here.
