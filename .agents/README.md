# `.agents/` — agent-consumed project configuration

Tool-agnostic source of truth for the data AI agents need to operate on this repository.

## Purpose

`.agents/` separates portable, per-project values from the implementation detail of any specific agent (`.claude/`, `.cursor/`, `.gemini/`, …). Whenever a prompt or doc references a variable like `{{PROJECT_NAME}}` or `{{jira.severity}}`, the resolver looks here first.

The directory has two roles:

1. **Per-project config** — values you fill in once when you adopt the boilerplate (`project.yaml`).
2. **Workspace-resolved metadata** — auto-generated catalog of your Jira workspace's custom fields (`jira-fields.json`) and workflows / statuses / transitions (`jira-workflows.json`), validated against the methodology's declarative manifest (`jira-required.yaml`).

## Files

| File                  | What it is                                                                                                                                                                       | Who edits it                             | How to regenerate                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `project.yaml`        | Human-edited project config: project name, repo paths, URLs, MCP server names, issue-tracker metadata, default env.                                                              | You (project owner)                      | Edit by hand.                                                                |
| `jira-fields.json`    | Auto-generated catalog of every custom field in your Jira workspace, keyed by canonical slug. Each entry has `id`, `type`, optional `name`, `options`, `system`, `provider`.     | Generated only — **do not edit by hand** | `bun run jira:sync-fields`                                                   |
| `jira-workflows.json` | Auto-generated catalog of work-type workflows, statuses, and transitions resolved against your Jira workspace. Companion to `jira-fields.json` for the work_types substrate.     | Generated only — **do not edit by hand** | `bun run jira:sync-workflows`                                                |
| `jira-link-types.json` | Auto-generated catalog of every issue link type in your Jira workspace (e.g. `blocks`, `relates`, `is caused by`), keyed by canonical slug. Each entry has `id`, `name`, `outward`, `inward`, `exists_in_workspace`. | Generated only — **do not edit by hand** | `bun run jira:sync-link-types`                                               |
| `jira-required.yaml`  | Declarative manifest of the custom fields the methodology requires (with expected types, option lists, and consumers). The contract between skills/commands and the user's Jira. | Methodology maintainers                  | Updated when a skill or command adds or drops a `{{jira.<slug>}}` reference. |
| `README.md`           | This file.                                                                                                                                                                       | Methodology maintainers                  | —                                                                            |

## Variable syntax conventions

Four syntaxes coexist across skills, commands, and docs. Each resolves from a different place:

| Syntax                         | Meaning                                                                                                                                                                                                                                                                                   | Resolves from                                                                                                                                                                            | Validated by                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{{VAR_NAME}}`                 | **Project variable** — static, per-repo value configured once. Two flavours: **flat** (top-level section, e.g. `{{PROJECT_KEY}}` → `project.project_key`) and **env-scoped** (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_PROJECT_REF}}`) which resolve to the active environment's value. | `.agents/project.yaml`. Flat keys are looked up lexically (`{{PROJECT_NAME}}` → `project.project_name`). Env-scoped keys resolve via the active env (see below).                         | `bun run vars:check` (key must exist either at top level or under at least one environment).                                                     |
| `{{environments.<env>.<var>}}` | **Explicit env-scoped reference** — bypasses active-env resolution and always points at a specific environment. Used in multi-env documents (e.g. a comparison table that shows local AND staging URLs side-by-side).                                                                     | `.agents/project.yaml` → `environments.<env>.<var>` directly.                                                                                                                            | `bun run vars:check` (env must be declared under `environments:` and var must exist under it).                                                   |
| `<<VAR_NAME>>`                 | **Session variable** — computed at runtime by the calling prompt (e.g. `<<ISSUE_KEY>>` extracted from a git branch name) or used as a sentinel marker (`<<PLACEHOLDER>>`, `<<REDACTED>>`). Never persisted.                                                                               | The prompt's runtime context.                                                                                                                                                            | Linter only counts them — never declared.                                                                                                        |
| `{{jira.<slug>}}`              | **Jira custom field reference** — portable pointer to a Jira custom field.                                                                                                                                                                                                                | `.agents/jira-required.yaml` (canonical declaration of expected fields) AND `.agents/jira-fields.json` (workspace-resolved IDs). Skills and commands never hardcode `customfield_XXXXX`. | `bun run vars:check` (slug must be declared in the manifest) AND `bun run jira:check` (slug must resolve to a real field in `jira-fields.json`). |

The `{{…}}` vs `<<…>>` distinction is intentional: it removes the ambiguity where both project data and ephemeral session data might share the same `{{VAR}}` syntax.

### Active environment

`project.yaml` has a top-level `environments:` map (defaults: `local` + `staging`; you can add `production`, `qa`, `dev`, `uat`, etc.). Each environment declares the same three leaves: `web_url`, `api_url`, `db_project_ref`. Skills and commands don't hardcode "staging" or "local" anywhere — they reference the bare form (`{{WEB_URL}}` etc.) and the AI resolves it against the **active environment** for the current session:

1. If the user explicitly chose an env this session ("run regression against production"), use that.
2. Otherwise fall back to `testing.default_env` from `project.yaml`.

When a document genuinely needs to compare environments side-by-side (e.g. an environment-table that demonstrates URL-shape differences), use the explicit form `{{environments.local.web_url}}` / `{{environments.staging.web_url}}` instead. Both forms are validated by `bun run vars:check`.

## Workflows

### 5.1 New user setup

When you clone this boilerplate into a new project:

1. Copy `.env.example` to `.env` and fill in:
   - `LOCAL_USER_EMAIL` / `STAGING_USER_EMAIL` and the matching passwords (test users).
   - `ATLASSIAN_URL` / `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` (get a token at <https://id.atlassian.com/manage-profile/security/api-tokens>).
2. Edit `.agents/project.yaml` by hand. Replace every `null` with the real value (the inline `# TODO:` comment shows the expected format). Make sure `testing.default_env` matches one of the keys under `environments:`.
3. Run `bun run jira:sync-fields` to discover your Jira workspace's custom fields. Writes `.agents/jira-fields.json` (~100-150 fields typical). Resolves slug collisions deterministically — see `--allow-collisions` if you hit one.
4. Run `bun run jira:check` to validate your Jira against the methodology's required-fields manifest. Address any output:
   - **❌ MISSING** — create the field in Jira admin (Settings → Issues → Custom fields) with the suggested name, type, and options. Re-run `bun run jira:sync-fields --force` then `bun run jira:check`.
   - **⚠️ MISMATCHED** — rename, retype, or extend the field in Jira so it matches the manifest, OR (if the methodology can adapt) update `jira-required.yaml`.
   - **💡 INFO** — informational only; safe to ignore unless you want the optional or unmapped feature.
   - Iterate until all required fields are ✅ OK.
5. Run `bun run vars:check` — should report 0 errors. Confirms every `{{VAR}}` and `{{jira.*}}` reference in skills/commands resolves against your config.

You're now ready to invoke any skill or command without setup friction.

### 5.2 Adding or updating a skill or command

When you add or edit a skill or command that references project values or Jira fields:

- **Project values** (paths, URLs, project keys, etc.) — use `{{VAR_NAME}}`. Add the variable to `.agents/project.yaml` with `null` plus a `# TODO:` comment so a new user knows what to fill in.

- **Session values** (computed at runtime) — use `<<VAR_NAME>>`. No declaration needed; it's a documentation marker for the consumer.

- **Jira custom fields** — use `{{jira.<slug>}}`. The slug **must** be declared in `.agents/jira-required.yaml` under `required:` or `optional:`. Workflow:
  1. Identify the slug your skill or command needs. It must match how `bun run jira:sync-fields` slugifies the Jira field name (lowercase, underscores, no emojis/accents).
  2. Add an entry to `jira-required.yaml`:
     - `name:` — human-readable name expected in the Jira admin UI.
     - `type:` — `string` / `option` / `number` / `date` / `array` / `user` / etc.
     - `options:` — only if `type: option`; list of option slugs the methodology depends on.
     - `description:` — 1-line explanation.
     - `used_by:` — list of skills/commands referencing this slug.
  3. Reference `{{jira.<slug>}}` in your skill or command markdown.
  4. Run `bun run vars:check` — must pass (proves the slug is declared).
  5. Run `bun run jira:check` against your own Jira. If your Jira is missing the field, create it in Jira admin and re-run `bun run jira:sync-fields --force`.

When deleting a skill/command or removing a `{{jira.<slug>}}` reference:

- If no other skill or command uses the slug, you may remove the entry from `jira-required.yaml`. Otherwise leave it — the slug is shared.
- The linter may then report `DECLARED_BUT_UNUSED` warnings; safe to ignore for transitional periods.

### 5.3 Adding a new required Jira custom field

When the methodology evolves and needs a brand-new custom field that doesn't exist anywhere yet:

1. Decide the canonical slug (lowercase, underscores, descriptive).
2. Add an entry to `jira-required.yaml` under `required:` (or `unmapped:` if it can't yet be mapped — see the unmapped pattern below).
3. Update relevant skills and commands to reference `{{jira.<slug>}}`.
4. Update this README's troubleshooting section if behavior is non-trivial.
5. Communicate to all boilerplate users (release notes / changelog) that they must create the field in their Jira and rerun `bun run jira:sync-fields --force`.

**The "unmapped" pattern.** When a field is required semantically but no Jira field exists yet, put the slug under `unmapped:` with a `description:` and `used_by:`. Skills and commands then reference it as a literal marker (e.g. `customfield_<slug>`) with HTML-comment TODOs pointing at the manifest. Once a real field is created, move the entry from `unmapped:` to `required:` (with full metadata: `name`, `type`, `options`, …) and replace the literal markers with `{{jira.<slug>}}` syntax.

## Commands reference

| Command                    | Purpose                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run jira:sync-fields` | Discover Jira custom fields → write `jira-fields.json`. Flags: `--force` (overwrite), `--allow-collisions` (suffix slug duplicates), `--dry-run`, `--verbose`, `--json`.                                     |
| `bun run jira:check`       | Compare `jira-required.yaml` vs `jira-fields.json` → setup report. Flags: `--json` (machine-readable), `--verbose` (include OK rows), `--help`. Exits 1 if any required field is missing or type-mismatched. |
| `bun run vars:check`       | Validate every `{{VAR}}` and `{{jira.*}}` reference across `.claude/skills/`, `.claude/commands/`, `.context/`, `CLAUDE.md`/`CLAUDE.md`. Exits 1 if any are undeclared.                                      |

## Troubleshooting

- **`vars:check` reports `UNDECLARED: {{jira.foo}}`** — the slug is referenced in a skill or command but not declared in `jira-required.yaml`. Add the entry under `required:` or `optional:` (see workflow §5.2).
- **`jira:check` reports `❌ MISSING: bar`** — the manifest declares `bar` as required, but your Jira has no field that slugifies to `bar`. Create the field in Jira admin with the suggested name/type/options, then re-run `bun run jira:sync-fields --force` and `bun run jira:check`.
- **`jira:check` reports `⚠️ MISMATCHED`** — a field exists but its type or option list disagrees with the manifest. Either fix it in Jira (rename, change type, add options) or update `jira-required.yaml` if the methodology can accept the variant.
- **`jira:sync-fields` aborts with exit 2 (slug collisions)** — two Jira custom fields slugify to the same key. Rename the duplicate in Jira admin, or pass `--allow-collisions` to suffix them with `_2`, `_3`, …. Plugin-managed (system) collisions are auto-suffixed silently — see the script's `--verbose` flag.
- **Which variable syntax should I use?** — see §"Variable syntax conventions". Short version: bare `{{VAR}}` is project-scoped (declared in `project.yaml`; env-scoped vars resolve to the active env); `{{environments.<env>.<var>}}` pins to a specific env (multi-env docs only); `<<VAR>>` is session-scoped (computed at runtime); `{{jira.<slug>}}` is Jira-scoped (declared in `jira-required.yaml`, resolved via `jira-fields.json`).

### `external_consumers` — silencing structurally-invisible variables

Some declared variables are consumed OUTSIDE the `{{TEMPLATE}}` system — for example:

- `default_env` is read implicitly by the AI variable resolver (it sets the active environment) AND by `scripts/agents-setup.ts` via `process.env.DEFAULT_ENV` in `--non-interactive` mode.
- `design_md_path` is read by `yq` inside bash code fences in skill reference files (the linter does not parse bash, so it cannot see the read).

These produce false-positive `DECLARED_BUT_UNUSED` warnings. To silence them, add the variable name under the top-level `external_consumers:` list in `.agents/project.yaml`. Each entry MUST include an inline `# ...` comment explaining where the variable is consumed:

```yaml
external_consumers:
  - default_env # consumed by the AI resolver + scripts/agents-setup.ts (process.env.DEFAULT_ENV)
  - design_md_path # read by yq in .claude/skills/design-system/references/getdesign-matcher.md
```

If you forget the comment, `vars:check` fails with `EXTERNAL_CONSUMER_UNDOCUMENTED` to prevent the allowlist from rotting silently.

### For AI agents

When invoked in this repository, treat this README as a contract:

- To resolve `{{VAR_NAME}}`, read `.agents/project.yaml`. For env-scoped vars (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_PROJECT_REF}}`), use the active environment for the session — the user's explicit choice if they made one, otherwise `testing.default_env`.
- To resolve `{{environments.<env>.<var>}}`, read the named environment directly from `.agents/project.yaml`, regardless of active env.
- To resolve `<<VAR_NAME>>`, the source is the calling prompt's runtime context.
- To resolve `{{jira.<slug>}}`, read `.agents/jira-required.yaml` (canonical declaration) AND `.agents/jira-fields.json` (workspace-resolved IDs).
- To validate any change touching skills or commands, run `bun run vars:check` and treat ERROR entries as blocking.
- When asked to add a new skill or command or modify an existing one, follow the workflow in §5.2 — add manifest entries before referencing slugs.
