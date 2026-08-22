# BUG: jira:sync-issues --include-comments silently drops all comments for Bug and Improvement types, blinding every routine that reads the PBI cache

**Jira Key:** [BK-502](https://jira.upexgalaxy.com/browse/BK-502)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Dev
**Fix Type:** Bugfix

---

## Description

## Summary

`bun run jira:sync-issues get <KEY> --include-comments` ***silently ignores the ****`--include-comments`**** flag for ****`Bug`**** and ****`Improvement`**** work types***. The command reports success, writes the issue file, and drops every comment. `Defect` is unaffected.

Every automated routine in this repo reads the local `.context/PBI/` cache to decide whether a ticket has an open question, a QA rejection, or a published ruling. For `Bug` and `Improvement` that read is blind, and it fails ***silently*** — the cache looks complete.

## Expected Result

`CLAUDE.md` §9 states the contract verbatim:

> ***DETAILED READS via the script*** (NOT `acli view` — that returns null for custom fields): `bun run jira:sync-issues get <KEY> --include-comments` → one issue, ALL custom fields + comments → read the generated `.md`.

"ALL custom fields ***+ comments***", for any work type the script accepts.

## Actual Result

For `Bug` and `Improvement`, comments are never fetched and never written. No warning, no error, exit 0.

## Steps to reproduce

```
bun run jira:sync-issues get BK-176 --include-comments
```

Raw output:

```
Synced: 0 epic(s), 0 story(ies), 1 bug(s), 0 defect(s), 0 improvement(s), 0 test(s), 0 tech-story(ies), 0 tech-debt(s)
Files created:  0
Files updated:  1
Files skipped:  0
Duration:       1.2s
✔ Sync completed
```

The generated file contains zero comment content:

```
grep -c -i "comment" .context/PBI/bugs/BUG-BK-176-account-settings-sign-out-client-side-redirect-to-.md
0
```

But the ticket genuinely has three comments:

```
acli jira workitem comment list --key BK-176 --paginate --json | jq '.total'
3
```

Control: `Defect` work items (`coverable: true`) do produce a populated `comments.md`.

## Root cause

`scripts/sync-jira-issues.ts`, `syncStandaloneIssue()` (~line 2848). It routes to `syncCoverableStandalone()` only when `entry.coverable` is true (~2869-2871). That coverable path is the one that honours `options.includeComments` and calls `fetchComments()` (~2833-2836).

Non-coverable types fall through to a plain branch (~2874-2889) that ***never references ****`options.includeComments`**** and never calls ***`fetchComments()`. `fetchComments()` has only two call sites in the whole script: `syncStory()` (~2181) and `syncCoverableStandalone()` (~2833).

Which types land in the broken branch is set by `.agents/jira-required.yaml`:

- `bug: coverable: false` — explicit, line 534
- `improvement:` — no `coverable:` key at all, so it defaults false
- `defect: coverable: true` — line 698, which is why Defect works

`routeIssueByKey()` (~2893-2911), the function `get <KEY>` actually calls, dispatches every non-Epic/non-Story issue straight into `syncStandaloneIssue()`.

## Impact

The flag is accepted and ignored, so callers cannot tell the data is missing — this is a silent-corruption defect, not a visible failure.

Six of the nine currently-open defect-class tickets are `Bug` or `Improvement` (BK-176, BK-182, BK-200, BK-265, BK-400, BK-401), so their comment trails are invisible to any tooling trusting the cache. This is not theoretical: the two highest-value findings in the 2026-08-17 audit — BK-400's "activation still pending, cross-device magic-link sign-in still broken in production today" and BK-466's two named-but-unfiled follow-ups — live in comments that the cache does not contain. A `story` run on 2026-08-16 hit two false blockers traceable to the same blind read.

Unticketed since 2026-08-09.

## Suggested fix

Honour `options.includeComments` in the non-coverable branch of `syncStandaloneIssue()`, calling `fetchComments()` the way `syncCoverableStandalone()` already does, and emit the comment content into the single-file layout `content: single` produces. Failing that, make the flag error loudly when it cannot be satisfied — silence is what makes this expensive.

## Filing provenance

Filed by the scheduled `bug` delivery routine under the `autonomous-delivery` skill's citation gate (`SKILL.md:45`, anti-pattern A28). All four citation limbs recorded: live reproduction above with raw output; two differently-worded backlog searches (`summary ~ "sync-jira-issues"` and `summary ~ "comments"` scoped to Bug/Defect/Improvement/Tech Story) each returning zero matches; root cause at `scripts/sync-jira-issues.ts:2874-2889` with the routing key at `.agents/jira-required.yaml:534`; expected behaviour quoted from `CLAUDE.md` §9. Per A28 the filing run may not implement this defect.

---

## Metadata

- **Created:** 8/17/2026
- **Updated:** 8/18/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
