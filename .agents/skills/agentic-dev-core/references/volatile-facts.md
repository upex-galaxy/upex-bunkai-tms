# Volatile facts in committed prose

> Canon for Critical Rule #17 in `AGENTS.md`. Cited by every skill that writes or reviews committed prose. Two linters enforce the two families a regex can see: `scripts/lint-skills.ts` for `.agents/**` and `AGENTS.md`, and `scripts/lint-docs.ts` (`bun run docs:check`) for `docs/**`, the root `README.md`, `INSTALLER.md` and `CONTEXT.md`, the nested READMEs under `.context/` and `packages/`, the decks and the Pages home.

## 1. The rule

A committed instruction or doc describes the repo the way a contract describes a system: by naming the parts and who owns them, not by copying the current readings off the dashboard. Any sentence whose truth depends on the current contents of another file, of the tracker, of the deploy platform or of an external tool is a **volatile fact**, and a volatile fact in committed prose is a bug with a fuse: it is correct the day it is written, wrong a few weeks later, and read every session by an agent that has no way to tell the two states apart.

The cost is paid twice. Once when a session trusts the stale value: a count of skills that makes the AI stop looking after that many, a line number that now points at a blank line, a dated verification of a branch ruleset that nobody re-ran. And again when a careful session notices the drift and spends a turn reporting it instead of working.

The fix is always the same shape: **replace the value with the name of its owner.** The reader resolves the pointer at read time, so the prose is correct for as long as the owner exists, and when the owner moves, the STALE-PATH check in `scripts/lint-skills.ts` or the path check in `scripts/lint-docs.ts` catches the dead pointer, which no lint can do for a stale number.

## 2. Five categories, one test each

| Category | The test | Owner to name instead |
|---|---|---|
| **Count** | Would a routine commit change this number? | The file or command that counts: `REGISTRY.md` (`bun run skills:registry`), `package.json`, `.mcp.json` |
| **Enumeration** | Does another file already own this list? | That file or constant: `.mcp.json` (servers), `.agents/skills/` + `REGISTRY.md` (skills), `cli/install.ts` (community skills), `.agents/jira-required.yaml` (Jira fields), `SURFACE_ORDER` in `cli/lib/updater-parity.ts` (updater surfaces) |
| **file:line** | Would an unrelated edit above it shift the line? | The file plus a symbol or a heading |
| **Current-state claim** | Does the sentence carry "today", a date, a version, a measurement, or a live ticket / PR number? <!-- volatile-ok: names the word it forbids --> | The behaviour without the qualifier; the dated figure goes to an ADR |
| **Edit-history narration** | Does it tell the reader what the text used to say, or which release introduced a behaviour? | The current behaviour only; the history goes to an ADR, the `CHANGELOG.md` or the commit |

Before and after, one per category:

```text
count          "Four MCP servers"                      -> "the servers `.mcp.json` declares"
enumeration    "10 rows: Instrucciones / Skills / ..."  -> "one row per surface, in `SURFACE_ORDER` (`cli/lib/updater-parity.ts`)"
file:line      "`cli/lib/atlassian-instance.ts:34`"    -> "`resolveAtlassianInstance` in `cli/lib/atlassian-instance.ts`"
current-state  "VERIFIED 2026-08-21 against ruleset X"  -> "`bun run git:policy verify` reconciles it; the dated reading is in ADR-0003"
edit-history   "Since 8.4 the updater does X"          -> "the updater does X" (release history in ADR-0003 / CHANGELOG)
```

## 3. What is stable, and therefore fine

Names that change only by an explicit decision are the vocabulary of the repo, not its state: the `/sprint-development` stage names, the three `[SYNC]` / `[COMMIT]` / `[LOCAL]` tiers, a Critical Rule number, the name of a file, a script or a constant, "three hosts". A stable fact passes all five tests. When in doubt, ask whether a routine commit (a new skill, a new alias, a new MCP server, a synced Jira catalog, a regenerated registry, a dependency bump) could falsify the sentence without anyone meaning to change it. If yes, it is volatile.

## 4. Exemptions: where a snapshot is the point

- **Gitignored files and `.session/**`**: nobody else reads them. The `.context/PBI/` cache is one.
- **Generated artifacts**: the tooling rewrites them (`REGISTRY.md`, the business maps `/project-context` writes under `.context/business/`, `api/schemas/`).
- **ADRs, changelogs and dated reports**: a number "at the time" stays true forever because the date is part of the claim. `.context/ADR/` is exempt by path in both linters.
- **Test fixtures and code constants**: they ARE the value.
- **Example output inside a fenced block or a `<pre>`**: a fake `4/7 PASSED` teaches a format, it does not describe the suite.
- **A dated ledger by design**: a reference whose every row carries its own measurement date and tool version, and whose lifecycle moves a row out when it stops being true. The date is the row's identity, not a stale copy.

## 5. Forensic notes: keep the why, move the figure

A doctrine rule often exists because something was measured: a host that passed an unset `${VAR}` through literally, a ruleset the classic protection endpoint could not see, an updater release that changed what blocks a sync. The reader deserves the WHY, but the figure and its date are current-state claims that age in prose read every session.

The split: the doctrine keeps the why in one sentence with no figure and no date ("measured on all three hosts", "the classic endpoint cannot see a ruleset"), and links the record that holds the number. The record is `.context/ADR/ADR-0003-forensic-measurements-ledger.md` for the boilerplate's own doctrine, or a dated ledger the skill owns. A new measurement that motivates a rule is appended there, never inlined in the rule.

## 6. Decks and pages

User-facing decks and pages are committed too. They may show a current list or a dogfood figure as a teaching example, but the slide says "snapshot" or names its source (the file, the report, the date of the run) so the next reader does not mistake a lesson for an inventory.

## 7. The lint, and the escape hatch

Two families have a regex-visible shape, and the linters report them:

- `FILE-LINE`: a path with a known extension followed by `:N`, `:N-M` or `#LN`, outside fenced blocks and `<pre>` / `<code class="block">`.
- `CURRENT-STATE`: the dating vocabulary ("today", "currently", "as of <year>", "measured <date>", "since <version>", a hand-stamped "Last updated: <date>", a `~Nk tokens` or `N bytes` measurement, a tool version after "as of" / "verified against" or a tool name such as `vercel` / `supabase` / `acli`, and the Spanish equivalents), outside the same blocks and outside the frontmatter. <!-- volatile-ok: names the words it forbids -->

Both are ERROR (`VOLATILE_SEVERITY` in `scripts/lint-skills.ts`, `SEVERITY` in `scripts/lint-docs.ts`) and run inside `bun run repo:check`: a new hit fails the gate as a regression. The staged rollout behind that (warn first, sweep, then block) is recorded in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`.

Counts and enumerations have no regex shape: no pattern can tell a router table from a copied inventory. Those stay a review-time judgement, which is what this reference is for. The one enumeration a script CAN check is the `.agents/instructions/agent-skills-and-mcps.md` §5 skill router: `docs:check` fails when a committed repo skill is missing from it, so the human pages point at `REGISTRY.md` instead of listing skills.

A line that legitimately carries one of the two shapes (a worked example that must show the bad form, a teaching sentence about a forbidden word) is marked on the same line with `volatile-ok: <reason>`, as an HTML comment in HTML and Markdown (`<!-- volatile-ok: teaching example -->`). A dated ledger by design (§4) carries `volatile-ok-file: <reason>` in its first lines and is skipped whole. The reason is mandatory in both forms: an allowlist entry with no reason is the next stale fact.
