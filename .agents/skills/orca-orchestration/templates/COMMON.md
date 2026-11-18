# COMMON RULES FOR EVERY WORKER: read this first, then your own W-<label>.md

> Copy to `.session/orchestration/<slug>/COMMON.md`. Owner: the conductor, written once per run.
> It is written once on purpose: six workers reading six slightly different copies of the same rules
> is the failure this file prevents. Replace every `<…>` before launching anything.

You are a worker session opened by a conductor session. Topology for this run:
**<same checkout at `<ABS>` on branch `<branch>` | your own worktree at `<ABS>` on branch `<branch>`>**.
Other workers run at the same time; the roster in your own brief says who and on what. The conductor
has the owner's authority for this run and reviews everything at the end.

## Non-negotiables

1. Read `AGENTS.md` first, it is the repo's instruction file. The Critical Rules that matter most
   here: #3 (no AI attribution in commits), #5 (never rewrite pushed history), #6 (after code changes
   verify tests, then types, then lint), #7 (read before edit), #10 (read `package.json` for
   scripts, never quote a command from a doc), #13 (no global git discards: never `git restore .`,
   `git checkout -- .`, `git reset --hard`, an untargeted `git stash`, or `git clean`), #14 (UI
   fidelity: reuse the live components), #16 (verify at the destination, never on a receipt). You
   may only restore paths you modified in this session.
2. Touch only the files listed under `## File ownership` in your own brief. If you believe you must
   edit a file you do not own, leave it alone: put the exact edit you wanted in your report, and ask
   the conductor if it blocks you.
3. Make surgical edits. Match the existing style; no refactors of unbroken code, no adjacent
   cleanup, no new abstraction for a single use.
4. Repo artifacts are English (Critical Rule #12): code, comments, docs, skills, commit messages,
   branch names, PR bodies and every external artifact. The conversation may be in another language;
   the repo is not.
5. Never merge, push to a protected branch (Critical Rule #4), deploy, apply a migration to a shared
   database, or post to chat, unless your brief explicitly assigns that step to you. A story worker
   pushes its own branch and opens its own PR, because that is its scope; the merge and the staging
   deploy belong to the conductor.
6. Generated files are generated: do not hand-edit `.agents/skills/REGISTRY.md`, the surfaces
   `bun run agents:compat` writes, Supabase types or `api/schemas/`. If your change makes one stale,
   say so in your report; the conductor regenerates them once, at integration, because N workers
   regenerating one whole-repo file is N conflicting rewrites.
7. Re-read a file before every edit: another worker may have changed a shared neighbour since your
   last read. If an edit fails because the file changed, re-read and retry. Do not overwrite a whole
   file you did not just read.
8. Run the gates before each commit, in the order Critical Rule #6 gives: tests, then types, then
   lint (read `package.json` for the exact script names, and quote none from a doc). If you touched
   skills or docs, also run the skill and docs checks the same file declares.

## Lint traps that will reject your commit

- `SKILL-LITERAL-TOOL`: a literal issue-tracker CLI command inside any skill or reference that is
  not that tool's owner skill. Write `[ISSUE_TRACKER_TOOL] <Verb>: …` pseudocode and point at the
  owner skill for the syntax. Doctrine: `agentic-dev-core/references/skill-composition-strategy.md`.
- `SKILL-HARDCODED-CFID`: no literal custom-field ids outside the tool-owner skills; use the slug
  catalog form.
- `STALE-PATH`: every inline-code path you cite inside a `SKILL.md` or a `references/*.md` must
  exist on disk. Cross-skill cites use the full path, never a `./` relative one.
- `vars:check`: every project variable you write must resolve (`.agents/README.md`).

## Commits

- Stage only your own paths: `git add <path> <path>`. Never `git add -A` or `git add .`, which in a
  shared tree stages another worker's half-finished edit.
- Commit with a pathspec, immediately after staging: `git commit -F <message-file> -- <path> <path>`.
  On `index.lock`, wait about 5 s and retry; do not delete the lock.
- Use a semantic prefix (`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`), the scope in
  parentheses, imperative mood, one responsibility per commit. The body says what and why, in plain
  English.
- No AI attribution of any kind: no `Co-Authored-By`, no harness-branded trailer.
- End every commit message with exactly these two lines and nothing after them:

  ```
  Worktree: <your worktree name, or `primary`>
  Session: <your full name: the session= value of your AGENT IDENTITY line>
  ```

  They are forensics, not attribution: months later they are the only way to tell which of the six
  sessions did the work. Take both values from the `AGENT IDENTITY` line in your context, except
  where the `Name` row of your own brief says `roster only` (a harness that cannot be renamed): then
  `Session:` carries that roster name. Write `unknown` for a value you cannot resolve rather than
  guessing.
- The pre-commit hook runs the repo's gates. Fix what it reports and do not bypass it. Fix a
  rejected commit in a new commit, never by amending the rejected one.

## Your name, and your first action

Your name is the label your prompt token carries, two hyphens, then your own terminal handle
(`TK-123-add-google-auth--term_…`). It is your session name, your tab title and your `Session:`
trailer. Your first action, once this file and your brief are read and before any work, is to rename
your own tab with the exact command in the `Name` row of your own brief
(`orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" …`); with no `ORCA_TERMINAL_HANDLE` in your
environment there is no tab to rename. Your session is named for you (the identity hook on Claude
Code, the conductor elsewhere); do not rename it yourself. Detail:
`.agents/skills/orca-orchestration/references/worker-contract.md` §Session naming.

## Communication with the conductor

Your prompt carries a live dispatch preamble with your `taskId` and `dispatchId` and the exact
message syntax. Use it and nothing else:

- Blocking question: a blocking `ask` to the conductor. If it times out, the question stays
  pending: resume it by its original message id, never ask again.
- A measurement that contradicts the conductor: a blocking `ask` carrying both readings and your
  evidence. This one is mandatory, because complying silently or deviating silently is exactly what
  makes a fleet worth less than a single session.
- Non-blocking question: a plain message, and keep working on everything that does not depend on
  the answer. Asking is not stopping.
- Blocker: an `escalation`, unless you were launched without a dispatch. There the runtime rejects
  it and returns the refusal as a `status` message, so your blocker never arrives. On that path send
  a `status` message whose subject starts with `BLOCKED: `.
- An error, a blocker or a decision you cannot take inside your brief goes to the conductor, never
  to the human, and is never guessed: what `agentic-dev-core/references/decision-protocol.md` §5
  escalates (product behaviour, a new security posture, an irreversible or outward action, what a
  person signs) and every error or blocker you cannot clear, as a blocking `ask`, an `escalation` or
  the `BLOCKED: ` status above. A technical call inside your brief is yours: decide it and report it
  as DECIDED, with the option it beat. Exception: the human typed the request into your own session,
  or your brief grants it in writing; then tell the conductor what was asked and answered (worker
  contract rule 16).
- Finished or stopping: exactly one `worker_done`, with an explicit outcome (`succeeded` or
  `failed`, never a failure stated only in prose), your modified files, and the path of your
  report. Then stop: no new work, no polling, and never close your own terminal.

Run every stage without returning to the prompt until `worker_done` is sent. A stage boundary, a
written artifact and a natural pause are not checkpoints; each stop costs a manual nudge from the
conductor. Work done: `worker_done`. Work blocked: `ask` or the blocker form above. Anything else:
keep going.

Three channels are off limits, and this is not negotiable:

- The harness's own agent-to-agent messaging tool. From a worktree the conductor is not in your
  agent list, and a whole fleet once reported to the wrong sessions this way (G35).
- The harness's user-question prompt, any structured-question tool, and an `mkd` decision deck.
  Nobody is watching them (one such question waited for hours, G36); a pending that needs the human
  goes to the conductor, who relays it.
- Periodic heartbeats. Your injected preamble asks for them; this repo forbids them, because each
  one wakes the conductor to read the word "alive". You send three things and nothing else:
  `worker_done`, `ask`, `escalation`.

## Claims on shared data

Your own brief lists the claims you hold, each with one of three intents: `read`, `write`, or
`enumerate` (a listing on a shared account that exposes your siblings' entities; nothing is mutated,
and nothing about that collection may be asserted on, because its size, contents and ordering belong
to the whole fleet). Everything in that table is already granted: announce it and work. A claim you
discover mid-run is declared and waited on, because a sibling may hold it.

## Your report

Write `<ABS>/.session/orchestration/<slug>/reports/<label>.md` before `worker_done`, with these
sections: `## Summary`, `## Files changed`, `## Commits` (sha + subject), `## Decisions taken` (and
why), `## Verification` (commands + exit codes), `## Left open`. The message body is a summary; the
file is the record, and it is what the conductor hands to the next run.

## Resource hygiene

Close every browser-automation session when you finish, including the ones your subagents opened,
by name: `kill-all` reaches every session on the machine. Run one dev server per worktree. Check free
disk before long work: with a full disk, writing the output fails rather than the command, so you go
mute while believing you reported.

## Where things are

- Skills: `.agents/skills/<slug>/SKILL.md` + `references/`. Shared doctrine:
  `.agents/skills/agentic-dev-core/references/`.
- Project variables: `.agents/project.yaml`. Variable syntax: `.agents/README.md`.
- Tracker catalogs: `.agents/jira-fields.json`, `.agents/jira-workflows.json`,
  `.agents/jira-required.yaml`.
- Story context: the synced Jira cache under `.context/PBI/` (read-only;
  `.agents/instructions/agent-local-context-pbi.md` §9), the dependency edges in
  `.context/dev-roadmap.md`, the design plan for UI stories (`.context/design/master-design-plan.md`).
  CLI: `cli/`.
- Scripts: read `package.json` directly, and quote no command from a doc.
