# ADR-0014 — Keeping progressive disclosure from eroding: a placement doctrine, one edit procedure, three lint locks and a recall audit

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** Boilerplate owner (upex-galaxy): owner decision B2 of handoff 07 (2026-10-05), "approve all 4 maintenance pieces (decision tree doctrine, single sanctioned instructions mode, 3 lint locks, recall audit) + ADR, both repos". Ported from agentic-qa-boilerplate ADR-0013 (PR #115) by unit b2-d. Where the sanctioned path lives in this repo (a procedure reference, not a skill mode) was decided by the fleet conductor on the worker's question; technical calls inside it are recorded below with the options they beat
- **Tags:** instructions, multi-harness, hooks, lint, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0009 split the project instructions into an always-on `AGENTS.md` (L0), routed sections under `.agents/instructions/` (L1) and the skills' own `references/` (L2), with a prompt hook that names the section a request needs. That gain is a property of how people edit the files, and nothing held it in place:

1. **Nothing said where a sentence goes.** The folder README carried editing rules, but no procedure turned "I need the agent to know X" into "X goes in this file". The shortest path is still pasting a paragraph into `AGENTS.md`, which every host loads on every session; L0 sat at 23 655 B against a 24 576 B ceiling when this ADR was written.
2. **The router was frozen by convention only.** ADR-0009 made its rows request kinds "so the table does not grow with the project"; `instructions:check` proved every row resolves and every section is routed, but accepted any number of new rows.
3. **The router eval ran only under `bun test`.** The labelled set (`cli/lib/fixtures/instruction-router-eval.json`, 54 prompts, recall 100.0% and precision 93.9% before this change) was asserted by `cli/lib/instruction-router.test.ts`. CI runs `bun run test`, but the pre-commit hook did not run `instructions:check` at all (it lived only in `repo:check`), so a `triggers:` edit that lost a route was caught at the earliest in CI.
4. **A new section could ship half-done**: routed and with frontmatter, but with no labelled prompts and no entry in the folder's guide.
5. **Nobody measured whether a route is followed.** The eval proves the hook names the right file; it says nothing about the agent reading it. First measurement on the maintainer's machine for this decision, with the audit below, last 30 days of Claude Code transcripts: the live checkouts carry almost no transcripts yet (3 folders, 5 transcripts, 2 closed routes, both read); with the removed worktrees of this repository included, **7.7%** (7 of 91 closed routes read, 13 still open), most of them from the pre-rename layout and from dispatched workers whose long brief fires six to eight routes in one prompt.

This repository has no `framework-development` skill, which is where the QA twin hosts the edit path as a mode. Its docs follow-through already lives as a procedure reference in `agentic-dev-core` (ADR-0006), cited by every skill that needs it.

## Decision

We will keep the split in place with four pieces, all reached through gates that already run.

1. **A placement doctrine.** `.agents/skills/agentic-dev-core/references/instructions-doctrine.md` is the decision tree for "where does this sentence go": L0 holds only behaviour, a Critical Rule's binding sentence, the LOAD PROTOCOL and router, the orchestration core and the memory triggers; a per-request-kind fact goes in the `agent-*.md` section its router row loads; workflow detail in that skill's `references/`; a project-only fact in `agent-project.md` or a context map. It carries worked examples in this repository's vocabulary.
2. **One sanctioned edit procedure.** The same reference holds the procedure (place, router row = ADR, edit, complete section, verify, measure) that every change to L0, a section, the router or a `triggers:` list runs. `agentic-dev-core` names it in its compact rules, so it reaches every executor through `REGISTRY.md`. Skills whose own flow records a project fact in `agent-project.md` (`project-context`, `project-adoption`, `testability-guide`, `git-flow-master`) keep that one write, follow the doctrine and run `bun run instructions:check`; every other instruction change runs the procedure.
3. **Three locks in `instructions:check`**, errors in the maintainers' copy and warnings in a project (where the README and the eval set are synced, `.context/` is the project's own after the scaffold, and `AGENTS.md` is protected):
   - **Router lock.** `AGENTS.md` carries `<!-- router:lock <fingerprint> <ADR-NNNN> -->` under the router markers, the same line the QA twin uses. The fingerprint is the first 12 hex of the sha256 of the table, header included, cells trimmed and whitespace collapsed (a reflow keeps it, a changed cell does not). The gate fails when the table no longer matches the lock, when the named ADR is not in `.context/ADR/`, and when that ADR does not cite the fingerprint. The escape hatch is the decision itself: write or amend the ADR, run `bun run instructions:check --accept-router ADR-NNNN` (it refuses an ADR that is not on disk, rewrites the lock and prints the fingerprint), cite the fingerprint in the ADR.
   - **Router eval on every run.** The scorer lives in `scripts/lib/router-eval.ts` (`cli/` is import-closed, so `cli/lib/instruction-router.test.ts` keeps its own inline eval). `instructions:check` scores the hook's classifier against the labelled set on every call and fails under the fixture's targets, held at or above floors of recall 95% and precision 80%, or on a label no routed section carries.
   - **Complete section.** Every section but `agent-project.md` ships with frontmatter and a router row (checked already), at least three labelled prompts that expect its `id`, and a row in a new `## Sections` table of `.agents/instructions/README.md`; a README row naming a file that is gone fails too.
4. **A recall audit.** `bun run instructions:audit` reads this machine's Claude Code transcripts and reports, per section and overall against a 90% target, how many injected routes the agent read in the same turn (or had already read in that context). It prints file names and counts only, never transcript text. OpenCode and Codex transcripts are not parsed yet. A monthly routine running it is documented as optional; none is created.

Two repository-specific consequences go with it. The pre-commit gates (`.husky/framework-gates.sh`) run `instructions:check` when the staged set touches the instructions, the hook, the eval set or the ADRs, so the locks bind on the commit, not only in CI. And `--adopt` drops upstream's lock line when it composes an app's `AGENTS.md` (`composeAdoptedL0`): the row it adds is the app's, and the ADR the lock names never travels to an adopted app, so the app starts unlocked and may lock its own table later.

Router fingerprint `387f2c89527c`: the table as ADR-0009 and its follow-ups left it, locked by this ADR.

## Consequences

- **Positive:** the cheapest wrong edit (a new router row, a pasted paragraph, a trigger tweak) now fails on the same commit, with the fix in the message. A `triggers:` regression is caught before any test run. The audit turns "the agent ignores the routes" from an impression into a number per section.
- **Negative / trade-offs:** a legitimate new request kind costs an ADR (or an amendment) and one extra command. The lock line costs about 45 bytes of an L0 that sits close to its ceiling. The eval adds a few milliseconds to every `instructions:check`. The README index is one more place to touch when a section is added, kept honest by the lint. The audit's notion of a read is a heuristic (the `Read` tool, or `Bash` with a read verb naming the file); a section read by a subagent does not count, by design, because it never reached the routed context. The edit path has no invocation name of its own here (no `/skill mode`): it is reached through the doctrine reference, the README, the `agent-context-map.md` row and the `agent-harnesses.md` pointer.
- **Neutral / follow-ups:** the low measured recall is a separate problem this ADR does not solve; candidates are fewer routes per long prompt (precision on real briefs) and a stronger cue in the `ROUTE:` line, each measured with the audit before and after.

## Alternatives considered

- **A new skill, or a mode on `agentic-dev-core`, as the sanctioned path (the QA twin's shape is a `framework-development` mode).** Rejected: a new skill is a whole new surface (registry block, skill table, context-map row, docs) for a text-edit procedure, and a mode on `agentic-dev-core` breaks its own contract ("does NOT orchestrate workflows"). A procedure reference named by a compact rule is how this repository already hosts the docs follow-through.
- **Lock the router through the commit message (an `ADR-NNNN` citation checked by `commit-msg`).** Rejected: pre-commit runs before the message exists, `commit-msg` is warn-only by contract here, a squash merge rewrites the message, and CI never sees one. A fingerprint the ADR must cite survives all four.
- **Run the eval only when `triggers:` changed against `HEAD`.** Rejected: it needs a base and silently skips when `HEAD` is the change itself; it also misses `paths:` and router edits that move routing. Running the whole set costs less than reading the old file from git.
- **A committed router lock file under `scripts/` or `.agents/`.** Rejected: those are synced downstream, where the project owns its router; the lock belongs next to the table it locks, in the protected `AGENTS.md`.
- **Count any mention of the file in a tool call as a read in the audit.** Rejected: `git add`, `sed -i` and a `grep` of one line do not put the section in the context; the audit would overstate recall.

## References

- `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md` (the split this ADR protects)
- `.agents/skills/agentic-dev-core/references/instructions-doctrine.md` (decision tree and procedure)
- `scripts/lint-instructions.ts` (`lintLock`, `lintEval`, `lintComplete`, `acceptRouter`), `scripts/lib/instructions.ts` (`routerFingerprint`, `routerLock`, `readmeSectionRows`), `scripts/lib/router-eval.ts`
- `scripts/instructions-audit.ts`, `scripts/lib/instructions-audit.ts`
- `.agents/instructions/README.md` (`## Sections`, the locks), `.husky/framework-gates.sh` (the pre-commit gate), `cli/lib/adopt-app-context.ts` (`composeAdoptedL0`)
- Twin decision: agentic-qa-boilerplate ADR-0013 (PR #115)
