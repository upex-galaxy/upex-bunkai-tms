# Volatile facts in committed prose

> Canon for Critical Rule #17 in `AGENTS.md`, cited by every skill that writes or reviews committed prose. Two linters enforce the families a regex can see: `scripts/lint-skills.ts` for `.agents/**` and `AGENTS.md`, and `scripts/lint-docs.ts` (`bun run docs:check`) for `docs/**`, the root `README.md`, `INSTALLER.md` and `CONTEXT.md`, the nested READMEs under `.context/` and `packages/`, the decks and the Pages home.

## 1. The rule

A committed instruction or doc describes the repo the way a contract describes a system: it names the parts and who owns them, and does not copy the current readings off the dashboard. A sentence whose truth depends on the current contents of another file, of the tracker, of the deploy platform or of an external tool is a **volatile fact**. It is correct the day it is written, wrong a few weeks later, and read every session by an agent that cannot tell the two states apart.

The cost is paid twice. A session trusts the stale value: a count of skills that makes the AI stop looking after that many, a line number that points at a blank line, a dated verification of a ruleset nobody re-ran. Or a careful session notices the drift and spends a turn reporting it instead of working.

The fix has one shape: **replace the value with the name of its owner.** The reader resolves the pointer at read time, so the prose stays correct as long as the owner exists. When the owner moves, the STALE-PATH check in `scripts/lint-skills.ts` or the path check in `scripts/lint-docs.ts` catches the dead pointer. No lint can do that for a stale number.

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

A name that changes only by an explicit decision is the vocabulary of the repo, not its state: the `/sprint-development` stage names, the three `[SYNC]` / `[COMMIT]` / `[LOCAL]` tiers, a Critical Rule number, the name of a file, a script or a constant, "three hosts". When in doubt, ask whether a routine commit (a new skill, a new alias, a new MCP server, a synced Jira catalog, a regenerated registry, a dependency bump) could falsify the sentence without anyone meaning to change it. If it could, the sentence is volatile.

## 4. Exemptions: where a snapshot is the point

- **Gitignored files and `.session/**`.** Nobody else reads them. The `.context/PBI/` cache is one.
- **Generated artifacts.** The tooling rewrites them (`REGISTRY.md`, the business maps `/project-context` writes under `.context/business/`, `api/schemas/`).
- **ADRs, changelogs and dated reports.** A number "at the time" stays true because the date is part of the claim. `.context/ADR/` is exempt by path in both linters.
- **Test fixtures and code constants.** They are the value.
- **Example output inside a fenced block or a `<pre>`.** A fake `4/7 PASSED` teaches a format and does not describe the suite.
- **A dated ledger by design.** Every row carries its own measurement date and tool version, and a row leaves when it stops being true. The date is the row's identity.

## 5. Forensic notes: keep the why, move the figure

A doctrine rule often exists because something was measured: a host that passed an unset `${VAR}` through literally, a ruleset the classic protection endpoint could not see, an updater release that changed what blocks a sync. The reader deserves the why, but the figure and its date are current-state claims that age in prose read every session.

So the doctrine keeps the why in one sentence with no figure and no date ("measured on all three hosts", "the classic endpoint cannot see a ruleset") and links the record that holds the number: `.context/ADR/ADR-0003-forensic-measurements-ledger.md` for the boilerplate's own doctrine, or a dated ledger the skill owns. A new measurement that motivates a rule is appended there, never inlined in the rule.

## 6. Decks and pages

Decks and pages are committed too. A current list or a dogfood figure is fine as a teaching example when the slide says "snapshot" or names its source (the file, the report, the date of the run).

## 7. The lint, and the escape hatch

Two families have a shape a regex can see, and the linters report them:

- `FILE-LINE`: a path with a known extension followed by `:N`, `:N-M` or `#LN`, outside fenced blocks and `<pre>` / `<code class="block">`.
- `CURRENT-STATE`: the dating vocabulary ("today", "currently", "as of <year>", "measured <date>", "since <version>", a hand-stamped "Last updated: <date>", a `~Nk tokens` or `N bytes` measurement, a tool version after "as of" / "verified against" or a tool name such as `vercel` / `supabase` / `acli`, and the Spanish equivalents), outside the same blocks and outside the frontmatter. <!-- volatile-ok: names the words it forbids -->

Both are ERROR (`VOLATILE_SEVERITY` in `scripts/lint-skills.ts`, `SEVERITY` in `scripts/lint-docs.ts`) and run inside `bun run repo:check`, so a new hit fails the gate. The staged rollout behind that is recorded in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`.

Counts and enumerations have no regex shape, since no pattern can tell a router table from a copied inventory. They stay a review-time judgement, which is what this reference is for. The one enumeration a script can check is the `.agents/instructions/agent-skills-and-mcps.md` §5 skill router: `docs:check` fails when a committed repo skill is missing from it, so human pages point at `REGISTRY.md` instead of listing skills.

A line that legitimately carries one of the two shapes (a worked example that must show the bad form, a teaching sentence about a forbidden word) is marked on the same line with `volatile-ok: <reason>`, as an HTML comment in HTML and Markdown (`<!-- volatile-ok: teaching example -->`). A dated ledger by design (§4) carries `volatile-ok-file: <reason>` in its first lines and is skipped whole. Both forms need a reason, because an allowlist entry without one is the next stale fact.
