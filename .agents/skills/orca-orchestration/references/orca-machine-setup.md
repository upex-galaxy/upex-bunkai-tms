# Per-machine setup: the one-time checklist

> Loaded by: whoever sets up a new machine, once.
> Everything below lives in the app's own settings store on this computer. No repo file carries it
> and no CLI command sets it, so `bun sync` and a fresh clone cannot restore it. This file exists so
> the list is at least written down.

---

## 1 · Install the binary and confirm the runtime

```bash
command -v orca                                  # the binary
orca status --json </dev/null | jq '.result.runtime'
#   want: state "ready", reachable true; note appVersion before re-checking a gotcha
orca open --json </dev/null                      # if the runtime is not reachable
```

The gate this repo uses is a binary plus a reachable runtime (`SKILL.md`, "The gate: three states").
A vendor skill being installed is not part of it, and a machine with the binary and no stubs is
fully capable.

On Linux, outside an Orca-managed terminal, the CLI registers as `orca-ide`, because `/usr/bin/orca`
is the GNOME Orca screen reader. Run the gate with `command -v orca-ide` there and use `orca-ide` for
every later command. Inside Orca's own terminals `orca` is correct.

Install instructions come from the vendor. This repo's installer neither installs nor requires the
binary, and no workflow skill reports its absence (`SKILL.md`, "The gate: three states").

---

## 2 · Vendor skill stubs (optional)

```bash
orca skills list                                 # the bundled guide topics
orca skills install --skill orchestration --skill orca-cli --agent universal
orca skills installed
```

The stubs teach when to use the runtime. The command grammar is served by the binary on demand
(`orca skills get <topic>`), which is what this repo's references ask for on the deep topics, and the
stubs themselves are loaded, not fetched (`.agents/instructions/agent-skills-and-mcps.md` §5). Install
them if you want the user-level trigger words; skip them and nothing breaks.

Install them globally (the default, or `--agent universal`) and never with
`orca skills install --local`. In this repo a stub landing inside the project skill store shows up as an untracked skill
directory and collides with the repo's own tier model.

---

## 3 · The native-launch prerequisites

Supervision comes from the native launch alone (`worker-start --agent <agent> --model <id> --effort
<level>`). The runtime recognizes only agents it started itself, so a terminal created from our own
command line can never be adopted (`references/gotchas.md` G44).

Item 3.1 decides the permission mode a supervised worker runs in. The conductor verifies it at
readiness, so a machine whose default arguments do not match the profile still supervises its
workers: the mismatch shows on the first worker's screen and gets fixed before any work is
dispatched. Item 3.2 decides whether a supervised worker has its credentials.

### 3.1 · The agent's default arguments (permission mode per tier)

The native path accepts a model and an effort level and nothing else. `worker-start` and
`worktree create` have no argument passthrough, so a permission mode cannot be a flag: it has to be a
per-agent default configured in the app.

The profile declares the mode each tier should run in (`orchestration.permission_modes` in
`.agents/project.yaml`, repo vocabulary `bypass | auto | ask | inherit`). The reasons for the
defaults and the risk they accept are in
`.context/ADR/ADR-0020-agentic-work-profile-and-permission-posture.md`. The table translates the
vocabulary per harness, and the conductor checks the result on each worker at readiness
(`references/coordinator-playbook.md` §1 step 5).

| Mode | Claude Code | Codex CLI (rust-v0.165.0) | OpenCode (v1.19.5 / v2.2.0) | Pi (v1.4.0) |
|---|---|---|---|---|
| bypass | `--dangerously-skip-permissions` (= `--permission-mode bypassPermissions`); the first run needs `skipDangerousModePermissionPrompt: true` in the user settings | `--dangerously-bypass-approvals-and-sandbox` (`-a never -s workspace-write` keeps `.git` read-only and the network off: a worker cannot commit) | `--auto` (hidden aliases `--yolo`, `--dangerously-skip-permissions`) or `"permission": {"*": "allow"}` | nothing to set (no approval system); pass `--approve` to skip the project-trust prompt |
| auto | `--permission-mode auto` (a classifier; it pauses and PROMPTS after 3 consecutive or 20 total blocks, and falls back to manual when it is unavailable) | `--approve-for-me` (a reviewer model answers approvals) | no equivalent (closest: per-tool `ask` / `allow` / `deny`) | no equivalent |
| ask | the default mode | `-a on-request` | the default | n/a |
| inherit | a subagent inherits the parent session's mode | same | same | same |

Sources, read 2026-10-28 (versions as named; harness flags move, so confirm with `<harness> --help` <!-- volatile-ok: harness flags carry the version they were read at -->
on the machine): code.claude.com/docs/en/permission-modes and /cli-reference; learn.chatgpt.com
Codex approvals and security plus `codex-rs` at tag rust-v0.165.0; opencode.ai/docs/permissions and
/docs/cli; earendil-works/pi `packages/coding-agent/docs/security.md`.

`bypass` does not mean nothing ever stops:

- Claude Code bypass still stops on its first-run dialog (item 4 below), on explicit `ask` rules, on
  `AskUserQuestion` and on protected-path deletes, and refuses to run as root.
- OpenCode `--auto` still applies an explicit `deny`.
- Codex's full bypass has no sandbox (full disk and network). Whether a destructive-annotated MCP
  call still asks under it is **(unverified)**.
- The repo's own `permissions.deny` list stays in every mode.
- `auto` and an edits-only mode (`acceptEdits`) are not non-interactive: the first stalls after its
  block limit, the second on its first Bash call, and a worker nobody watches stalls with them
  (gotcha G27).

A Pi conductor cannot honour `permission_modes.conductor: auto`: bypass is the only state Pi has, and
ADR-0020's stated exposure applies. `worker-start --agent pi` launches it with no flag and on the
model in its own config (ADR-0022).

What to set in the app (Settings, the Agents section), per agent the fleet uses:

1. Worker tier (`orchestration.permission_modes.worker`): the agent's default arguments carry the
   flag of that mode from the table. Orca's own default Claude launch has been measured carrying
   `--dangerously-skip-permissions` already (gotcha G79 holds the date and the app version), so for
   `claude` with the shipped `bypass` there may be nothing to add. Read what is there rather than
   assuming it, and leave `--permission-mode auto` out of a worker agent's default arguments: it
   moves the worker into the classifier that pauses and prompts.
2. Conductor tier (`orchestration.permission_modes.conductor`): a conductor is the session the
   human types into, usually started by hand. Start it with that mode's flag
   (`claude --permission-mode auto` for the shipped `auto`). A middle conductor started with
   `agent launch` (G77) is unsupervised: pass the flag there if `orca agent launch --help` lists an
   argument passthrough. Otherwise the agent's default arguments decide its mode as they do a
   worker's, and the conductor reads it off the screen.
3. Subagent tier (`inherit`): nothing to set. A subagent runs in its parent session's mode.
4. Claude Code with bypass: set `skipDangerousModePermissionPrompt: true` in the user-level
   settings once. Without it every bypass worker stops on a first-run confirmation dialog that nobody
   sees.
5. Leave the run mode per agent. An agent with its own argument override is excluded from the global
   yolo / manual switch, which is what you want: a global switch should never decide a worker's mode.

- **(unverified)** the exact label of the settings section and the field, which may differ per app
  version. Read the screen, not this sentence.

The security tradeoff of a bypass worker, stated once: an instruction injected through content the
worker reads (a page of the app under test, a tracker comment, a fetched document) runs with the
owner's rights and network, and a `/sprint-development` worker has the database MCP and the deploy
tooling in reach. The repo's `permissions.deny` list stays in force and the irreversible steps stay
gated by doctrine. The accepted risk is recorded in ADR-0020.

Until the default arguments match the profile on a machine, a native worker launches in whatever mode
the app's per-agent default gives it. Neither the repo nor a teammate's machine can tell whether you
set it, which is the problem with a setting that cannot be versioned, and the reason the conductor
reads the mode off each worker and does not trust this checklist.

### 3.2 · Credentials for a supervised worker: each process loads its own config

No harness process holds a `.env` value, whether it is a supervised native launch or a pasted launch
line (ADR-0016): both open the bare harness binary. A worker still has MCP credentials, because on
every host each MCP server that needs `.env` values starts through the `.env` loader
(`bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>`,
`.agents/instructions/agent-harnesses.md` §5.5, `MCP_ENV_LOADER_*` in
`cli/lib/agent-compatibility-contracts.ts`). The loader reads the varlock schema plus `.env` /
`.env.local` (or the secret manager the schema names) from the checkout the harness was launched in,
at spawn time, with no shell involved, and hands each server only the variables in its filter.

- Every harness, MCP leg: the worker's checkout needs its own `.env`. `bun run worktree:provision`
  copies it from the primary checkout, and nothing else is derived from it.
- Plaintext copies from the retired generator (the `env` block of `.claude/settings.local.json`,
  `.auth/opencode/<VAR>`): no host reads them any more. `bun run harness:env` retires them (a copy
  equal to `.env` is deleted, one `.env` does not reproduce is moved to `.auth/harness-env-backup/`
  and named), and `bun run harness:env:check` exits 1 while one remains.
- Every worker, any harness, shell leg: nothing exports `.env` into the worker's shell, on purpose,
  because a secret in the shell reaches every tool call the AI makes (Critical Rule #1). The CLIs
  carry their own auth (`acli`, `gh`, `supabase`, `vercel` log in once per machine), the repo's bun
  scripts load `.env` themselves, and any other command that needs a `.env` value (a raw `curl` with
  a token) runs as `bunx varlock run -- sh -c '<cmd using "$VAR">'`, which loads `.env` for that
  process only (G45).

The failure is silent on every leg. A worktree with no `.env`, or a value the schema rejects, leaves
the MCP server without its credential and it dies on its first authenticated call (Critical Rule #9;
`bunx varlock load --agent` shows which value fails, redacted). A CLI that was never logged in on
this machine fails much later, with an error that reads like a broken tool.

```bash
bun run worktree:provision                       # a new worktree: copies .env and the other gitignored inputs
bun run harness:env:check                        # exit 1 while a retired plaintext copy remains
bunx varlock load --agent                        # which .env value fails the schema, redacted
bun run setup:doctor                             # reports what this machine declares
```

After a `.env` change nothing needs re-running: restart the agent session, and for OpenCode its
background service too (`opencode service restart`), because it caches the resolved config per
directory.

Two rules follow from this being per machine and invisible:

- The conductor verifies credentials on the worker's screen before sending it any work
  (`references/coordinator-playbook.md` §1 step 5), whichever surface they came from. Readiness is
  not capability.
- No workflow skill depends on a shell that exported `.env`. The pasted `launch.txt` line opens the
  bare harness exactly like the native launch, so the human-paste path depends on this section too,
  and a shell autoloader is not a supported seam on either path.

---

## 4 · The setup and archive hooks in the committed `orca.yaml`

The repo commits `orca.yaml`: `scripts.setup` runs `bun run worktree:provision` in every new worktree
and `scripts.archive` runs `bun run worktree:audit --rescue` before one is removed
(`references/provisioning.md` §3). Nothing is set per machine, but three per-machine things decide
whether it runs, so read them once:

```bash
orca repo list --json </dev/null
orca repo show --repo <selector> --json </dev/null     # registered hooks + source policy
```

- The source policy in the repository's Hooks settings must not be local-only, or `orca.yaml` is
  ignored. A local script set before `orca.yaml` existed (often `bun install`) is redundant now.
- Approve the trust prompt the first time each hook runs; it asks again when the script changes.
- Keep the setup policy at run-by-default, so a new worktree provisions itself before the agent
  starts.

A machine where the committed hooks cannot run falls back to setting the setup script field in the
app to `bun run worktree:provision` (UI only, gotcha G24) and running the audit by hand before every
removal.

---

## 5 · Mobile pairing (optional)

Pairing a phone is what makes "send me the summary on my phone" real: the board card, its comment
and shared artifacts become readable away from the desk, and a blocking question can be answered from
there. The pairing flow lives in the app plus the environment commands (`orca environment list` /
`orca environment add --pairing-code <code>`), and the app issues the pairing code. Which controls
the phone offers over a blocking question is **(unverified)**: find out during a real fleet and
record it in `references/gotchas.md`.

---

## 6 · The checklist, to copy

```
[ ] binary installed, `orca status` reports a reachable runtime; appVersion noted
[ ] (optional) vendor stubs installed GLOBALLY, never --local in this repo
[ ] Settings -> Agents: each agent's default args carry the flag of
    `orchestration.permission_modes.worker` from the §3.1 table (claude bypass:
    `--dangerously-skip-permissions`, already in Orca 1.4.240's default launch, G79; a pasted
    custom-argv line carries its own flag)
[ ] Claude Code with bypass: `skipDangerousModePermissionPrompt: true` in the user settings
[ ] other agents: the §3.1 flag, confirmed with `<harness> --help` on this machine, not guessed
[ ] a `.env` in every worker checkout (MCP servers read it through the `.env` loader on every host);
    `bun run harness:env:check` exits 0 (no retired plaintext copy left)
[ ] the CLIs a brief calls are logged in on this machine (`acli`, `gh`, `supabase`, `vercel`); a
    command needing a `.env` value runs as `bunx varlock run -- <cmd>` (verify on the worker's
    screen at launch)
[ ] `orca.yaml` hooks honoured: source policy not local-only, trust approved, setup run-by-default
[ ] Pi workers: trust the parent folder of the worktrees (`/trust` in a session there, or
    `defaultProjectTrust`), because a launch passes no flags and an untrusted Pi session gets
    AGENTS.md and nothing else; `bun run setup:doctor` reports it
[ ] (optional) phone paired
[ ] a single test worker launched and released end to end BEFORE a real fleet
```

The last line matters. A machine where nobody has ever released a worker is a machine where the
cleanup path is untested, and the cleanup path is the one that takes the runtime down when it is
wrong (gotcha G31).
