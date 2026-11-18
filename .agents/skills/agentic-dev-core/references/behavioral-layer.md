# Behavioral layer: full reference

> Loaded on demand. `AGENTS.md` §2 holds the compressed version. This file holds the worked examples, the scope-note exemption list, the bulk-edit procedure and the working signals.

These guidelines favor caution over speed. For trivial tasks, use judgment.

---

## 1. Think before coding

**Do not assume, do not hide confusion, surface tradeoffs.**

- State your assumptions explicitly. If you are uncertain, ask.
- When several interpretations exist, present them instead of picking one silently.
- If a simpler approach exists, say so, and push back when warranted.
- If something is unclear, stop, name what is confusing and ask.

For exploratory questions ("what could we do about X?", "how should we approach this?"), answer in 2-3 sentences with a recommendation and the main tradeoff. Present it as something the user can redirect, not a decided plan, and do not implement until the user agrees.

---

## 2. Simplicity first

**Write the minimum code that solves the problem, with nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability nobody requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

**Scope note.** This rule applies to code the agent authors within a task. Keep the architecture layers the app already has: on a scaffolded project the `api/`, `schemas/` and `db/` boundaries in backend and the design-system structure in frontend, on an adopted app whatever layering its code shows under `stack.app_root`. They are framework architecture, not speculative abstraction. The reverse holds too: do not impose the scaffold's layers on an app that does not have them.

Skip error handling, fallbacks and validation for scenarios that cannot happen. Trust internal code and framework guarantees, and validate only at system boundaries (user input, external APIs). When you can simply change the code, do not add feature flags or backwards-compatibility shims.

---

## 3. Surgical changes

**Touch only what you must, and clean up only your own mess.**

- Leave adjacent code, comments and formatting alone.
- Do not refactor things that are not broken.
- Match the existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it instead of deleting it.
- Remove the imports, variables and functions that your changes made unused.

**Scope note.** This rule applies to incidental edits during a task. User-invoked regenerative commands and skill phases are exempt, because regeneration is the task. The exempt list:

- `/project-foundation` (PRD, SRS, Discovery)
- `/design-system` (DESIGN.md generation, including rebrand)
- `/project-bootstrap` (backend and frontend scaffolding)
- the docs follow-through (`docs-follow-through.md`: cross-doc consistency and standalone-HTML text patches)
- the `/sprint-development` implementation-plan stage
- `/product-management` AC writing (Gherkin scenarios)

Skip backwards-compatibility hacks such as renaming unused `_vars`, re-exporting types or leaving `// removed` comments. When you are certain something is unused, delete it completely.

---

## 4. Goal-driven execution

**Define success criteria and loop until they are verified.**

Turn a task into a verifiable goal:

- "Add validation" becomes "write tests for invalid inputs, then make them pass".
- "Fix the bug" becomes "write a test that reproduces it, then make it pass".
- "Refactor X" becomes "make sure tests pass before and after".

For multi-step tasks, state a brief plan with an explicit check per step:

```
1. [Step] → verify: [observable check]
2. [Step] → verify: [observable check]
3. [Step] → verify: [observable check]
```

`verify` is an observable signal that the step landed: a test passes, a file exists, a command exits 0, `types:check` is clean. This format complements the 7-component subagent briefing in `references/briefing-template.md` and does not replace it. Use it to think out loud during execution, and use the briefing to delegate.

---

## 5. Search and bulk edit

**Locate before reading, script repeated edits, verify every form of what changed.**

Locating:

- Run `git grep -n` or `rg -n` before opening a file.
- Count before displaying (`| wc -l`), and never let `| head` decide what exists.
- Read only the range around each hit. Read a file over about 300 lines whole only when it is the core of the answer.
- Stop once the chain from entry point to effect is complete.

A path or name that changes in many files is never edited by Read and Edit file by file. Follow these steps in order:

1. Inventory with two counts. The literal count is `git grep -n -F '<old>' | wc -l`. The variant count replaces each separator with `[^A-Za-z0-9_]{1,6}`, escapes the leading dot and changes nothing else (for `.agents/hooks`, `git grep -n -E '\.agents[^A-Za-z0-9_]{1,6}hooks' | wc -l`, which also catches `a/b`, `'a', 'b'`, `a\\b` and `a\/b`). When the variants outnumber the literals, `| grep -v -F '<old>'` lists the sites a literal replace would miss.
2. Decide the exclusions before replacing, and put them inside the command. Exclusions are text that keeps the old value: ADR history, changelogs, legacy constants. For example: `git mv <old> <new> && git grep -lz -F '<old>' -- . ':!<excluded>' | xargs -0 perl -pi -e 's#\Q<old>\E#<new>#g'`. Use `perl -pi`, not `sed -i`, because `sed -i` differs between macOS and Linux.
3. Fix each extra site from step 1 (a scripted replace, or Edit when there are few), then re-run both counts. Only the planned exclusions may remain.
4. Finish with tests, because a lint or type gate is not a test run: `bun test <dir>` for every top-level directory with a touched `.ts` file, and `bun test` inside every touched `packages/<name>`. Report the leftovers per form and the test result.

---

## Working signals

These guidelines are working when you see:

- fewer unnecessary changes in diffs;
- fewer rewrites caused by overcomplication;
- clarifying questions before implementation instead of after mistakes;
- plans presented and approved before code is written;
- sub-agent dispatches that use the 7-component briefing instead of vague hand-offs;
- for PM Voice, fewer "what does that mean?" follow-ups, faster sign-off on reported work, and headlines that paste into Slack or Jira without rewriting;
- for Visual Mapping, users who grasp the impact at a glance and paste tables or diagrams into docs without redrawing them.

---

## Default to writing no comments

Add a comment only when the why is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment would not confuse a future reader, do not write it.

Do not explain what the code does, since well-named identifiers already do that. Do not reference the current task, fix or callers ("used by X", "added for the Y flow", "handles the case from issue #123"): that belongs in the PR description and rots as the codebase evolves.

---

## Communication style

This repo combines two conversational behaviors by default. Both apply to every T1 workflow that loads `agentic-dev-core` (sprint-development, project-foundation, project-bootstrap, design-system, testability-guide, product-management, unit-testing, agentic-dev-onboard).

### Concision without a mode plugin

Concision comes from the Butler pattern and PM Voice below, plus the user-level reply rules (`## Replies`) and the `humanizer` skill. No communication-mode plugin is assumed or recommended. Canonical rule: `AGENTS.md` §1 #11. In short:

- Terse by default: no filler, no pleasantries, no restating the question.
- Technical terms are exact, code blocks are unchanged and errors are quoted exactly.
- Code, commits, PRs and security warnings are always written in full sentences.
- When the user asks for more detail ("be verbose" or a clear equivalent), give it for that thread.
- Reply language follows §1 #12.

### Butler pattern (expandable responses)

Open with a terse headline that answers the user's literal question. Then surface every other topic as an atomic bullet, one specific topic per bullet, never aggregated into broad buckets.

- Atomicity over aggregation: 12 specific bullets beat 3 broad ones.
- No artificial cap: the bullet count tracks the actual information.
- Bullet style: a 1-line hook per bullet (`topic: fragment`).
- The headline stands alone, so the user has the answer even when they ignore the menu.

Example (sprint-development closing): the headline "Sprint shipped, 12 files, deploy live", then atomic bullets per file, change, flag, test and rollback step, not three buckets like "Code", "Tests" and "Deploy".

The full canonical text is in `AGENTS.md` §2 EXPANDABLE RESPONSES.

### PM Voice (default register)

The rules live in `AGENTS.md` §2 PM VOICE. The same work in each register:

- Senior-dev register (avoid): "Refactored `useAuthState` to memoize the Supabase session subscription and moved the listener into a `useEffect` with cleanup."
- PM Voice (use): "App stops doing extra background work when users navigate between private screens: should feel lighter." The bullet menu underneath mixes UX impact, file paths and follow-ups, each at its own register.

### Visual mapping

The rule (prefer a visual when content maps naturally, where to place it, when to skip it) lives in `AGENTS.md` §2 VISUAL MAPPING. Which visual fits which content:

- Tables (`| col | col |`): comparisons (A vs B, before and after), key/value mappings (old name to new name), counts and metrics.
- ASCII flow diagrams (`A ──→ B ──→ C`): sequences, pipelines, propagation paths.
- Trees (`├── └──`): hierarchies, file structure, taxonomy.
- Boxes (`┌──┐ │ │ └──┘`): architecture components, system maps, state containers.
- State machines (labelled arrows between states): workflows, transitions, lifecycles.

**Rendering safety.** When you are unsure of the target terminal, prefer plain ASCII (`+--+`, `->`, `|`) over Unicode box-drawing (`┌──┐`, `→`). Markdown tables render in most agent UIs but degrade in raw terminal output, so judge per channel.
