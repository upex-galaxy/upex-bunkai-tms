---
id: tool-resolution
title: "Tool resolution and CLI auto-load"
load_when: "a skill uses a [TAG_TOOL], an MCP capability tag is resolved, or Bash is about to call bun, gh, supabase, vercel, resend, acli, playwright-cli, jq or orca"
triggers: ["\\[[A-Z_]+_TOOL\\]", "\\bgh\\b", "\\bsupabase\\b", "\\bvercel\\b", "\\bresend\\b", "\\bacli\\b", "playwright", "\\bjq\\b", "\\borca\\b", "migration"]
paths: ["supabase/"]
---

# Tool resolution and CLI auto-load

> Section `tool-resolution` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 6. Tool resolution ([TAG_TOOL] pseudocode)

Skills write `[TAG_TOOL]` pseudocode and this table resolves it. CLI tools come first because they cost fewer tokens; an MCP is the fallback.

| Tag | Domain | Primary | Fallback |
|---|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | Jira Cloud (story, bug, epic) | `/acli` | MCP Atlassian (opt-in: see docs/mcp/) |
| `[KNOWLEDGE_BASE_TOOL]` | Confluence (knowledge base, docs) | `/acli` (Confluence subcommands) | MCP Atlassian (opt-in: see docs/mcp/) |
| `[AUTOMATION_TOOL]` | Browser automation | `/playwright-cli` | none: the only browser path |
| `[DB_TOOL]` | Database | capability `db`, resolved from `stack.database` (`agent-skills-and-mcps.md` §5; Supabase MCP: `execute_sql`, `list_tables`) | the database's own CLI (Supabase CLI, `psql`), only when the user chooses it after the stop |
| `[API_TOOL]` | API exploration | curl plus OpenAPI types (`bun run api:sync` writes `api/` at the repo root, outside `stack.app_root` on a monorepo; an app with its own client types keeps them) | Postman, by hand |
| `[DOCS_TOOL]` | Library, framework, SDK, API and CLI official docs | capability `library-docs`: any tool ending in `resolve-library-id` / `query-docs` | none: stop (see below) |
| `[WEB_SEARCH_TOOL]` | General web search, community fixes, troubleshooting, non-doc research | capability `web-search`: any tool ending in `web_search_exa` / `web_fetch_exa` (preferred) or `tavily_search` / `tavily_extract` / `tavily_research` | none: stop (see below) |
| `[AUTOMATION_FLOWS_TOOL]` | n8n workflow automation | capability `automation-flows` (n8n MCP) | none: stop (see below) |
| `[ORCHESTRATION_TOOL]` | Multi-session orchestration: launch, supervise, message and close persistent workers, worktrees, runs, automations | `/agent-orchestration` (user level; owns when and what over the `orca` binary; gate is the binary plus a reachable runtime) | one-shot subagents (`AGENTS.md` §3) plus the workflow skill's `launch.txt` lines pasted by hand; never named when the gate fails |

Load the owning skill before invoking its tool. The skill holds when and what; how (syntax, flags, auth, pagination, errors) lives in the skill's `references/`.

The MCP capability tags (`[DOCS_TOOL]`, `[WEB_SEARCH_TOOL]`, `[DB_TOOL]`, `[AUTOMATION_FLOWS_TOOL]`) need no skill load, because MCPs document themselves through their tool descriptions. Resolve them by tool-name suffix under any prefix: `mcp__context7__query-docs`, `mcp__claude_ai_context7__query-docs` and a user-named server's `…__query-docs` are the same capability, so a different prefix is never a reason to conclude "not available". Pi writes every non-alphanumeric character of a tool name as `_`, so `query-docs` arrives as `…__query_docs` and `resolve-library-id` as `…__resolve_library_id`, found through its `tool_search`; a hyphen and an underscore in the same place are the same suffix.

When no tool provides the capability, stop and tell the user which capability, which server and how to enable it (`agentic-dev-core/references/mcp-capabilities.md` §4 and §5). Do not fall back silently. Built-in `WebSearch` and `WebFetch` are allowed only when the user chooses them after that stop.

Pseudocode values come in four types: `Literal` (fixed domain), `{per convention}` (consult the skill ref), `{{PROJECT_VAR}}` (from `.agents/project.yaml`) and `{from analysis}` (derived at runtime).

---

## 6.5 CLI to skill auto-load mapping

A Bash call that names one of these binaries loads the matching skill first, through the Skill tool. The skill holds when and what, and the binary does the how; skipping the load means guessing at syntax, flags, auth and error semantics. This is a hard gate, so check that the skill is loaded for this session before any such call, and load it first if it is not.

| CLI | Skills to auto-load | Why |
|---|---|---|
| `bun` | none: Bun's own docs come from `[DOCS_TOOL]` (Context7) | Runtime and package manager. No skill wraps it; scripts are read from `package.json` (Critical Rule #10). |
| `gh` | `/git-flow-master` | GitHub CLI and git workflow. The skill covers repo ops, PRs and `gh api` patterns. |
| `supabase` | `/supabase`, `/supabase-postgres-best-practices`, `/project-bootstrap` | DB CLI, Postgres patterns and the DB scaffold flow. |
| `vercel` | `/vercel-cli`, `/deploy-to-vercel`, `/sprint-development` | Vercel CLI cookbook (verification, env, debug, rollback), the community deploy workflow and the sprint deploy stages. |
| `resend` | `/resend-cli` | Transactional email CLI: send, templates, domains. |
| `acli` | `/acli` | Atlassian CLI for Jira and Confluence workflows. Owns the slug syntax and the custom-field IDs. |
| `playwright-cli` | `/playwright-cli`, `/sprint-development` | Browser automation, used by the sprint-dev E2E checks and by standalone QA capture. |
| `jq` | `/acli` | JSON processor the acli skill needs to parse `acli ... --json` output. |
| `orca` | `/agent-orchestration` | Orchestration runtime CLI. The user-level skill holds when and what; the vendor guides in `orchestration.orchestrator_skills` load beside it (a worker loads only `orchestration`), and the deep topics stay served by the binary and are never copied into the repo. This repo's half: `agentic-dev-core/references/fleet-project-profile.md`. Not installed: run `bun setup`. |

The MCP side follows the same rule. A database MCP mutation (capability `db`: a schema, RLS, function or migration change through `apply_migration` or `execute_sql`, on Supabase or the same Postgres family) loads `/supabase` and `/supabase-postgres-best-practices` first, exactly like the `supabase` binary row. The work goes through the MCP, so the binary row alone never fires. How the change is made (history read first, DDL only through `apply_migration`, verified at the destination, an ADR when significant) is in `agentic-dev-core/references/db-change-doctrine.md`. Read-only checks (`list_tables`, a `SELECT`) do not need it. When the skill is not installed, say so once, point at the install path and continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
