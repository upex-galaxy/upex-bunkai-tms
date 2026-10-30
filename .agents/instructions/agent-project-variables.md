---
id: project-variables
title: "Project variables"
load_when: "a skill reads a {{VAR}} or <<VAR>>, an environment URL or the active env is needed, .agents/project.yaml is read or edited, or the Atlassian host is resolved"
triggers: ["\\{\\{", "<<[A-Z_]+>>", "project\\.yaml", "\\benvironments?\\b", "\\bentorno", "\\burls?\\b", "\\bdeploy", "despleg", "default_env", "\\b(?:staging|production|prod|producci[oó]n)\\s+(?:url|env|environment|entorno|db|database|domain|dominio)", "atlassian", "jira url", "vars:check"]
paths: [".agents/project.yaml", ".agents/README.md", ".env.example"]
---

# Project variables

> Section `project-variables` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 7. PROJECT VARIABLES: POINTER

> ALL variable syntax + Jira field references documented in **`.agents/README.md`**. READ ONCE per session, cache values.

Project values live in **`.agents/project.yaml`**: load once per session. NEVER hardcode Project Identity, env URLs, Jira URL, project key, MCP names. ALWAYS read from `.agents/project.yaml`. <!-- binds-in-section: every read of a project value routes here (L0 router row) -->

**Variable syntaxes** (full ref → `.agents/README.md`):

- `{{VAR_NAME}}` → static project var (flat or env-scoped via `environments[active_env].<var>`)
- `<<VAR_NAME>>` → session var computed at runtime (e.g. `<<ISSUE_KEY>>` from git branch)
- `{{jira.*}}` → Jira custom fields + workflow refs (see `.agents/jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`)

**Active env**: `active_env` defaults to `testing.default_env` in `.agents/project.yaml`. User says "test against production" → switch `active_env` to `production` for that session, ignore `default_env` until session ends.

**Validation**: `bun run vars:check` checks every `{{VAR}}` resolves; `bun run jira:check` validates manifest vs catalog.

**INSTANCE-IDENTITY ANCHOR (binding; compact rule of `jira-administration`)**: the Atlassian host is `.agents/project.yaml` → `issue_tracker.atlassian_url` and **NOWHERE ELSE locally**. `ATLASSIAN_URL` is NOT a `.env` variable: it is absent from `.env` and `.env.example` on purpose, because a second copy is what goes stale. Canonical resolver: `cli/lib/atlassian-instance.ts`, never read `process.env.ATLASSIAN_URL` directly in a new script. From a shell, call the accessor: `bun run --silent jira:url` (base URL) / `--slug` (bare host for `acli --site`; NEVER hand-strip `https://`). The resolver still reads the env var LAST as a transitional fallback for a repo whose yaml is unset; on disagreement the yaml wins AND a warning names both values, because a hit there means a stale copy is loose in the environment. **Deliberate inversion vs. `project_key`**, where the env var wins: a project key is a legitimate per-run override, the host is project identity that changes on site migrations, the exact value that goes stale. Credentials (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`) stay env-only and are NEVER mirrored into the versioned yaml; the host is a public hostname, not a secret, so the reverse split is safe. `scripts/agents-setup.ts` refuses to seed this one field from the environment (`envVar: null`) so an unattended run can never overwrite the versioned value. The NAME survives only as Vercel runtime config for a serverless Jira integration, pushed there FROM the yaml by `bun setup --variables` (manifest `valueSource: 'atlassian-instance'`), so yaml and deploy scope cannot drift. Class-wide guard: `bun run vars:env:check` fails on ANY `.env`-sourced manifest var whose process value differs from `.env`, and warns when a yaml-sourced var still has a dead line in `.env`; it is warn-only in `.husky/pre-push` so a machine-local condition never blocks an unrelated push. Applies the test: **does a stale value here corrupt data in silence, or fail loudly?** Silent corruption → one versioned source, no local duplicate, is not optional.
