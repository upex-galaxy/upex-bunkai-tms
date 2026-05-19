# Behavioral Layer — Full Reference

> Loaded on demand. CLAUDE.md §2 holds the compressed version. This file holds the worked examples + scope-note exemption list + working-signals.

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

For exploratory questions ("what could we do about X?", "how should we approach this?"), respond in 2-3 sentences with a recommendation and the main tradeoff. Present it as something the user can redirect, not a decided plan. Don't implement until the user agrees.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

**Scope note** — this rule applies to code authored by the agent within a task. Do **not** collapse the architecture layers of the scaffold (`api/`, `schemas/`, `db/` boundaries in backend; design system structure in frontend) — they are framework architecture, not speculative abstraction.

Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that **your** changes made unused.

**Scope note** — this rule applies to incidental edits during a task. User-invoked regenerative commands and skill phases are EXEMPT — regeneration IS the task. This includes:

- `/project-foundation` (PRD, SRS, Discovery)
- `/design-system` (DESIGN.md generation, including rebrand)
- `/project-bootstrap` (backend + frontend scaffolding)
- `/sync-ai-memory` (project memory + cross-doc consistency + HTML rendered-from sync)
- `/sprint-development` implementation-plan stage
- `/product-management` AC-writing (Gherkin scenarios)

Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code. If you are certain something is unused, delete it completely.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan with explicit checks:

```
1. [Step] → verify: [observable check]
2. [Step] → verify: [observable check]
3. [Step] → verify: [observable check]
```

`verify` = an observable signal that the step actually landed (test passes, file exists, command exits 0, types:check clean). This format **complements** the 6-component subagent briefing in `references/briefing-template.md` — it does **not** replace it. Use this format for thinking-out-loud during execution; use the briefing for delegation.

---

## Working Signals

These guidelines are working if:

- Fewer unnecessary changes in diffs
- Fewer rewrites due to overcomplication
- Clarifying questions come BEFORE implementation rather than after mistakes
- Plans are presented and approved before code is written
- Sub-agent dispatches happen via the 6-component briefing instead of vague hand-offs

---

## Default to writing no comments

Only add a comment when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment wouldn't confuse a future reader, don't write it.

Don't explain WHAT the code does (well-named identifiers already do that). Don't reference the current task, fix, or callers ("used by X", "added for the Y flow", "handles the case from issue #123"), since those belong in the PR description and rot as the codebase evolves.

---

## Communication style

This repo defaults to two combined conversational behaviors. Both apply to every T1 workflow that loads `agentic-dev-core` (sprint-development, project-foundation, project-bootstrap, design-system, testability-guide, product-management, unit-testing, agentic-dev-onboard).

### Caveman compression (default)

If the `caveman` skill is installed user-level, respond in caveman level `full`. See `CLAUDE.md` §1 #13 for the canonical rule. Brief recap:

- Drop articles, fillers, pleasantries.
- Fragments OK. Short synonyms.
- Technical terms exact. Code blocks unchanged. Errors quoted exact.
- Code/commits/PRs/security warnings write normal English (built-in boundary).
- Revert triggers (EN + ES): "normal mode", "habla normal", "stop caveman", "speak normally", "be verbose", "más detallado".

If caveman is not installed, write normal terse English/Spanish per §1 #14 language rule. Caveman is multiplier, not requirement.

### Butler pattern (expandable responses)

Default to a terse headline that answers the user's literal question. Then surface every other topic as atomic bullets — one specific topic per bullet, NEVER aggregated into broad buckets.

- Atomicity over aggregation: 12 specific bullets beats 3 broad ones.
- No artificial cap: bullet count tracks actual information richness.
- Bullet style mirrors caveman: 1-line hook per bullet.
- Headline must stand alone: user got their answer even if they ignore the menu.

Caveman compacts WORDS, butler controls INFORMATION GRANULARITY. They compose.

Full canonical text in `CLAUDE.md` §2 EXPANDABLE RESPONSES.
