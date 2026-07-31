# BK-37 — Spec Compliance Matrix

> Dev-authored (non-Jira). Generated at Stage 3 of `/sprint-development` on 2026-07-31.
> One row per AC scenario from `acceptance-criteria.md`, plus the boundary cases the PO
> confirmed in `business-rules.md`. A PR cannot merge with an `uncovered` row.

**Verdict: 11 / 11 covered. Zero uncovered.**

Legend — `covered` (automated test) · `manual` (live-UI evidence) · `exempt:<reason>` · `review-approved:<reviewer>` · `uncovered`.

| # | AC scenario (Gherkin) | covered_by | Evidence | Status |
|---|---|---|---|---|
| 1 | View a Test's runs newest first, each showing outcome, environment, executor mode, and when it ran | `test:lib/runs/history-isolation.test.ts` "an active member reads their own Test's history newest first" + `manual` | `0038_run_history.sql:135` `order by started_at desc, id desc`; columns rendered `RunHistoryView.tsx` + `RunRow`. Live: 12 rows, all six columns populated, absolute `2026-07-29 11:52` timestamps | covered |
| 2 | Filter history to failed runs only — passed and aborted hidden | `test:lib/runs/history-validation.test.ts` (outcome enum) + `manual` | `0039:159` `p_outcome is null or r.status = p_outcome`. Live: clicked `run-history-filter-failed` → exactly 3 rows, all Failed, foot `runs 1–3 of 3 · Failed only` | covered |
| 3 | Filter matches zero runs → distinct message | `test:lib/runs/history-view.test.ts` (capitalization + branch) + `manual` | `history-view.ts` `runHistoryNoMatchMessage`. Live: passed-only Test + `?outcome=failed` rendered **`No Failed runs found for this Test`** — the PO's 2026-07-21 contract string, ratified over the AC's illustrative phrasing in plan §3.1 | covered |
| 4 | A Test never run → `No runs yet for this Test` | `test:lib/runs/history-view.test.ts` + `manual` | `history-view.ts` `RUN_HISTORY_EMPTY_NEVER_RUN`. Live: 0-run Test rendered the exact string, totals 0/0/0, empty proportion bar | covered |
| 5 | In-progress runs excluded from history | `test:lib/runs/history-isolation.test.ts` "excludes a running Run from BOTH items and totals" + `manual` | `0039:158` and again in the totals subquery `:210`. Live: fixture has 13 runs (12 terminal + 1 running) and the screen shows 12, totals sum to 12 | covered |
| 6 | Load older runs beyond the first page, still newest-first overall | `test:lib/runs/history-isolation.test.ts` (keyset continuity) + `manual` | `0039:154-170` keyset + `limit+1` probe. Live: 55-run Test → 50 rows + `Load older runs`; after click 55 rows, **55 unique row testids** (no dup, no skip), button hidden, foot `runs 1–55 of 55` | covered |
| 7 | Filter stays applied across load-more | `test:lib/runs/history-isolation.test.ts` "filter + pagination composition" | Filter travels with the cursor: `RunHistoryView.tsx` `fetchRunHistory` sets both params; server scopes the keyset page to `p_outcome`. **Not manually reproduced** — no seeded Test has a filtered subset larger than one 50-row page. DB-level assertion is authoritative | covered |
| 8 | Clearing the filter restores the full newest-first list | `manual` | Three clear paths all route through `applyOutcome(null)`: click-again on the active chip, the toolbar `Clear filter`, and the in-empty-state `Clear filter`. Live: filtered → cleared → 12 rows restored | manual |
| B1 | Boundary — exactly 50 runs → no load-more | `test:lib/runs/history-isolation.test.ts` | `0039:191` `v_fetched > v_limit` gate | covered |
| B2 | Boundary — 51 runs → load-more appends exactly 1 | `test:lib/runs/history-isolation.test.ts` | Same probe. Live analogue at 55 runs appended exactly 5 | covered |
| B3 | Tie-break on identical `started_at` | `test:lib/runs/history-isolation.test.ts` "breaks an identical started_at tie by id descending" | Row-comparison predicate `0039:163` + `order by … id desc`. PO-confirmed `id` as the secondary key | covered |

## Security assertions (beyond the AC)

| Assertion | Evidence | Status |
|---|---|---|
| Non-disclosure (INV-3): a foreign-workspace Test and a missing Test are indistinguishable | Both raise `P0002` (`0039:126`, `:135`, and `0025_test_read.sql:53`); the route collapses both to one `404 not_found`. Live: navigating to a Test outside the active workspace rendered the app's generic 404 | covered |
| Actor spoofing blocked | Live probe against the deployed function: a JWT belonging to user A calling with user B's `p_actor_user_id` → `P0002 test_not_found`. The legitimate call (uid == actor) returned 12 items with correct totals | manual |
| Half-supplied cursor rejected, never a silent first page | Live probe: `p_cursor_started_at` without `p_cursor_id` → `45209` | manual |
| No secret, credential, or PII in the diff | Adversarial review pass, explicit no-findings | review-approved:stage-3-reviewer |

## Known verification gaps (declared, not hidden)

1. **AC7 not manually reproduced.** Needs a Test whose filtered subset exceeds 50 rows; the seed does not have one. Covered at the DB layer instead.
2. **The Steps tab's ATC chain was not visually re-rendered after the layout refactor.** No workspace reachable by the available credentials contains a Test with ATCs. Verified instead by reading the diff: the change is a pure header extraction, the tags row and chain blocks are untouched, and every `data-testid` survives. Worth one glance from QA on a Test that has a chain.
3. **Seed data still present.** The live validation seeded 4 Tests and ~70 runs into workspace `Bunkai Smoke QA`, all titled `BK-37 QA Seed%`. They must be purged before this leaves the sprint.

---
_Dev-authored. topic_key `pbi/BK-37/compliance-matrix`._
