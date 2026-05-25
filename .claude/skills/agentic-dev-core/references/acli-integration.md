# `acli` repo integration — agentic-dev-boilerplate

> **Purpose**: Plug the tool-agnostic `acli` skill (`.claude/skills/acli/SKILL.md`) into the DEV boilerplate's workflow doctrine, slug catalog, sync-script pipeline, and anti-patterns. The `acli/SKILL.md` itself is byte-identical between the DEV and QA boilerplates; everything DEV-specific lives here so the tool surface stays single-source-of-truth.
> **Use when**: Any DEV workflow skill (`sprint-development`, `product-management`, `project-foundation`, `project-bootstrap`, `unit-testing`, `testability-guide`) calls `[ISSUE_TRACKER_TOOL]` and resolves it to `/acli`. Load this BEFORE invoking the tool — it answers *which slug, which status, which custom field, which sync script* before `acli/SKILL.md` answers *how the binary works*.
> **Companion references**: `acli/SKILL.md` (tool surface), `acli/references/*.md` (per-command deep refs), `.agents/jira-fields.json` + `.agents/jira-required.yaml` + `.agents/jira-workflows.json` + `.agents/jira-link-types.json` (slug catalogs), `scripts/jira-sync-*.ts` (catalog regeneration), `sprint-development/SKILL.md` (the primary consumer).

---

## Role inside the DEV workflow

`acli` resolves a single tool tag in this repo: `[ISSUE_TRACKER_TOOL]`. The Atlassian MCP fallback is OPT-IN and documented in `docs/mcp/`; default resolution is unconditional `/acli`.

Workflow skills MUST NOT invoke `acli` directly. They invoke the pseudocode tag, the AI resolves the tag, then loads the matching skill (this file plus `acli/SKILL.md`). The indirection is what lets the methodology survive a future tool swap.

### Concrete `/sprint-development` integration

This skill complements the `/sprint-development` mega-orchestrator. It does NOT drive the sprint loop — it is the underlying CLI surface that `/sprint-development` and other DEV skills call when they need to talk to Jira. Command shapes live in `acli/SKILL.md`; the table below maps each DEV moment to the action and slug substitutions.

| DEV moment | Action (see `acli/SKILL.md`) | DEV-specific substitutions |
|---|---|---|
| `/sprint-development` Stage 1 (Planning) — fetch ticket | `jira workitem view <KEY> --json` | `<KEY>` = `{{PROJECT_KEY}}-NNN`; jq picks ACs, Gherkin, Scope, Mockup, Workflow custom fields |
| `/sprint-development` Stage 1 — transition story to In Progress | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_progress}}` |
| `/sprint-development` Stage 3 (Code Review) — transition to In Review | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_review}}` |
| `/sprint-development` Stage 4 — handoff to QA | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.ready_for_qa}}` |
| `/sprint-development` Stage 3 — defect mid-implementation | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key |
| Linking merged PR back to the ticket | `jira workitem link create --out <KEY> --in <PR>` | `<KEY>` = Story key; `<PR>` = remote-link issue or PR identifier |
| `/product-management` — bulk-create stories from CSV | `jira workitem create-bulk --from-csv <FILE> --yes` | `<FILE>` = path to seed CSV |
| `/product-management` (workflow G) — sprint report | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = sprint scope query rooted in `{{PROJECT_KEY}}` |

Issue types DEV cares about: **Story**, **Bug**, **Task**, **Epic**. Test-management issue types (Test, Test Plan, Test Execution) live in the sister QA repo and are not handled here.

---

## DEV Quick Start (slug substitutions on top of `acli/SKILL.md`)

The command shapes live in `acli/SKILL.md` §Quick Start. The DEV flow uses the same shapes with slug-resolved arguments. Each row below maps a DEV step to the action and the substitutions; never re-type the literal binary call from here — load `acli/SKILL.md` for the canonical form.

| DEV step | Action (see `acli/SKILL.md`) | DEV-specific substitutions |
|---|---|---|
| Auth | `jira auth login` | `--site "$ATLASSIAN_SITE"`, `--email "$ATLASSIAN_EMAIL"`, token piped from `$ATLASSIAN_API_TOKEN` (all from `.env`) |
| Verify auth | `jira auth status` | None (same as generic). MUST run before every `bun run jira:sync-*` and before any bulk mutation — see D1 + D6 below. |
| Fetch story you are about to implement (impl-plan input) | `jira workitem view <KEY> --json` | `<KEY>` = `{{PROJECT_KEY}}-NNN`; jq filter picks `.fields.{{jira.acceptance_criteria}}` + `.fields.{{jira.scope}}` |
| Move into In Progress (Stage 1 start) | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_progress}}` |
| Sprint dashboard — what you own still open | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = `assignee = currentUser() AND project = {{PROJECT_KEY}} AND status in ('Ready For Dev','In Progress','In Review')` |
| File bug mid-implementation | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key (`{{PROJECT_KEY}}-NNN`) |

Slug resolution rule: anything wrapped in `{{jira.<slug>}}` MUST be resolved against `.agents/jira-fields.json` (custom-field IDs) or `.agents/jira-workflows.json` (status / transition names) before the command runs. Never substitute literal `customfield_` IDs or literal status names — see anti-patterns below.

---

## Slug catalog + sync-script pipeline

| File | Owns | Regenerate with |
|---|---|---|
| `.agents/jira-fields.json` | Custom-field slug → numeric ID map | `bun run jira:sync-fields` |
| `.agents/jira-workflows.json` | Status + transition slugs per work type | `bun run jira:sync-workflows` |
| `.agents/jira-link-types.json` | Issue-link-type slug map | `bun run jira:sync-link-types` |
| `.agents/jira-required.yaml` | Which fields are required per work type | Hand-curated; aligns with `jira-fields.json` |

Slug syntax (per `CLAUDE.md` §7):

- `{{jira.<slug>}}` — custom field ID (e.g. `{{jira.acceptance_criteria}}` → numeric workspace-specific ID)
- `{{jira.status.<work_type>.<slug>}}` — status name (`{{jira.status.story.in_progress}}` → `"In Progress"`)
- `{{jira.transition.<work_type>.<slug>}}` — transition name (`{{jira.transition.story.start_progress}}` → `"Start progress"`)
- `{{jira.work_type.<slug>}}` — Jira issue-type name (`{{jira.work_type.story}}` → `"Story"`)

The sync scripts call `acli` under the hood. Stale auth poisons the output silently — see anti-pattern D1 below. If a slug fails to resolve at runtime, STOP — do not fall back to a literal. Report the missing entry and re-run the matching sync script.

---

## Anti-patterns — DEV-specific (NEVER do these)

These are repo-flavored companions to the tool-level anti-patterns T1-T4 in `acli/SKILL.md`. Both layers apply.

- **D1. NEVER run `bun run jira:sync-*` without a fresh `acli jira auth login`** — stale or expired auth produces silent partial-data syncs that poison `.agents/jira-fields.json` / `jira-workflows.json` / `jira-link-types.json` downstream. Every workflow skill that resolves a slug then resolves to the wrong field. The failure surfaces hours later as "Jira rejected payload" — the root cause is hours old.
- **D2. NEVER invoke `acli` directly from workflow skills** (`sprint-development`, `product-management`, `project-foundation`, `project-bootstrap`, `unit-testing`, `testability-guide`). Workflow skills cite `[ISSUE_TRACKER_TOOL]` pseudo-code and load THIS file + `acli/SKILL.md` instead — methodology survives tool rotation only if the HOW lives behind the tag.
- **D3. NEVER hardcode project keys** (`UPEX`, `MYM`, `SQ`, etc.) in commands, JQL, or docs. Resolve via `{{PROJECT_KEY}}` from `.agents/project.yaml`. Hardcoding breaks portability across downstream consumers and re-installs of the boilerplate.
- **D4. NEVER use `acli` against a production Jira workspace from a developer workstation without an explicit per-operation confirmation step.** Transitions, deletions, and bulk edits are irreversible — `--yes` in CI is fine; `--yes` ad-hoc against prod is not. CI pipelines run against agreed-on scopes; local sessions do not.
- **D5. NEVER batch transitions or mutations with quiet flags in CI without capturing the full per-item response** (HTTP code, trace ID, JSON). Failures hide otherwise, and trace IDs are the only debug signal Atlassian Support accepts.
- **D6. NEVER assume teammates run the same `acli` version.** Pin a minimum version in CI and document it in `docs/`. Subcommand surfaces (e.g. `workitem` vs legacy `issue`) and flag shapes have shifted across minor releases.
- **D7. NEVER hardcode Jira `customfield_NNNNN` IDs** in skills, scripts, prompts, or AI output. Resolve via the slug catalog (`{{jira.<slug>}}` against `.agents/jira-required.yaml` + `.agents/jira-fields.json`). IDs differ per workspace; slugs travel. Regenerate the catalog with `bun run jira:sync-fields` if a field is missing.

---

## Composability — who loads this

The following DEV workflow skills load `agentic-dev-core/references/acli-integration.md` on demand (alongside `acli/SKILL.md`):

| Skill | When this file is loaded |
|---|---|
| `sprint-development` | Stage 1 (Planning): fetch Story, transition through `in_progress` / `in_review` / `ready_for_qa`. Stage 3: file Bug under parent Story. |
| `product-management` | Bulk-create Stories/Epics from CSV; sprint reporting via JQL searches; backlog grooming |
| `project-foundation` / `project-bootstrap` | Reverse-engineering: inventory existing issue types, statuses, custom fields; seed `.agents/jira-*` catalogs |
| `unit-testing` | Comment unit-test status on the parent Story when applicable |
| `testability-guide` | Read Story ACs to assess testability before code |

Each of these skills declares `acli` + this integration file in their `## Dependencies` block.

---

## When the integration changes

This file evolves whenever:

- New Jira custom field is added to `.agents/jira-fields.json` and a DEV workflow needs to read or write it.
- A new sync script lands under `scripts/jira-sync-*.ts`.
- A new anti-pattern surfaces from a real DEV session and applies repo-wide.
- The slug syntax in `CLAUDE.md` §7 evolves.

Do NOT push tool-binary changes here — those belong in `acli/SKILL.md` (and therefore propagate to both DEV and QA boilerplates identically). Boundary rule: if the change is about `acli` the binary, it goes in `acli/SKILL.md`. If it's about how DEV uses `acli`, it goes here.
