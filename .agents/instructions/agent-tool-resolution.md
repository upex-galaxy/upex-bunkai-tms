---
id: tool-resolution
title: "Tool resolution and CLI auto-load"
load_when: "a skill uses a [TAG_TOOL], an MCP capability tag is resolved, or Bash is about to call bun, gh, supabase, vercel, resend, acli, playwright-cli, jq or orca"
triggers: ["\\[[A-Z_]+_TOOL\\]", "\\bgh\\b", "\\bsupabase\\b", "\\bvercel\\b", "\\bresend\\b", "\\bacli\\b", "playwright", "\\bjq\\b", "\\borca\\b", "migration", "migraci[oó]n"]
paths: ["supabase/"]
---

# Tool resolution and CLI auto-load

> Section `tool-resolution` of the project instructions (progressive disclosure, L1). The router in `AGENTS.md` (L0) names when to read it. Edit this file, never paste its prose back into `AGENTS.md`.

## 6. TOOL RESOLUTION ([TAG_TOOL] pseudocode)

> Skills use `[TAG_TOOL]` pseudocode. Resolve via this table. **PRIORITY**: CLI tools first (fewer tokens). MCP = fallback only.

| Tag                     | Domain                            | Primary                                   | Fallback                               |
| ----------------------- | --------------------------------- | ----------------------------------------- | -------------------------------------- |
| `[ISSUE_TRACKER_TOOL]`  | Jira Cloud (story/bug/epic)       | `/acli`                                   | MCP Atlassian (opt-in: see docs/mcp/) |
| `[KNOWLEDGE_BASE_TOOL]` | Confluence (knowledge base/docs)  | `/acli` (Confluence subcommands)          | MCP Atlassian (opt-in: see docs/mcp/) |
| `[AUTOMATION_TOOL]`     | Browser automation                | `/playwright-cli`                         | none: the only browser path            |
| `[DB_TOOL]`             | Database                          | capability `db`, resolved from `stack.database` (`agent-skills-and-mcps.md` §5; Supabase MCP: `execute_sql`, `list_tables`) | the database's own CLI (Supabase CLI, `psql`), only when the user chooses it after the STOP |
| `[API_TOOL]`            | API exploration                   | curl + OpenAPI types (`bun run api:sync`, writes `api/` at the repo root, outside `stack.app_root` on a monorepo; an app with its own client types keeps them) | Postman manual                         |
| `[DOCS_TOOL]`           | Library / framework / SDK / API / CLI official docs | capability `library-docs`: any tool ending in `resolve-library-id` / `query-docs` | none: STOP (see below) |
| `[WEB_SEARCH_TOOL]`     | General web search, community fixes, troubleshooting, non-doc research | capability `web-search`: any tool ending in `web_search_exa` / `web_fetch_exa` (preferred) or `tavily_search` / `tavily_extract` / `tavily_research` | none: STOP (see below) |
| `[AUTOMATION_FLOWS_TOOL]` | n8n workflow automation          | capability `automation-flows` (n8n MCP)   | none: STOP (see below)                 |
| `[ORCHESTRATION_TOOL]`  | Multi-session orchestration: launch / supervise / message / close persistent workers, worktrees, runs, automations | `/orca-orchestration` (owns the `orca` binary grammar; gate = binary + reachable runtime) | one-shot subagents (`AGENTS.md` §3) + the workflow skill's `launch.txt` lines pasted by hand; never named when the gate fails |

**MANDATORY**: LOAD owning skill BEFORE invoking its tool. Skills hold WHEN/WHAT only. HOW (syntax, flags, auth, pagination, errors) lives inside owning skill's `references/`.

**MCP capability tags** (`[DOCS_TOOL]`, `[WEB_SEARCH_TOOL]`, `[DB_TOOL]`, `[AUTOMATION_FLOWS_TOOL]`): no skill load required: MCPs self-document via tool descriptions. **Resolve by tool-name SUFFIX, any prefix**: `mcp__context7__query-docs`, `mcp__claude_ai_context7__query-docs` and a user-named server's `…__query-docs` are the same capability; never conclude "not available" from a prefix. **No silent fallback**: when no tool provides the capability, STOP and tell the user which capability, which server, how to enable it (`agentic-dev-core/references/mcp-capabilities.md` §4-§5). Built-in `WebSearch` / `WebFetch` are used ONLY when the user explicitly chooses them after that STOP.

**Pseudocode value types**: `Literal` (fixed domain) · `{per convention}` (consult skill ref) · `{{PROJECT_VAR}}` (from `.agents/project.yaml`) · `{from analysis}` (runtime-derived).

---

## 6.5 CLI → SKILL AUTO-LOAD MAPPING

> Whenever Bash invokes one of these binaries, LOAD matching skill via Skill tool BEFORE running command. Skill holds WHEN/WHAT; binary executes HOW. Skip load step = flying blind on syntax, flags, auth, error semantics.

| CLI              | Skills to auto-load                                                    | Rationale                                                                       |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `bun`            | none: Bun's own docs come from `[DOCS_TOOL]` (Context7)            | Runtime + package manager. No skill wraps it; scripts are read from `package.json` (Critical Rule #10). |
| `gh`             | `/git-flow-master`                                                     | GitHub CLI + git workflow. Skill covers repo ops, PRs, `gh api` patterns.       |
| `supabase`       | `/supabase`, `/supabase-postgres-best-practices`, `/project-bootstrap` | DB CLI + Postgres patterns + DB scaffold flow.                                  |
| `vercel`         | `/vercel-cli`, `/deploy-to-vercel`, `/sprint-development`              | Vercel CLI cookbook (verification, env, debug, rollback) + community deploy workflow + sprint deploy stages. |
| `resend`         | `/resend-cli`                                                          | Transactional email CLI: covers send, templates, domains.                      |
| `acli`           | `/acli`                                                                | Atlassian CLI: Jira/Confluence workflows. Owns slug syntax + custom-field IDs. |
| `playwright-cli` | `/playwright-cli`, `/sprint-development`                               | Browser automation: used by sprint-dev E2E checks + standalone QA capture.     |
| `jq`             | `/acli`                                                                | JSON processor: required by acli skill for parsing `acli ... --json` output.   |
| `orca`           | `/orca-orchestration`                                                  | Orchestration runtime CLI. The skill holds WHEN/WHAT; the stubs in `orchestration.orchestrator_skills` load alongside it, and DEEP topics stay served by the binary, never copied into the repo. |

**Mandatory**: before any `Bash` call that names one of these binaries, check matching skill loaded for this session. If not, load via Skill tool first. Hard gate, not suggestion.

**MCP side of the same rule**: a DB-MCP MUTATION (capability `db`: a schema, RLS, function or migration change through `apply_migration` / `execute_sql`, Supabase or the same Postgres family) loads `/supabase` + `/supabase-postgres-best-practices` first, exactly like the `supabase` binary row; the database work goes through the MCP, so the binary row alone never fires. HOW the change is made (history read first, DDL only through `apply_migration`, verified at the destination, ADR when significant): `agentic-dev-core/references/db-change-doctrine.md`. Read-only checks (`list_tables`, a `SELECT`) do not need it. Not installed → say so once and point at the install path, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
