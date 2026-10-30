# Provisioning — What a Fresh Worktree of THIS Repo Lacks

> Loaded by: the conductor, before it launches ANY worker into a new worktree.
> Rule 2 of the hard rules: provision BEFORE launching. Check any entry below with
> `git check-ignore -v <path>` against this repo before assuming it travels.

**The pattern worth internalizing**: a provisioning gap never announces itself as a provisioning
gap. It disguises itself as something else, and the worker then debugs the wrong thing for an hour.

---

## 1 · The gap table

| Missing | Git state | How it fails without it | How it is restored |
|---|---|---|---|
| `.env` (and `.env.local`) | ignored | **silent on every host** (Critical Rule #9): every MCP server that needs `.env` values starts through the `.env` loader, which reads THIS checkout's `.env`; with no file the server starts without its credential and dies on its first authenticated call (401/403), not at parse time. Any script needing credentials fails on missing variables | copied from the primary checkout, mode `0600`. On the SUPERVISED path the file existing is not enough — see §1b |
| `.vercel/` (the `vercel link` output) | ignored | loud with the wrong message: the Vercel CLI asks to link a project, and `/vercel-cli` deploy verification cannot find the project id | copied from the primary checkout |
| `.claude/settings.local.json`, `.mcp.local.json`, `opencode.local.jsonc` | ignored | quiet: per-developer permissions and MCP overrides are missing, so the worker prompts for permissions nobody answers or runs without an override the owner relies on | copied from the primary checkout, mode `0600` |
| the `.claude/skills` alias → `.agents/skills` | ignored | loud, on Claude Code only: `Skill` answers `Unknown skill`. OpenCode and Codex read `.agents/skills/` natively and do not need it | `bun run agents:compat` inside the worktree (it creates a POSIX symlink or a Windows junction) |
| the T3 community skills `cli/install.ts` installs | ignored by explicit `.gitignore` entries | loud, at load time: the skill simply is not there (gotcha G41) | copy the directories from the primary checkout, or re-run the installer |
| `node_modules/` and the `.husky/_` hook shims | ignored | loud **with the wrong message**: `Cannot find module`, which reads as a broken import. Without `.husky/_` git hooks do not run at all, so a worker's commit skips every gate and succeeds | `bun install --frozen-lockfile` |
| `.context/PBI/` (the Jira cache) | ignored | **silent**: the worker cannot see the synced story, its acceptance criteria or its implementation plan, and quietly works from the ticket title alone | `bun run context:hydrate`, or a scoped per-story sync named in the brief (`bun run jira:sync-issues get <KEY> --include-comments`) |
| `.session/` | ignored | the brief, the roster and the run files are simply absent inside the worktree | do NOT copy it. Cite ABSOLUTE paths into the PRIMARY checkout (`<<PRIMARY_ROOT>>`, `.agents/README.md` §"Checkout roots") from the prompt. Anything written inside a worktree dies with it; `bun run worktree:audit --rescue` (§5) copies what a worker wrote there anyway |

**Present in a fresh worktree because they are committed**: everything `git ls-files` lists, which
includes the MCP config of each host (each server that needs values starts through the `.env` loader,
hence the `.env` dependency), `.agents/project.yaml`, the Jira catalogs under `.agents/`, every T1 skill under
`.agents/skills/`, `.worktreeinclude` and `orca.yaml`.

---

## 1b · The env file is present and the supervised worker still has no credentials

No launch path loads the env file into the harness (ADR-0016): the supervised native launch and a
pasted launch line both open the bare harness binary, so the harness process holds no `.env` value
either way. A worker gets credentials only from processes that load their own config:

- **The MCP `.env` loader, on every host.** Each MCP server that needs `.env` values starts through
  `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>`
  in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` (`.agents/instructions/agent-harnesses.md`
  §5.5), so it reads the worktree's `.env` (or the secret manager the schema names) at spawn time and
  gets only its own variables. This is the route by which any worker's MCP servers get their
  credentials, with no shell involved. Provisioning derives nothing from the copied `.env` and never
  copies `.auth/`; the plaintext copies the retired `harness:env` generator wrote are no longer read.
- **Nothing in the worker's shell.** No `.env` value is exported into the shell a worker's tool
  calls run in (Critical Rule #1). The CLIs carry their own auth (`acli`, `gh`, `supabase`,
  `vercel`, logged in once per machine), the repo's bun scripts load `.env` themselves, and any
  other command that needs a `.env` value runs as `bunx varlock run -- sh -c '<cmd using "$VAR">'`,
  loading it for that process only.

Both failures are silent. A worktree whose `.env` is missing, or a session not restarted after a
`.env` change, leaves the MCP server without its current credential; a CLI never logged in on this machine fails the same way. Either
way the worker is fully provisioned, starts cleanly, and nothing says so until its first
authenticated call fails with an error that reads like a broken tool (gotcha G45).

So for every worker, on either launch path, in this order:

1. A `.env` in the worker's checkout (provisioning copies it; after a `.env` change, restart the
   agent session; `bun run harness:env:check` exits 1 while a retired plaintext copy remains). For a
   brief that calls CLIs: each one logged in on this machine (`references/orca-machine-setup.md`
   §3.2). Per machine; not versionable; invisible to the repo.
2. The conductor **reads the worker's screen and confirms credentials loaded** before sending it any
   work (`references/coordinator-playbook.md` §1 step 5). An MCP tool listed as connected, or the
   worker's own first probe, is the evidence. No evidence → fix the
   machine, do not dispatch work.

Workers on every harness run supervised with their MCP credentials and no shell setup. No launch
path gives a session `.env` in its own process, and none should: a command that needs a value runs
through `bunx varlock run -- sh -c '...'` on either path, so credentials are never a reason to
choose the unsupervised pasted line (`references/launch-seam.md` §1).

---

## 2 · The script

`bun run worktree:provision [<target path>]` closes the repairable rows above in one call. With no
argument it provisions the current directory, which is what makes it usable as an Orca setup hook.

```bash
bun run worktree:provision                       # provision the cwd (hook form)
bun run worktree:provision /path/to/worktree     # provision an explicit target
bun run worktree:provision /path/to/wt --dry-run # print what it would do, touch nothing
```

Implementation: `scripts/provision-worktree.ts` (Bun, cross-platform). It refuses to run on the
primary checkout, resolves the primary via git's common-dir, copies every gitignored input a
worktree cannot rebuild that the primary has (one list, `PROVISION_COPIES` in `cli/lib/worktree.ts`;
secrets at mode `0600`, `chmod` skipped on Windows), installs dependencies from the lockfile, runs
`bun run agents:compat` inside the target, copies the gitignored T3 skill directories, deliberately does NOT copy `.session/`, prints a summary
plus the tracker-cache hint, and exits non-zero on any hard failure. The committed `.worktreeinclude`
names the same list, and a test keeps the two equal. Read the list there, never from this page.

What it deliberately leaves to a human decision: hydrating the tracker cache (it can be large and
slow, and a scoped per-story sync is often enough).

---

## 3 · Making it the Orca setup hook

The repo commits `orca.yaml` at its root, and Orca reads it as the repo's shared hooks: `scripts.setup`
runs `bun run worktree:provision` in every worktree Orca creates, and `scripts.archive` runs
`bun run worktree:audit --rescue` before Orca removes one (§5). Both run with the worktree as their
working directory, which is why neither names a path. Nobody has to set anything per machine.

Three things still decide whether the committed hooks run, and they are per machine:

- **Trust.** The first run of each hook shows the script and asks; the answer is remembered until the
  script changes.
- **Source policy.** Settings for this repository → Hooks can hold a LOCAL script too, and a policy
  that picks shared, local or both. A local-only policy ignores `orca.yaml`. Read what is registered
  before assuming: ask the binary for the repo-show verb in its `orca-cli` guide.
- **The CLI skips archive hooks by default.** Removing a worktree from the CLI runs them only with
  the run-hooks flag; a conductor that removes from the CLI passes it
  (`references/coordinator-playbook.md` §6).

A machine where the committed hooks do not run (policy, an older Orca, a declined trust prompt) falls
back to the manual steps: `bun run worktree:provision <wt>` in §4 and the audit in §5. Keep the setup
policy at run-by-default so a new worktree provisions itself before the agent starts; whether the
agent waits for setup under a start-immediately policy is unverified, so read the worker's screen
before sending it work (§4 step 6).

The per-machine checklist this belongs to: `references/orca-machine-setup.md`.

---

## 4 · The provisioning checklist the conductor actually runs

For each new worktree, in this order, and none of it optional:

1. Create the worktree just before launching (one created half an hour earlier is born stale, G21).
2. `git -C <wt> fetch origin` and verify `git -C <wt> rev-parse --short HEAD` equals
   `origin/<base>`. No `|| true` (G20).
3. `bun run worktree:provision <wt>` (or confirm the setup hook ran it: its output is on the
   worktree's first terminal).
4. Decide the tracker cache: full hydration, or a scoped per-story sync named in the brief.
5. Confirm the worker's declared identity is usable: the variable NAMES in
   `testing.automation_identity` (`.agents/project.yaml`) resolve in this worktree's `.env`. A worker
   never substitutes another account (`sprint-development/references/live-ui-identity.md`).
6. Only now: launch the supervised worker, read its screen for the status footer AND for credentials
   (§1b), then send it the prompt that points at its brief
   (`references/coordinator-playbook.md` §1 steps 4-6).
7. Within a few minutes, verify the prompt landed: a working-tree status check that is still empty
   after ten minutes means the worker received nothing. Re-send into the SAME terminal — the tab, the
   title and the dispatch binding all survive a failure, so creating a new terminal would orphan the
   dispatch row instead of fixing anything. Check the screen first: a send that answered
   `agent_prompt_stalled` has usually already queued the text (gotcha G52).

---

## 5 · Before a worktree is removed

Removing a worktree deletes everything git ignores inside it, and every removal path (`git worktree
remove` without `--force`, Orca's delete, a harness's own cleanup) does it silently. Run the audit
first:

```bash
bun run worktree:audit <wt>            # read-only; exit 1 while STATE or UNKNOWN is only in the worktree
bun run worktree:audit <wt> --rescue   # copy STATE to the same path in the primary, never overwriting
```

It classifies each gitignored path from one table (`AUDIT_RULES` in `cli/lib/worktree.ts`): STATE
(`.session/`, `.scratch/`, updater state) belongs in the primary; CACHE comes back with a command it
names (`node_modules/`, `.next/`, the PBI cache, the `.vercel/` link); DISPOSABLE is safe to lose
(test-run output, browser session material, PBI `[LOCAL]` notes per `.agents/instructions/agent-local-context-pbi.md` §9); UNKNOWN matched
no rule and is decided by hand. The committed `orca.yaml` archive hook runs the rescue form; the full
orphan audit, with uncommitted work and unpushed commits, is `references/coordinator-playbook.md` §6.
