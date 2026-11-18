# Skill Resolver Protocol

> Cited by: `agentic-dev-core/references/briefing-template.md` and every workflow skill that dispatches subagents (`sprint-development`, `unit-testing`, `project-foundation`, `project-bootstrap`, `product-management`).
> Companion script: `scripts/build-skill-registry.ts`. Cache file: `.agents/skills/REGISTRY.md`.

## Purpose

A subagent that re-reads every relevant `SKILL.md` before it acts burns tokens redundantly. The orchestrator already knows which skills are in scope, so it pre-extracts their rules and pastes them into the briefing: build a registry once per session, paste compact rules per dispatch. A subagent then trusts a short rules block instead of opening the full SKILL.md, the token cost per dispatch drops by an order of magnitude when several skills overlap, and the briefing stays auditable because it carries the rules the orchestrator itself read.

The protocol also decides what reaches an executor at all. A subagent or worker sees its briefing and the files the briefing names, and does not browse a skill's `references/` on its own. A rule meant to bind an executor is therefore a compact rule (and a component-7 line of the briefing), not only a reference paragraph (`AGENTS.md` §3 "RULE REACHABILITY", full text in `./orchestration-doctrine.md`). A subagent may still read the full SKILL.md when the compact rules are not enough (see "Limits" below).

Nothing in this protocol waits for a person: the orchestrator builds, picks and pastes on its own, so it works the same in a conversation, under a conductor and in an unattended routine.

---

## The protocol

1. **Build or read the registry, once per session.**
   - At the first significant subagent dispatch (the first one where `Skills to load` is non-empty), run `bun scripts/build-skill-registry.ts`. It scans `.agents/skills/*/SKILL.md`, extracts compact rules per skill and writes `.agents/skills/REGISTRY.md`.
   - A skill folder that git ignores (a community skill installed on one machine only) is skipped, so the committed registry is the same on every checkout. Such a skill's rules reach a briefing only through its own `SKILL.md`, named in `Skills to load`.
   - If `.agents/skills/REGISTRY.md` exists and every `SKILL.md` is older than it (by mtime), skip the rebuild and read the cached file.

2. **Inject `## Project Standards (auto-resolved)` into every briefing.**
   - Pick the relevant skills for the dispatch (see "How the orchestrator picks relevant skills").
   - Copy their compact-rule blocks from `.agents/skills/REGISTRY.md` into a section with that title.
   - The section sits between `Context docs` and `Skills to load` in the 7-component briefing template.

3. **The subagent trusts the compact rules.**
   - It treats `## Project Standards (auto-resolved)` as authoritative for the conventions it lists.
   - It reads a full SKILL.md at runtime only when a "Read full SKILL.md when" trigger fires (debugging, a novel scenario) or the briefing says to load the full skill.

---

## Compact rule format

Per skill, the registry stores one block in this shape:

```markdown
## Skill: <slug>

**Purpose**: <1-line distilled from frontmatter description>

**Compact Rules**:

- DO: <imperative>
- DO NOT: <prohibition>
- WHEN <condition>: <action>
- WHEN <condition>: <action>

**Read full SKILL.md when**: <when full read is necessary>
```

Rule provenance, in priority order (see `scripts/build-skill-registry.ts`):

1. **`compact_rules:` frontmatter (authoritative).** Copied verbatim, never capped or truncated. The author owns exactly what subagents see.
2. **Strategy A.** A `## Compact Rules` or `## Standards` body section, carried whole.
3. **Strategy B.** A best-effort extraction of the first 15 bullets, for skills with neither. It is the only capped source.

### Example

```markdown
## Skill: unit-testing

**Purpose**: TDD workflow + test naming + mocking patterns + coverage strategy.

**Compact Rules**:

- DO: write the failing test before the production code (red-green-refactor).
- DO: use AAA (Arrange-Act-Assert) or Given-When-Then naming.
- DO: mock external I/O (HTTP, DB, fs) by injection, with no module-level patching.
- DO NOT: assert on private fields, and keep every test independent.
- WHEN strict_tdd is true: refuse to add production code without a failing test first.
- WHEN testing a pure function: skip mocks and assert directly on input and output.

**Read full SKILL.md when**: introducing a new mocking style not covered above, or when the user disputes a TDD verdict.
```

An authored block is as long as its skill's real rules require. Length is not a reason to cut one: every binding rule is there on purpose (`AGENTS.md` §3 RULE REACHABILITY), so a long block costs briefing tokens and never a rule. A block stamped `(truncated — read full SKILL.md for the rest)` is a Strategy B scrape, and the subagent reads the full SKILL.md.

---

## How the orchestrator picks relevant skills

Apply these per dispatch, in priority order:

1. **Explicit skill mentions in the briefing.** If `Skills to load` lists `/unit-testing`, the registry block for `unit-testing` goes in verbatim.
2. **User-named slugs.** If the user says "use sprint-development for this", include `sprint-development` even when no skill is loaded.
3. **Name match on the Goal and Context.** Scan the dispatch's `Goal` and `Context docs` paths for known skill slugs and include each match (a goal that says "scaffold the bootstrap" includes `project-bootstrap`).
4. **Phase match.** Each SKILL.md frontmatter declares `phase:` (`bootstrap`, `foundation`, `implementation`, and so on). When the orchestrator's current workflow phase matches the briefing's intent, include the skills with that phase.
5. **Context skills: only the aspect the dispatch touches.** A `metadata.kind: context` skill (slug `<aspect>-context`) is injected when the dispatch's Goal, Context docs or touched files name its aspect, by dev surface:
   - a task that writes a migration, changes RLS, seeds data or reasons about an entity's lifecycle gets the data-aspect context skill;
   - one that adds or changes a route handler, the OpenAPI contract or the auth model gets the API-aspect one;
   - one that builds or changes a screen, a CRUD flow or navigation gets the feature-aspect one;
   - a project-owned `<aspect>-context` (`skill-scaffold.md` §3) joins on its own aspect.

   `REGISTRY.md` prints `kind: context` on each one's Source line, and its `description` names the aspect. The shipped business map skills (`business-data-context`, `business-feature-context`, `business-api-context`) go in as their read command, `bun run context:map <slug> --section <id>` for the sections the dispatch touches, never as the HTML path (`business-context-maps.md` §3). Inject the aspects the dispatch touches and no others: a subagent that touches one aspect pays for one. The relevance call is the orchestrator's, so a dispatch that names no aspect gets no context skill. When in doubt, name the aspect in the Goal.
6. **Cap at 5 skills per briefing.** Beyond five the briefing gets noisy. Pick the top 5 by relevance and list the rest under "Other skills available, load on demand:".

A skill that is not matched is not pasted. The subagent can still load any skill at runtime if the registered rules are not enough.

---

## Cache invalidation

Rebuild the registry when any of these is true:

- There is no registry file at `.agents/skills/REGISTRY.md`.
- A `SKILL.md` is newer than the registry (any skill with `mtime > registry.mtime` triggers a full rebuild).
- A new skill directory exists under `.agents/skills/` that the registry does not list, or a listed skill's directory was removed (rebuild and drop the orphan).
- Someone runs `bun scripts/build-skill-registry.ts` explicitly. A manual run always rebuilds.
- A session starts. Re-check these conditions before reusing the cache.

The script is idempotent: re-running it on an unchanged repo produces a byte-identical file.

---

## Limits: what compact rules are not

Compact rules are deliberately incomplete: they cover the imperative skeleton (DO / DO NOT / WHEN) and nothing more. These stay out of them:

- Step-by-step playbooks, troubleshooting and edge cases. They live in the SKILL.md body and `references/*.md` (for example `references/orchestration-doctrine.md` §Error protocol).
- Code examples, tool syntax and CLI flags. Compact rules name conventions, and the syntax lives in the owning skill (for example `playwright-cli/SKILL.md`).
- Cross-skill workflows. A multi-stage flow like "plan → code → review → deploy" is the orchestrator's to compose.
- Project-variable values. `{{PROJECT_KEY}}` or `{{API_URL}}` are resolved by the project-variable system, not the registry.

When a subagent's task reaches any of these, the briefing tells it explicitly to "load the full SKILL.md for `<slug>`". Without that line, the compact rules govern.

---

## Failure modes and fallbacks

| Failure | Fallback |
| --- | --- |
| Registry file missing and build script not present | Inline the briefing without the auto-resolved section and flag the run as degraded. |
| Build script errors (for example malformed frontmatter) | Continue with a stale registry if there is one; otherwise a degraded run as above. |
| Skill has no extractable rules (empty body, no bullets) | The registry emits a stub, `**Compact Rules**: (none extracted — read full SKILL.md)`, and the subagent reads the full file. |
| Strategy B scrape finds more than 15 bullets | The script keeps the first 15 and appends `(truncated — read full SKILL.md for the rest)`. An authored block (frontmatter `compact_rules`, Strategy A section) is never truncated, whatever its length. |
| Subagent dispatched without `## Project Standards` | Acceptable when the dispatch is trivial (a quick lookup). Required for any dispatch that loads one or more skills. |

---

## Practical contract for skill authors

None of this is required. A skill that skips it still works through Strategy A or B.

1. Declare a `compact_rules:` block in the SKILL.md **frontmatter** (a YAML list or a block scalar) holding the skill's binding rules, so what you write is exactly what subagents see. `bun run skills:registry` reports which skills use it (`Source frontmatter:` in its summary).
2. If the same rules also live in a body section (`## Compact Rules` or an anti-patterns list) for human readers, keep frontmatter and body in sync. The frontmatter wins, and a drifted body teaches humans something subagents no longer follow.
3. Open each rule on `DO:`, `DO NOT:` or `WHEN <cond>:`, and keep a `**Read full SKILL.md when**: ...` line in the body so the registry passes the trigger through verbatim.
