# ADR-0015 — No shell autoloader: each process loads its own config, nothing exports `.env` into a shell

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): decision B8 of handoff 07 (2026-10-05), "remove direnv from both repos; secrets never exported into the AI shell; MCPs keep loading `.env` per process; worktree provisioning keeps copying `.env`, drops `direnv allow`". Twin unit in agentic-qa-boilerplate: b8-q. Ported here by unit b8-d
- **Tags:** secrets, env, installer, doctor, worktree
- **Supersedes:** the optional `.envrc` of ADR-0010 and ADR-0012 (the rest of both stands)
- **Superseded by:** ADR-0016 (the trade-off line sending a bare harness to `bun run <harness>`, only)

---

## Context

The repo shipped an optional `.envrc` that sourced `.env` and `.env.local` into the shell on `cd`. The installer offered `direnv allow`, the doctor reported direnv and its shell hook as pending actions, and `bun run worktree:provision` ran `direnv allow` in a new worktree when the primary checkout was already allowed.

Since ADR-0012 nothing depends on it. Every stdio MCP server starts through the `.env` loader (`varlock run --filter`) on all three hosts, terminal and desktop, and reads the checkout's `.env` itself. The spike measured it with an empty environment: the servers whose values exist start, and the rest fail only on values missing from that machine's `.env`, never on the loader. What the shell autoloader still did was put every secret in `.env` into every shell under the repo, the shell the AI's tool calls run in included, which is the exposure Critical Rule #1 exists to prevent.

The one recipe that read shell-exported secrets was the `/acli` REST fallback (`curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN"`). Everything else already loads its own config: the CLIs carry their own auth (`acli`, `gh`, `supabase`, `vercel`), the repo's bun scripts load `.env` through Bun, and `bun run claude|opencode|codex` goes through `varlock run`.

## Decision

We will ship no shell autoloader and recommend none. Each process loads its own config:

- `.envrc` is deleted. `.gitignore` ignores `.envrc`, `.envrc.local` and `.direnv/`, so a developer's personal autoloader is never committed; the deny rules on `.envrc.local` stay, because such a file may hold values.
- The installer has no direnv step (and no `INSTALL_SKIP_DIRENV`); the doctor has no direnv check, no `direnv` field in `--json` and no `shell_hook` action type.
- `bun run worktree:provision` keeps copying `.env` and drops the `direnv allow` step and the `.envrc.local` copy.
- A command that needs a `.env` value runs as `bunx varlock run -- <cmd>`, which loads it for that process only. The `/acli` REST fallback is rewritten that way.
- The updater neither delivers, watches nor deletes `.envrc`: a downstream copy is the developer's own file.

## Consequences

- **Positive:** no secret reaches a shell the AI uses unless a single command asks for it; the doctor stops nagging about an optional tool; provisioning does one thing fewer.
- **Negative / trade-offs:** a bare `claude` / `opencode` / `codex` no longer sees `.env` in its own shell. Its MCP servers still do; anything else goes through `bun run <harness>` or `bunx varlock run --`. A remote (HTTP) MCP server's token resolves only on a `bun run <harness>` launch.
- **Neutral / follow-ups:** a downstream project scaffolded earlier keeps its `.envrc` until its developer deletes it; nothing in the repo reads it.
