# ADR-0005 — Remote API-key MCPs run at harness level; skills resolve tools by capability

- **Status:** Accepted (by the owner, 2026-10-02)
- **Date:** 2026-10-02
- **Deciders:** boilerplate maintainer (owner decision OD-tavily in the dev-sync parity plan); drafted while porting the agentic-qa capability model
- **Tags:** mcp, harness, install, doctor, updater, skills
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The boilerplate committed a web-search server (`tavily`) in all three project MCP files, and its API key in `.env.example`, the variable manifest, the installer's day-0 prompt and the doctor. Two problems followed.

First, the server's only project-side content was a key. The endpoint is remote, the same for every project, and most developers already have a search provider connected at harness level (a claude.ai connector, a user-scope server). Committing it made every clone ask for a key the developer may not want to put in a project `.env`, and a second copy of the same search tools showed up under a different prefix.

Second, the doctrine named servers instead of capabilities. `AGENTS.md` §6 resolved `[WEB_SEARCH_TOOL]` to `mcp__tavily__*` and `[DOCS_TOOL]` to `mcp__context7__*`, with built-in `WebSearch` / `WebFetch` as a "last resort". An agent that saw the tool under another prefix concluded the server was absent, and the fallback let it silently swap in a shallower tool without the user ever learning a capability was missing. The agentic-qa boilerplate hit both failures first and fixed them by resolving tools by suffix (its ADR-0005).

## Decision

We will commit only LOCAL (stdio) MCP servers in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`, and resolve every MCP tool by CAPABILITY.

- **Web search runs at harness level.** `tavily` leaves the three project MCP files, and `TAVILY_API_KEY` leaves `.env.example`, the variable manifest, the installer and the doctor. `cli/lib/harness-level-mcps.ts` is the one list of recommended harness-level servers (Exa first, Tavily second) and of how to connect them per host; the installer prints it and the doctor reports whether the user-level configs declare them.
- **Skills declare capabilities** in `metadata.requires_capabilities` (`library-docs`, `web-search`, `db`, `automation-flows`), and the AI resolves a capability by tool-name suffix, any prefix. Vocabulary and procedure: `.agents/skills/agentic-dev-core/references/mcp-capabilities.md`.
- **A missing capability STOPS at the point of use.** No silent fallback to built-in `WebSearch` / `WebFetch` or any other substitute; the user chooses one explicitly.
- **Downstream projects are never overwritten.** A project that keeps `tavily` in its protected MCP files keeps it as a project-only server; `bun run up` explains the move in a parity row (`harnessLevelMcpNote`). The same row mechanism reports a server upstream retired outright (`RETIRED_MCPS`, e.g. the `atlassian` MCP, replaced by the `/acli` CLI).

## Consequences

- **Positive:** a fresh clone no longer asks for a search key; the agent finds a tool wherever the harness registered it; a missing capability surfaces once, by name, at the step that needed it, instead of degrading quietly.
- **Negative / trade-offs:** a developer with no harness-level search provider has no web search until they connect one (the STOP tells them how); the committed `tavily` shape is no longer pinned by `agents:compat:check`, so a project that keeps it gets only the generic cross-host check.
- **Neutral / follow-ups:** a lint check that validates declared capability names against the vocabulary belongs to the skill-system lint; the human docs (`docs/setup/mcp/`, `docs/mcp/`) still describe Tavily as committed and need the same move.

## Alternatives considered

- **Keep `tavily` committed with its key optional** — rejected: a remote server whose only project-side content is a key is not project configuration, and the duplicate tools under two prefixes stay.
- **Keep the built-in `WebSearch` / `WebFetch` fallback** — rejected: a silent substitute hides the missing capability from the user and produces lower-quality answers with no signal that anything changed.
- **Resolve by server prefix with a list of known aliases** — rejected: every new connector or user-chosen name breaks it; the suffix is the stable half of the tool name.

## References

- `.agents/skills/agentic-dev-core/references/mcp-capabilities.md` (vocabulary, point-of-use STOP, enabling per host).
- `cli/lib/harness-level-mcps.ts` (recommended harness-level servers, per-host how-to, user-level detection).
- `cli/lib/updater-parity.ts` (`harnessLevelMcpNote`, `RETIRED_MCPS`, `retiredMcpNote`).
- agentic-qa boilerplate ADR-0005 (the same decision for the QA side).
