# MCP Capabilities: Declare by Capability, Resolve by Suffix

> Cited by `.agents/instructions/agent-skills-and-mcps.md` §5 (MCP table) and `.agents/instructions/agent-tool-resolution.md` §6 (tool resolution), and by every skill whose frontmatter declares `metadata.requires_capabilities`. The vocabulary in §2 is owned HERE: a lint check that validates declared names must mirror it, and a new name lands here first. Decision record: `.context/ADR/ADR-0005-harness-level-mcps-and-capabilities.md`.

## 1. Why capabilities, not servers

A tool name has two halves: `mcp__<server>__<tool>`. The **prefix** is the server the host registered; the **suffix** is what the tool does. The same Supabase tool arrives as `mcp__supabase__execute_sql` from the project `.mcp.json` and as `mcp__claude_ai_Supabase__execute_sql` from a claude.ai connector; a Tavily tool arrives under whatever name the developer gave it in their user config. An agent that matches the prefix concludes "no Supabase" while the tool sits right there. So:

- Skills declare the **capability** they need, never a server name.
- The AI resolves a capability by looking for **any available tool whose name ends in (or, for DBHub, starts with) one of the suffixes in §2**, whatever its prefix.
- Nothing alarms at session start when a server is disabled (people disable MCPs to save tokens). The only alarm is the point-of-use STOP in §4.

## 2. Vocabulary

| Capability | Tool names that provide it (after the `mcp__<server>__` prefix) | Where the server lives | Used for |
|---|---|---|---|
| `library-docs` | `resolve-library-id`, `query-docs` | committed `context7` (no key) | `[DOCS_TOOL]`: official library / framework / SDK / CLI docs before writing code against an API |
| `web-search` | Exa first: `web_search_exa`, `web_fetch_exa` (plus `web_search_advanced_exa` when the server enables it). Tavily second: `tavily_search`, `tavily_extract`, `tavily_research` | HARNESS level, never `.mcp.json`: a claude.ai connector, a user-scope Claude server, the OpenCode or Codex user config (the recommended servers and how to connect them: `cli/lib/harness-level-mcps.ts`) | `[WEB_SEARCH_TOOL]`: community fixes, error-message lookups, non-doc research, spikes. Prefer an Exa tool when both providers are available; Tavily when Exa is absent or the user asks for it |
| `db` | Supabase: `execute_sql`, `list_tables` (plus `list_migrations`, `apply_migration` for migration work). A project that adds DBHub: `execute_sql_<source_id>`, `search_objects_<source_id>` (DBHub appends the source id) | committed `supabase` (`SUPABASE_ACCESS_TOKEN` and the project keys in `.env`) | `[DB_TOOL]`: schema discovery, the live migration ledger, read-only data checks |
| `automation-flows` | `search_nodes`, `get_node`, `validate_workflow` (plus the `n8n_*` management tools when `N8N_API_URL` / `N8N_API_KEY` are set) | committed `n8n` | `[AUTOMATION_FLOWS_TOOL]`: designing, validating and managing n8n workflows |
| `diagrams` | none: the one capability resolved by a SKILL's presence, not by an MCP tool suffix. Provided when a `diagram-design` skill is loadable | project-level skill installed by `cli/install.ts` (T3); a user-level install or a harness plugin satisfies it too | the figures inside the business context maps (`business-context-maps.md` §7). Absent → the point-of-use STOP of §4, naming the install line `bunx skills add https://github.com/cathrynlavery/diagram-design --skill diagram-design --yes` |

`diagrams` is the deliberate exception to the suffix rule in §1: a drawing skill has no tool name to match, so the check is "can a skill named `diagram-design` be loaded here".

Only LOCAL (stdio) servers are committed in the three project MCP files (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`). A remote server whose only project-side content is an API key (web search) is the harness's business: connected once per machine, resolved here by suffix. `[ISSUE_TRACKER_TOOL]` and `[AUTOMATION_TOOL]` are not capabilities: they resolve to CLIs (`/acli`, `/playwright-cli`), and an Atlassian or browser MCP a developer adds is their own fallback. A server no skill instructs gets no capability name; add one here the day a skill needs it.

## 3. Declaring a requirement (skill authors)

The Agent Skills frontmatter spec allows extra keys only inside `metadata`, so the declaration lives there:

```yaml
metadata:
  requires_capabilities: [library-docs, db]
```

**Correspondence rule.** A skill declares a capability when its `SKILL.md` or one of its references INSTRUCTS the AI to use it (a `[DOCS_TOOL]` / `[WEB_SEARCH_TOOL]` / `[DB_TOOL]` / `[AUTOMATION_FLOWS_TOOL]` step, or the tool names in §2). Naming a server in an env-var checklist or an "N/A here" sentence is not use, and neither is a tag that appears only in a legend table: declare it or drop the row. Nothing declared goes unused; nothing used goes undeclared.

Each declaring skill cites §4 with one line in its Compact Rules or its preflight section; the procedure itself lives ONLY here.

## 4. Point-of-use STOP

Before the step that uses a declared capability, check that at least one available tool provides it (by suffix, §2). None → STOP and tell the user, in one message:

1. which capability is missing and what the step needed it for;
2. which server normally provides it (§2);
3. how to enable it on this host (§5).

Then wait. **Never degrade to another tool on your own.** Built-in `WebSearch` / `WebFetch` are NOT a silent fallback for `web-search` or `library-docs`; raw SQL pasted for the user is not a silent fallback for `db`; guessing an API from memory is not a fallback for anything. The user decides. Their explicit "use X instead" (the built-in search, a manual SQL run, skipping the check) is the only thing that unblocks a substitute, and it holds for that step, not for the session.

**User prompts follow the same rule.** "Search the web for X", "look up the Next.js docs", "check the staging schema" each clearly need one capability; when no tool provides it, answer with the same one-message STOP instead of a substitute.

**Optional steps stay optional.** A step a skill marks as conditional ("only if the project uses n8n") does not STOP when the capability is absent and the condition is false; say in one line that the step was skipped and why.

## 5. Enabling a missing capability

| Host | Where the server lives | How to enable |
|---|---|---|
| Claude Code | `.mcp.json` (project, local servers), `~/.claude.json` (user scope: `claude mcp add --scope user ...`), or a claude.ai connector | `/mcp` inside the session lists every server and lets you enable, authenticate or reconnect one. Project servers that need `.env` values start through the `.env` loader (`varlock run --filter <its vars>`), which reads `.env` itself however Claude Code was launched. A claude.ai connector is connected from claude.ai settings and its tools appear under `mcp__claude_ai_<connector>__`. |
| OpenCode | `opencode.jsonc` → `mcp.<server>` (project), `~/.config/opencode/opencode.json` (global) | Set `enabled: true`. Project servers that need `.env` values start through the same `.env` loader, so nothing is copied out of `.env`. After a `.env` or config change, restart the session and `opencode service restart` (it caches the resolved config per directory). |
| Codex CLI / Desktop | `.codex/config.toml` → `[mcp_servers.<server>]` (project), `~/.codex/config.toml` (user: `codex mcp add <name> --url <url>`, then `codex mcp login <name>`) | The project file loads only in a TRUSTED repository; its stdio servers read `.env` through the loader. Restart the session. |

`bun run setup:doctor` reports which harness-level servers this machine's user configs declare; a cloud connector leaves no file and is reported as not detectable, never as missing. The installer prints the same connect commands at the end of `bun setup`.

Server enabled but the first call returns 401/403 or a mystery failure → that is the credential case of `AGENTS.md` Critical Rule #9: name the env var, point to `.env` / `.env.example`, ask for the fix and a RESTART (values are read at MCP spawn time).
