# Git Worktrees — Isolated Parallel Work

A **worktree** is a second working directory wired to the **same `.git`**. Git normally
gives you one working tree; with worktrees you get several — each with its **own
checked-out branch, its own files, and its own index** — while they all share one object
database (commits, blobs, refs).

```
~/proj/                       <- primary worktree   (branch A — e.g. feature-in-progress)
   .git/  <------ one shared object store ------+
   src/ ...                                     |
                                                |
~/proj-hotfix/                <- linked worktree (branch B — e.g. hotfix)   ---+
   src/ ...                                                                    |
                                                                              -+
```

Committing in one worktree never touches another worktree's files. A branch can be
checked out in **only one** worktree at a time (git enforces this), which is exactly what
makes worktrees safe for **parallel sessions** — including multiple AI agents working
locally at once.

---

## When to use a worktree

- **Parallel AI sessions** — two agents (or an agent + a human) working the repo at once,
  each on its own branch, without stepping on each other's files.
- **Isolate risky / unrelated WIP** — you have important uncommitted work on branch A and
  want to build something unrelated (branch B) without polluting A's working tree or
  risking an accidental `git add` mixing the two.
- **Hotfix while a feature is open** — patch `main` in a clean tree without stashing or
  disturbing the half-done feature.
- **Review a PR branch** — check out someone's branch in a separate tree without
  disrupting your own.

### When NOT to bother

- A simple branch switch on a clean tree → just `git switch`/`git checkout -b`.
- One short linear task → a normal branch is enough; a worktree is overhead.

---

## The lifecycle in THIS repo (canon, every host, every creation path)

However the worktree is created (plain `git worktree add`, Orca, a harness tool, a Codex-managed
worktree), the same three repo steps wrap it:

```
create  ──→  bun run worktree:provision  ──→  work  ──→  bun run worktree:audit <wt> --rescue  ──→  remove
```

- **Provision before working.** A fresh worktree holds only tracked files. `bun run
  worktree:provision` (no argument = the cwd) copies the gitignored inputs it cannot rebuild from
  the primary checkout (`.env`, `.vercel/`, local settings), installs dependencies and creates the
  `.claude/skills` alias. The list lives in code, never in prose: `PROVISION_COPIES` in
  `cli/lib/worktree.ts`. It installs with bun only: an app on pnpm / npm / yarn
  (`stack.package_manager`, else its lockfiles) is refused with the reason before anything is
  copied (`provisionPackageManager`, same file), because `bun install` would write a second lockfile.
- **`.session/` is never copied.** Durable gitignored state (plans, progress, locks, run reports)
  lives at `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots") and is cited by absolute path
  from inside the worktree. A copy diverges silently and dies with the worktree.
- **Audit before removing.** `bun run worktree:audit <wt>` is read-only and exits 1 while state lives
  only in the worktree; `--rescue` copies it to the primary, never overwriting.
- **Orca does both steps for you.** The committed `orca.yaml` runs `worktree:provision` as the setup
  hook and `worktree:audit --rescue` as the archive hook. Supervised fleets (a conductor launching
  workers into worktrees) are owned by `/orca-orchestration` (`references/provisioning.md`), not by
  this skill.

---

## Approach A — Manual git (portable, works with any tool or agent)

This is plain git. It works the same in any terminal, any editor, any coding agent.

```bash
# inspect
git worktree list                                   # show every worktree + its branch

# create: new directory + NEW branch, based on a ref
git worktree add ../proj-feature -b feat/x main     # branch feat/x from main, in ../proj-feature
git worktree add ../proj-hotfix hotfix/y            # check out an EXISTING branch hotfix/y
bun run worktree:provision ../proj-feature          # repo step: gitignored inputs + deps + skills alias

# work — both directories live simultaneously
cd ../proj-feature
#   ...edit / commit normally...
git add -p && git commit -m "feat: x"
git push -u origin feat/x
cd ../proj                                          # hop back to the primary tree any time

# clean up after the branch is merged
bun run worktree:audit ../proj-feature --rescue     # repo step: rescue gitignored state to the primary
git worktree remove ../proj-feature                 # delete the dir (refuses if uncommitted; --force overrides)
git branch -d feat/x                                # delete the branch once merged
git worktree prune                                  # drop stale registrations (if a dir was rm'd by hand)

# extras
git worktree lock ../proj-feature "reason"          # protect from prune (e.g. dir on external/removable disk)
git worktree unlock ../proj-feature
git worktree move ../proj-feature ../proj-feature2  # relocate a worktree
```

**Golden rules**

- Same branch in two worktrees → **git blocks it**. Give every worktree its own branch.
- `git worktree remove` **refuses** when there are uncommitted changes → commit (or
  `--force` to discard).
- Deleting a worktree directory with `rm -rf` leaves a stale registration → run
  `git worktree prune` afterward.
- A worktree's `HEAD`, index, and stash-vs-tree are independent; **the stash list and
  config are shared** (see Multi-session safety).

---

## Approach B — a harness's own worktree tool (harness path only)

> **Harness-specific, never the repo canon.** Some hosts create the worktree and move the
> session into it for you: Claude Code (`EnterWorktree` / `ExitWorktree`, `claude --worktree`),
> Codex (its managed worktrees). OpenCode has no equivalent: use **Approach A**. Whatever
> the host, the repo lifecycle above still applies: run `bun run worktree:provision` right
> after entering, and `bun run worktree:audit <wt> --rescue` before the tool removes it.
> The Claude Code tools are described below because their limits bite.

**`EnterWorktree`** — creates a worktree under `.claude/worktrees/<name>/` on a new
branch and switches the session's working directory into it.

- Base ref is governed by the `worktree.baseRef` setting:
  - `fresh` (default) → branch from `origin/<default-branch>` (clean, independent of local WIP).
  - `head` → branch from your current local `HEAD` (carries your current branch's commits).
- Params: `name` (create a new worktree) **or** `path` (enter an existing one already made
  with `git worktree add`).

**`ExitWorktree`** — returns the session to the original directory.

- `action: "keep"` — leave the worktree + branch on disk (come back later / preserve work).
- `action: "remove"` — delete the worktree dir **and** its branch. With uncommitted files
  or unmerged commits it **refuses** unless `discard_changes: true`.
- Only operates on worktrees **this session** created via `EnterWorktree` — it will not
  touch one you made by hand (`git worktree add`).
- `remove` deletes gitignored state with the directory: audit first.

**Subagents** — the `Agent` tool (and workflow agents) accept `isolation: "worktree"`,
which runs each subagent in its own temporary, auto-cleaned worktree. Use that only when
parallel subagents mutate files and would otherwise collide — not to isolate a whole
session.

### Manual vs harness at a glance

| | `git worktree` (manual) | `EnterWorktree` (Claude Code) |
| --- | --- | --- |
| Portability | any tool / agent / host | Claude Code only |
| Directory location | anywhere you choose (`../dir`) | fixed under `.claude/worktrees/` |
| Base ref | whatever you pass | setting: `fresh`=origin/default or `head` |
| Moves the agent's session | no (you `cd`) | yes, automatically |
| Repo steps | `worktree:provision` after add, `worktree:audit --rescue` before remove | the same two, around the tool |
| Cleanup | manual (`remove`/`prune`) | `ExitWorktree remove` |
| Branch naming | you choose | derived from the name (rename with `git branch -m`) |

---

## The untracked-files gotcha (applies to BOTH approaches)

A brand-new worktree starts with **only the tracked files of its base ref**. Files that
are **untracked** in your current tree (new, never `git add`ed) live physically in the
*current* directory — they **do not teleport** into the new worktree.

To bring untracked WIP into a fresh worktree, **move it**:

```bash
mv ./cli/new-feature  ../proj-feature/cli/new-feature   # untracked files: just move them
# or: commit them on a branch first, then create the worktree from that branch
```

**Do not move a tracked path by accident.** If you `mv` a directory that contains
tracked files, git sees them as deleted in the source tree. Restore with:

```bash
git checkout -- path/to/tracked-file        # bring a tracked file back into the source tree
```

---

## Multi-session safety (no collisions between parallel agents)

Rule of thumb: **one session = one worktree = one branch.**

| Shared across worktrees (safe) | Isolated per worktree |
| --- | --- |
| `.git/objects` (commits/blobs — append-only, no overwrite) | working directory (files) |
| refs, config, hooks, **stash list** | index / staging area |
| | checked-out branch (duplicate checkout blocked by git) |

- Two sessions never edit the same physical file or the same branch → they cannot clobber
  each other's work.
- **Stash is global to the repo.** Do not rely on `git stash` to hand work between
  sessions — commit to your branch instead.
- **Runtime, not git:** if both sessions run a local server / dev process, give each a
  **distinct port** (or rely on port auto-fallback). Git isolation does not isolate
  network ports, temp files, or databases.
- **Worktree nested inside the repo** (e.g. Claude Code's `.claude/worktrees/`): the parent
  repo may show it as untracked. Hide it **locally** without a tracked commit by adding the
  path to the shared exclude file:

  ```bash
  echo '.claude/worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"
  ```

  `info/exclude` lives in the shared git-common dir (one copy for all worktrees) and is
  never committed — so it cannot leak into another branch's history.

### Provenance: which session owns a worktree

The record is the commit itself, not a side file. Every agent commit ends with the forensic
trailers `Worktree: <name|primary>` and `Session: <label>` (SKILL.md §3.2, Critical Rule #3), copied
from the `AGENT IDENTITY:` line the prompt hook injects. Given an orphaned worktree or branch:
`git log <branch> --format=%B | grep -E '^(Worktree|Session):'` names the worktree and the session
that wrote it; under orchestration the Orca run (`/orca-orchestration`) also records which worker
held which worktree. Rules that still hold:

- **A stale worktree is DIAGNOSTIC, not something to auto-repair.** Report it and let a human
  decide. Do NOT delete another session's worktree (`ExitWorktree` only touches worktrees its own
  session created; the same discipline applies to manual `git worktree remove`).
- **A worktree with no commits has no trailer to read.** That is the case `worktree:audit` exists
  for: run it before deciding anything.

---

## Cleanup checklist

- [ ] Branch's work is committed and pushed (or deliberately discarded).
- [ ] `bun run worktree:audit <path> --rescue` exits 0 (no state left only in the worktree).
- [ ] `git worktree remove <path>` (or `ExitWorktree remove`) — succeeds only when clean.
- [ ] `git branch -d <branch>` once the branch is merged.
- [ ] `git worktree prune` if any directory was removed by hand.
- [ ] Local `info/exclude` entries cleaned up if the worktree path is gone for good.

---

## Decision guide

| Situation | Do this |
| --- | --- |
| Clean tree, one linear task | Just a branch (`git switch -c`) — no worktree |
| Risky WIP on current branch, need to build something unrelated | Worktree on a new branch |
| Two AI sessions in parallel | One worktree + one branch **each** |
| Any host, portable script | `git worktree add … -b …` + `bun run worktree:provision` (Approach A) |
| A conductor launching supervised workers | `/orca-orchestration` (Orca creates the worktree; `orca.yaml` provisions and audits) |
| Claude Code, want the session moved for you | `EnterWorktree` (base `fresh`), then `bun run worktree:provision` (Approach B) |
| Parallel subagents mutating files | `Agent`/workflow `isolation: "worktree"` |

---

## AI working pattern (this repo)

When an AI session needs isolation from in-progress work on another branch:

1. Create the worktree on a new branch off the strategy's base: Approach A on any host, or the
   host's own tool where it has one (Approach B); rename the branch to convention
   (`git branch -m feat/<slug>`) when the tool derived it.
2. Run `bun run worktree:provision` inside it before anything else.
3. **Move** any untracked WIP into the worktree (it will not be there automatically). Never copy
   `.session/`: cite `<<PRIMARY_ROOT>>/.session/...` by absolute path.
4. Keep the primary repo's `git status` **clean** — verify with `git -C <primary> status`.
5. Hide a worktree nested inside the repo from the primary tree via local `info/exclude`.
6. Do all further work (edits, verifies, commits with the forensic trailers) in the worktree.
7. On completion, commit on the worktree's branch → open its own PR → `bun run worktree:audit
   <wt> --rescue` → remove it (`git worktree remove`, or the harness tool's own remove).
