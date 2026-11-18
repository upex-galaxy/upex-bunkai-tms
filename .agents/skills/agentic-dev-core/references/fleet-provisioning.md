# Fleet provisioning: what a fresh worktree of this repo lacks

> Loaded by the conductor before it launches any worker into a new worktree, and by whoever sets up a machine for fleets. It is this repo's provisioning step, the one `/agent-orchestration` hard rule 2 and its conductor cycle §2 name without spelling out. Check any entry below with `git check-ignore -v <path>` before assuming it travels.

A provisioning gap never announces itself as one. It disguises itself as something else, and the worker then debugs the wrong thing for an hour.

---

## 1 · The gap table

| Missing | Git state | How it fails without it | How it is restored |
|---|---|---|---|
| `.env` (and `.env.local`) | ignored | silent on every host (Critical Rule #9): every MCP server that needs `.env` values starts through the `.env` loader, which reads this checkout's `.env`; with no file the server starts without its credential and dies on its first authenticated call (401/403). Any script needing credentials fails on missing variables | copied from the primary checkout, mode `0600`; the file existing is not enough, see §2 |
| `.vercel/` (the `vercel link` output) | ignored | loud with the wrong message: the Vercel CLI asks to link a project, and `/vercel-cli` deploy verification cannot find the project id | copied from the primary checkout |
| `.claude/settings.local.json`, `.mcp.local.json`, `opencode.local.jsonc` | ignored | quiet: per-developer permissions and MCP overrides are missing, so the worker prompts for permissions nobody answers | copied from the primary checkout, mode `0600` |
| the `.claude/skills` alias to `.agents/skills` | ignored | loud, on Claude Code only: `Skill` answers `Unknown skill` | `bun run agents:compat` inside the worktree |
| the project-level community skills `cli/install.ts` installs | ignored by explicit `.gitignore` entries | loud, at load time: the skill is not there (G41) | copy the directories from the primary checkout, or re-run the installer |
| `node_modules/` and the `.husky/_` hook shims | ignored | loud with the wrong message: `Cannot find module`. Without `.husky/_` git hooks do not run, so a worker's commit skips every gate | `bun install --frozen-lockfile` |
| `.context/PBI/` (the Jira cache) | ignored | silent: the worker cannot see the synced story, its acceptance criteria or its implementation plan, and works from the ticket title alone | `bun run context:hydrate`, or a scoped per-story sync named in the brief (`bun run jira:sync-issues get <KEY> --include-comments`) |
| `.session/` | ignored | the brief, the roster and the run files are absent inside the worktree | do not copy it. Cite absolute paths into the primary checkout (`<<PRIMARY_ROOT>>`, `.agents/README.md` §"Checkout roots") from the prompt; `bun run worktree:audit --rescue` (§5) copies what a worker wrote there anyway |

Present in a fresh worktree because they are committed: everything `git ls-files` lists, including the MCP config of each host, `.agents/project.yaml`, the Jira catalogs under `.agents/`, every skill under `.agents/skills/`, `.worktreeinclude` and `orca.yaml`. The user-level skills (`/agent-orchestration` among them) live in the home directory, so every worktree sees them.

---

## 2 · Credentials: each process loads its own config

No launch path loads the env file into the harness (ADR-0016): the supervised native launch and a pasted launch line both open the bare harness binary. A worker gets credentials only from processes that load their own config.

- The MCP `.env` loader, on every host. Each MCP server that needs `.env` values starts through `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>` in `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json` (`.agents/instructions/agent-harnesses.md` §5.5, `MCP_ENV_LOADER_*` in `cli/lib/agent-compatibility-contracts.ts`). It reads the worktree's `.env` (or the secret manager the schema names) at spawn time and gets only its own variables.
- Nothing in the worker's shell. No `.env` value is exported into the shell a worker's tool calls run in (Critical Rule #1). The CLIs carry their own auth (`acli`, `gh`, `supabase`, `vercel`, logged in once per machine), the repo's bun scripts load `.env` themselves, and any other command that needs a value runs as `bunx varlock run -- sh -c '<cmd using "$VAR">'`.
- The plaintext copies the retired `harness:env` generator wrote are no longer read; `bun run harness:env:check` exits 1 while one remains.

Both failures are silent: a worktree without `.env`, or a session not restarted after a `.env` change, leaves the MCP server without its credential, and a CLI never logged in on this machine fails the same way. So for every worker, on either launch path:

1. A `.env` in the worker's checkout (provisioning copies it). After a `.env` change restart the agent session, and for OpenCode its background service too (`opencode service restart`). For a brief that calls CLIs: each one logged in on this machine.
2. The conductor reads the worker's screen and confirms credentials loaded before relying on it (`/agent-orchestration` conductor cycle §3, readiness). With no evidence, fix the machine and do not dispatch.

```bash
bun run harness:env:check     # exit 1 while a retired plaintext copy remains
bunx varlock load --agent     # which .env value fails the schema, redacted
bun run setup:doctor          # what this machine declares
```

---

## 3 · The script

`bun run worktree:provision [<target path>]` closes the repairable rows of §1 in one call. With no argument it provisions the current directory, which makes it usable as the Orca setup hook.

```bash
bun run worktree:provision                       # provision the cwd (hook form)
bun run worktree:provision /path/to/worktree     # provision an explicit target
bun run worktree:provision /path/to/wt --dry-run # print what it would do, touch nothing
```

The implementation is `scripts/provision-worktree.ts`. It refuses to run on the primary checkout and resolves the primary via git's common-dir. It copies every gitignored input a worktree cannot rebuild (one list, `PROVISION_COPIES` in `cli/lib/worktree.ts`; secrets at mode `0600`), installs dependencies from the lockfile, runs `bun run agents:compat` inside the target and copies the gitignored community skill directories. It does not copy `.session/`. The committed `.worktreeinclude` names the same list and a test keeps the two equal, so read the list there. Hydrating the tracker cache stays a human decision: it can be large, and a scoped per-story sync is often enough.

---

## 4 · The Orca setup and archive hooks

The repo commits `orca.yaml`: `scripts.setup` runs `bun run worktree:provision` in every worktree Orca creates, and `scripts.archive` runs `bun run worktree:audit --rescue` before Orca removes one. Both run with the worktree as their working directory. Three per-machine things decide whether they run:

- Trust: the first run of each hook shows the script and asks; the answer is remembered until the script changes.
- Source policy: the repository's Hooks settings must not be local-only, or `orca.yaml` is ignored. Read what is registered with the repo-show verb of the binary's `orca-cli` guide before assuming.
- The CLI skips archive hooks by default: a conductor that removes a worktree from the CLI passes the run-hooks flag (`/agent-orchestration` conductor cycle §6).

Keep the setup policy at run-by-default, so a new worktree provisions itself before the agent starts. A machine where the committed hooks cannot run falls back to setting the app's setup script field to `bun run worktree:provision` (UI only, G24) and running the audit by hand before every removal.

Pi workers: trust the parent folder of the worktrees (`/trust` in a session there, or `defaultProjectTrust`), because a supervised launch passes no flags and an untrusted Pi session gets `AGENTS.md` and nothing else; `bun run setup:doctor` reports it (ADR-0022).

---

## 5 · The checklist the conductor runs, per new worktree

The generic order (create just before launch, fetch and verify the SHA, provision, launch, read the screen, verify the spec landed) is the skill's conductor cycle §2 and §3. This repo fills it in:

1. `bun run worktree:provision <wt>`, or confirm the setup hook ran it (its output is on the worktree's first terminal).
2. Decide the tracker cache: full hydration, or a scoped per-story sync named in the brief.
3. Confirm the worker's declared identity is usable: the variable names in `testing.automation_identity` (`.agents/project.yaml`) resolve in this worktree's `.env`. A worker never substitutes another account (`sprint-development/references/live-ui-identity.md`).

---

## 6 · Before a worktree is removed

Removing a worktree deletes everything git ignores inside it, silently, on every removal path. Run the audit first:

```bash
bun run worktree:audit <wt>            # read-only; exit 1 while STATE or UNKNOWN is only in the worktree
bun run worktree:audit <wt> --rescue   # copy STATE to the same path in the primary, never overwriting
```

It classifies each gitignored path from one table (`AUDIT_RULES` in `cli/lib/worktree.ts`): STATE (`.session/`, `.scratch/`, updater state) belongs in the primary; CACHE comes back with a command it names (`node_modules/`, `.next/`, the PBI cache, the `.vercel/` link); DISPOSABLE is safe to lose (test-run output, browser session material, PBI `[LOCAL]` notes per `.agents/instructions/agent-local-context-pbi.md` §9); UNKNOWN is decided by hand. The committed archive hook runs the rescue form. The full orphan audit (uncommitted work, unpushed commits) is the skill's conductor cycle §6.
