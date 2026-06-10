# Sprint 2 — In-Sprint Development Tracker

> Purpose: track dev progress per ticket; cross-ticket aggregate for AI session resume.
> Sprint: 2 (Jira: "Bunkai (69) Sprint 2", id 339, board 7) | Tech Lead: Ely | Window: 2026-06-09 → 2026-07-06 | Last Updated: 2026-06-10
> Goal: "Finalizar un Producto Funcional con Módulos de Story, Test, ATC y Accounting."
>
> **Authoritative build order (bug waves + story frontier):** `.context/PBI/sprint-sequence.md`.
> **Sprint 1 history:** `.context/reports/SPRINT-1-DEVELOPMENT.md` (closed 2026-06-09).

## Board Summary (2026-06-10)

| Bucket | Count | Dev Relevant |
| ------ | ----- | ------------ |
| Bugs Open | 20 | **YES — Sprint 2 starts here** (1 Highest · 2 High · 16 Medium · 1 Low) |
| Improvements Open | 2 | BK-97 (Medium) · BK-69 (Low) |
| Stories Ready For Dev | 11 | YES — frontier after Wave 1 |
| Stories BLOCKED | 4 | BK-6 / BK-10 / BK-16 / BK-18 — 2 unblock via bug fixes (BK-83, BK-99+100) |
| Stories in QA pipe (RFQA / In Test / SLQA) | 11 | NO — QA hands |
| Stories Backlog | 6 | Pull later (BK-32, BK-35–39) |
| QA Approved | 1 | BK-98 |
| Test artifacts (Test/Plan/Execution) | 6 | NO — QA-owned |
| Total Sprint 2 | 62 | |

## Development Queue (Priority Order)

### In-Flight — Active Work

| # | Ticket | Type | Title | Priority | Owner | Impl Plan | PR | Status |
| - | ------ | ---- | ----- | -------- | ----- | --------- | -- | ------ |
| — | — | — | (none in flight — Wave 1 complete; next: Wave 2 BK-62/60/61) | — | — | — | — | — |

### Queue — Wave 1 CRITICAL bugs (build in this order)

| # | Ticket | Priority | Title | Unblocks |
| - | ------ | -------- | ----- | -------- |
| 1 | BK-84 | Highest | PAT bearer 401 on Imports/Projects/Modules/Tokens routes (requireAuth regression) | QA of 4 route families; BK-92/93 likely dups |
| 2 | BK-83 | High | POST /me/active-workspace response missing workspace fields | Story BK-6 |
| 3 | BK-99 | High | MarkdownEditor 50 KB limit not enforced on submission | Story BK-16 (with BK-100) |
| 3b | BK-100 | Medium | MarkdownEditor 90% capacity warning missing | Pair with BK-99 (same component) |

### Queue — Wave 2 (invite integrity, BK-5)

| # | Ticket | Title |
| - | ------ | ----- |
| 4 | BK-62 | Role overwrite on accept — upsert demotes existing owner/member |
| 5 | BK-60 | No uniqueness check vs active members in POST /invites |
| 6 | BK-61 | No uniqueness check vs pending invites |

### Queue — Wave 3 (remaining Medium)

Dedup DONE 2026-06-10 (user-authorized): BK-54/55/56 closed as dups of BK-51/52/53; BK-92/93 closed as dups of BK-84 — all 5 linked Duplicate, commented, root_cause=Code Error (transition validator requires it).
Then: BK-51 (reserved slugs) · BK-52 (route not workspace-scoped) · BK-53 (CJK names) · BK-67 (depth-5 toast) · BK-57/59/58 (tech-debt trio).

### Pipeline — Wave 4 simple bugs + story frontier (later)

Bugs/improvements: BK-68 (Low) · BK-69 (Low) · BK-97 (ADR-0001 follow-up, story-sized).
Stories: BK-3, BK-20, BK-22, BK-23 → BK-27 → BK-28/33 → BK-34 · Account cluster BK-86→87→88/89→90. Full order in `sprint-sequence.md`.

### Done — This Sprint

| Ticket | Title | Owner | PR | Merged | Staging | Prod | Notes |
| ------ | ----- | ----- | -- | ------ | ------- | ---- | ----- |
| BK-84 | PAT bearer 401 on member routes (requireAuth) | Ely | — (already fixed by 226fc9d, PRs #28/#29 era ADR-0001) | 2026-06-08 | 2026-06-08 | — | **Already-fixed case**: reported 2026-06-07, structurally fixed 2026-06-08 by unified auth gateway (ADR-0001). Live re-verified on staging 2026-06-10 (8-route matrix, 0×401). Jira → Ready For QA, root_cause=Code Error, fix=Bugfix, fix-doc comment posted. Assign-to-reporter failed (no permission). BK-92/93 dup-closure PENDING user authorization. |
| BK-83 | active-workspace switch response missing {id, slug, name, role} | Ely | #32 | 2026-06-10 | 2026-06-10 | — | Ready For QA. Root cause: handler never queried workspace details/role. Flat superset response (non-breaking); OpenAPI updated. Staging smoke green: 200 with all 4 fields (role=owner). Unblocks BK-6 AC1. Fix-doc comment 11483. |
| BK-99 + BK-100 | MarkdownEditor 50 KB cap not enforced + 90% warning never fired | Ely | #33 | 2026-06-10 | 2026-06-10 | — | Both Ready For QA. Single root cause: KiB/KB mismatch — all cap sites used 50*1024 (51,200) vs the 50,000-byte AC5 contract; submit gate + amber warning already existed but never fired at QA's thresholds. Constants → 50,000, display /1000, forms import shared constants, 4 regression tests (184/184). Staging smoke: 51,000 + 50,500-byte POSTs → 422 description_too_long. Unblocks BK-16. |

### Blocked

| Ticket | Owner | Blocking | Since | Decision Pending |
| ------ | ----- | -------- | ----- | ---------------- |
| BK-6 (story) | — | bug BK-83 | 2026-06-09 | none — fix in Wave 1 |
| BK-16 (story) | — | bugs BK-99 + BK-100 | 2026-06-09 | none — fix in Wave 1 |
| BK-18 (story) | — | relates BK-96 (already Closed) | 2026-06-09 | ask QA to re-check/unblock |
| BK-10 (story) | — | QA sequencing (BK-9 In Test) | 2026-06-09 | QA-side, no dev action |

## Sprint 2 Stats

| Metric | Value |
| ------ | ----- |
| Total Sprint Tickets | 62 |
| Open bugs at sprint start | 20 (+2 improvements) |
| Bugs fixed | 0 |
| Stories merged this sprint | 0 |
| Staging-deployed | 0 |
| Prod-deployed | 0 |

## Operational Notes (carry-over from Sprint 1 — still honor)

1. **Jira site = `upexgalaxy69`** — verify `acli jira auth status` before any Jira op.
2. **Custom fields** via REST or `--fields '*all'`. Story Points = `customfield_10035` (NOT allowed in `--fields` on search — read via REST/view).
3. **Jira Story workflow auto-transitions on PR open/merge** (confirmed BK-18). Bug workflow: verify on first bug fix.
4. **Supabase MCP** (project `fmbpikzpkafptqximhxn`); migrations via `apply_migration`, then `bun run types:gen` + patch `lib/types.ts`.
5. **Solo-owner merge** to `staging`: `gh pr merge <N> --merge --admin --delete-branch`.
6. **Pre-push** runs `repo:check`; **tests** = `bun test`; **OpenAPI** regen = `bun run openapi:gen`.
7. Route pattern mirror: `app/api/v1/workspaces/[id]/projects/route.ts` / `app/api/v1/projects/[id]/modules/route.ts` (cookie + RLS, hybrid error model).
8. **Design fidelity (Rule #15)**: any UI work → read `.context/design/master-design-plan.md` first.

## Session Log

### 2026-06-10 — Sprint 2 dev batch started (bug-first)
- Read live board state (62 items, sprint 339). Sequenced bug-fix waves into `sprint-sequence.md`; closed Sprint-1 tracker; created this tracker.
- Identified BK-92/93 as likely dups of BK-84 and BK-54/55/56 as dups of BK-51/52/53 (created-by BK-8 link confirms the latter family).
- Next: `/sprint-development` on BK-84 (Highest).
