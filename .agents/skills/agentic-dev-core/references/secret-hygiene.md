# Secret hygiene: credentials by name, never by value

> Canon for Critical Rule #1 in `AGENTS.md` (full text: `.agents/instructions/agent-critical-rules.md` §1). Cited by every skill that touches a credential: logging into a CLI, calling an authenticated API, pushing variables to a platform, filling `.env`, diagnosing an MCP that fails auth. Subagents receive the compact form through `REGISTRY.md` and briefing component 7.

## 1. The line between using and exposing

A secret VALUE that enters the model context also enters the provider request and the local session transcript, and nothing in the session can take it back out. So the rule is about where the value travels, not about whether the AI "uses" a credential.

| Shape | Exposure? | Why |
|---|---|---|
| `curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" ...` | no | the command text carries the NAME; the shell expands it inside the child process |
| `printf '%s' "$ATLASSIAN_API_TOKEN" \| <cli> login --token-stdin` (the tracker login: `[ISSUE_TRACKER_TOOL] Authenticate`, owned by `/acli`) | no | the value goes into a pipe, never to the output |
| `--filter SUPABASE_ACCESS_TOKEN` on the `.env` loader of an MCP server in `.mcp.json`, `opencode.jsonc` or `.codex/config.toml` | no | the loader resolves it in the server's own process, outside the transcript |
| `Read(.env)`, `cat .env`, `grep KEY .env`, `awk 1 .env` | **yes** | the file content becomes tool output |
| `printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v` | **yes** | the value (or the `Authorization:` header) is printed |
| `varlock printenv`, `varlock reveal`, `varlock load` without `--agent` | **yes** | these print raw values by design |
| a value pasted into the chat by the human or written by the AI into a plan, report, commit or tracker comment | **yes** | it is in the transcript the moment it is typed |

## 2. Files the AI never opens

| Path | What it holds |
|---|---|
| `.env`, `.env.local`, `.env.*.local`, `.envrc.local` | the values themselves |
| `.auth/**` | session state written by any login flow; on a machine set up before the `.env` loader, the plaintext MCP copies `bun run harness:env` retires (`.auth/opencode/<VAR>`) and the backup it moves the unmatched ones to (`.auth/harness-env-backup/`) |
| `.claude/settings.local.json` | per-developer settings; on an older machine, an `env` block of MCP credentials until `bun run harness:env` retires it |

Readable, and the right place to learn a variable's NAME, type and sensitivity: `.env.example` and the committed `.env*.schema` files: `.env.schema` (project-owned), `.env.core.schema` (generated from `cli/lib/variables-manifest.ts`, the variable routing table) and, when the project opted into a secret manager, `.env.provider.schema` (references such as `op(op://<vault>/<VAR>/password)`, never a value).

Never `source` a file under `.auth/`: a retired copy holds a bare value, not a `KEY=value` line, so the shell tries to run the value as a command and prints it in the error.

## 3. Safe command shapes

**Is the variable set?** Ask a tool that answers by name:

```bash
bunx varlock load --agent      # every schema item; @sensitive ones redacted to a 2-char prefix
bun run setup:doctor --json    # env_vars: { NAME: "set" | "missing" } for the required set
bun run vars:env:check         # inherited process value vs .env / .env.local; lengths only
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && echo "SUPABASE_ACCESS_TOKEN set" || echo "SUPABASE_ACCESS_TOKEN unset"
```

The last form checks the CURRENT process environment, and for a `.env` value it is EXPECTED to say unset: the harness is opened bare and holds no `.env` value (ADR-0016). A hit there is an inherited value, which `bun run vars:env:check` compares against `.env` by name and length. `bunx varlock load --agent` redacts only what the schema marks `@sensitive` and prints every other value in full: a secret declared without `@sensitive` (a project variable added to `.env.schema` in a hurry) is exposed by it, so mark it first. Never `varlock load` without `--agent`, nor `--format env|shell|json-full` without `--agent`.

Never run `varlock load` (even `--agent`) against a schema you have not checked for `@sensitive` coverage: `--agent` redacts only the items the schema marks sensitive and prints every other value in clear, including one inherited from the shell. Scratch schemas are banned. The committed ones are checked by `bun run vars:schema:check`, which fails on any secret-looking key (`SECRET_NAME_PATTERNS` in `cli/lib/env-schema.ts`) without `@sensitive`. The same goes for any CLI that lists a harness's MCP config (`codex mcp list`, `claude mcp list`): it prints user-level server arguments, API keys included.

**A command needs a `.env` value.** This is the normal path, because no `.env` value is ever in the session's own environment. Run the command THROUGH the loader in a subprocess; the loader reads the file, the AI never does:

```bash
bunx varlock run -- sh -c 'curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects'
```

On a pipe (any agent tool call) `varlock run` also redacts `@sensitive` values in the child's own output, a second net under the command shape.

**Pushing values to a platform** (Vercel env, GitHub Actions secrets): the AI chooses the NAMES; a subprocess moves each value from the loader to the platform's stdin:

```bash
bunx varlock run -- bash -c 'v="${!1}"; [ -n "$v" ] || { echo "skip $1 (empty)"; exit 0; }; printf "%s" "$v" | gh secret set "$1"' _ SUPABASE_ACCESS_TOKEN
```

`${!1}` is bash indirect expansion: the value is read by name inside the child and piped, never printed. The `vercel-cli` skill (`references/env-vars.md`) carries the Vercel variant.

**HTTP debugging**: `-o /dev/null -w '%{http_code}'` or `-i | head -1` for the status, `jq` over the body. Never `-v` / `--trace` on an authenticated call: they print the request headers.

## 4. Writing `.env`

| Value | Who writes it |
|---|---|
| Secret: credential, API key, token, password, anything marked sensitive or obviously secret | the human, in a terminal or the secret manager. The AI names the variable, says where to obtain it (the hint in `.env.example`, `bun run setup:doctor`), and waits |
| Non-sensitive: a URL, a project key, a flag, a port | the AI MAY write it when the human asks, through `bun run env:set KEY=value` only |

`bun run env:set` is the one sanctioned write path. It accepts a key only when `cli/lib/variables-manifest.ts` declares it, reads it from `.env` and marks it `secret: false`; anything else is refused, undeclared keys included, and a refused call writes nothing. It rewrites the key's line in place and prints key NAMES only. The `Read(.env)` deny refuses every direct edit of the file (the Edit tool, `sed -i`, `>` redirection, `mv`), and an improvised subprocess around it (`bun -e`, a heredoc into `node`) is a violation even for a harmless value. A key that should be writable and is refused gets declared in the manifest by a human-reviewed change, not written another way.

The AI never asks the human to paste a secret into the chat to "save it for them". A secret that reached the chat anyway is a leak (§6), not an input.

## 5. The harness net

| Host | What enforces the rule |
|---|---|
| Claude Code | `.claude/settings.json` → `permissions.deny`: `Read(...)` on the paths of §2 (a `Read` deny also refuses `cat`, `head`, `grep`, `awk` and writes or moves on that path) plus `Bash(printenv*)`, `Bash(env)`, `Bash(varlock printenv*)`, `Bash(varlock reveal*)` and their `bunx` forms. Deny applies in every permission mode, `bypassPermissions` included |
| OpenCode | `opencode.jsonc` → `permission.read` denies the same paths; `permission.bash` denies `cat` of them plus the same printing commands, placed after the broad allows (last match wins) |
| Codex | `[shell_environment_policy] inherit = "core"` in `.codex/config.toml`: the shell Codex runs does not inherit the session's secrets in the first place, so `printenv` has nothing to show. Its MCP servers get their values through the per-server `.env` loader, outside the shell |

Two limits, both by design. The deny rules match command PATTERNS, so a subprocess that opens a file itself (`node -e`, a script) is not caught; and `source <file>` loads values into the shell without printing them, so it is not caught either (and needs no catching). The rule text is what binds; the deny list is the net under it.

## 6. When a value leaks anyway

1. Say so plainly in the reply: which variable, where it appeared (tool output, a file, a commit). Name the variable; never repeat the value.
2. Recommend rotation at the issuer. A value that reached a transcript is compromised for good: it sits in the provider request and in the local session log.
3. If it reached a commit or a pushed branch, stop and hand it to the human: history rewriting needs their decision (Critical Rule #5).
4. Never "clean up" by editing transcripts or logs.

## 7. Subagents

A subagent sees only its briefing, `REGISTRY.md` and the files the briefing names (AGENTS.md §3 RULE REACHABILITY). Any dispatch that touches credentials carries Critical Rule #1 in component 7, and any subagent that materializes auth or session material on disk follows the EPHEMERAL-ARTIFACT CONTRACT (AGENTS.md §3): session scratch dir only, deleted before reporting, `secrets_materialized` + `cleaned` disclosed in the report.
