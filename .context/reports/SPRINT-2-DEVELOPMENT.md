# Sprint 2 — In-Sprint Development Tracker

> Purpose: track dev progress per ticket; cross-ticket aggregate for AI session resume.
> Sprint: 2 (Jira: "Bunkai (69) Sprint 2", id 339, board 7) | Tech Lead: Ely | Window: 2026-06-09 → 2026-07-06 | Last Updated: 2026-06-24
> Goal: "Finalizar un Producto Funcional con Módulos de Story, Test, ATC y Accounting."
>
> **Authoritative build order (bug waves + story frontier):** `.context/PBI/sprint-sequence.md`.
> **Sprint 1 history:** `.context/reports/SPRINT-1-DEVELOPMENT.md` (closed 2026-06-09).

## Board Summary (2026-06-24)

| Bucket | Count | Dev Relevant |
| ------ | ----- | ------------ |
| Bugs Open | 0 | **CLEARED** — all 16 fixed + 5 dup-closed in Sprint-2 bug waves (now Ready For QA / QA-side) |
| Improvements Open | 1 | BK-97 (Medium, story-sized — deferred to planning session) |
| Stories Ready For Dev | ~9 | YES — all reassigned to Ely 2026-06-24: BK-36 · BK-39 · BK-3 · BK-21 · BK-87 · BK-38 · BK-88 · BK-90 · BK-89. **Many are mockup/contract gated** (BK-87/88/90/38 🔒 mockup; BK-21 contract-unratified; BK-89 open Dev contract). Cleanly workable now: **BK-36, BK-39, BK-3**. |
| Stories Ready For QA (dev done, awaiting QA) | 5 | NO — QA hands: BK-148 · BK-22 · BK-14 · BK-23 · BK-20 |
| Stories in Estimation | 1 | BK-35 Mark step pass/fail — re-estimated 1→5 SP, blocked by Q1 (PO) + Q5 (Dev) |
| Stories Backlog | — | BK-37 Run History (unrefined, no mockup, no ATP) |
| QA Approved | ~18 | BK-98 · BK-27 · **BK-34 (released Runs tail)** · BK-33 · BK-86 · BK-147 · BK-19 · BK-18 · BK-17 · BK-9 · BK-10 · BK-11 · BK-8 · BK-5 · BK-6 · BK-15 · BK-16 |
| Test artifacts (Test/Plan/Execution) | 6 | NO — QA-owned |
| Total Sprint 2 | 62 | |

## Development Queue (Priority Order)

### In-Flight — Active Work

| # | Ticket | Type | Title | Priority | Owner | Impl Plan | PR | Status |
| - | ------ | ---- | ----- | -------- | ----- | --------- | -- | ------ |
| — | — | — | (none in flight — ALL bug waves complete + 6-story ATC/Test frontier shipped. Recommended next sequence: **BK-33 → BK-34 → BK-86 → BK-3**, see Pipeline below) | — | — | — | — | — |

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

### Pipeline — Story frontier (recommended sequence)

ATC/Test wave + Runs gate SHIPPED (see Done table): BK-27 (gate) → BK-20/22/23 → BK-28/32 → BK-33 → BK-34 (Runs-tail gate, QA Approved) + BK-86. Live linear order now:

1. **BK-36** Abort run — workable now off the BK-34 gate.
2. **BK-39** Finish run verdict — workable now off the BK-34 gate.
3. **BK-3** OAuth — AC field now synced (2026-06-24), cleared for dev.
4. _[decision-gated]_ **BK-89** — after `role` field + active-workspace contract resolved; **BK-21** — after 10 contract Qs + OpenAPI drift ratified.

**Excluded (do NOT pull yet):**
- Settings cluster **BK-87 / BK-88 / BK-90** 🔒 — Settings mockup not authored (no design contract per Rule #15).
- **BK-37 / BK-38** 🔒 — Test Runs index mockup not authored.
- **BK-35** — in Estimation (re-estimated 1→5 SP); blocked by Q1 (PO) + Q5 (Dev).
- **BK-21** — RFD but contract-unratified (10 propagation Qs + OpenAPI drift on `PATCH /atcs/{id}` open).
- **BK-89** — promoted RFD 2026-06-24 (no longer superseded — BK-101 was a dup, deleted from Jira; BK-89 stands), but open Dev contract before coding.

Deferred improvement: BK-97 (ADR-0001 follow-up, story-sized — needs its own Stage 1). Full order in `sprint-sequence.md`.

### Done — This Sprint

| Ticket | Title | Owner | PR | Merged | Staging | Prod | Notes |
| ------ | ----- | ----- | -- | ------ | ------- | ---- | ----- |
| BK-84 | PAT bearer 401 on member routes (requireAuth) | Ely | — (already fixed by 226fc9d, PRs #28/#29 era ADR-0001) | 2026-06-08 | 2026-06-08 | — | **Already-fixed case**: reported 2026-06-07, structurally fixed 2026-06-08 by unified auth gateway (ADR-0001). Live re-verified on staging 2026-06-10 (8-route matrix, 0×401). Jira → Ready For QA, root_cause=Code Error, fix=Bugfix, fix-doc comment posted. Assign-to-reporter failed (no permission). BK-92/93 dup-closure PENDING user authorization. |
| BK-83 | active-workspace switch response missing {id, slug, name, role} | Ely | #32 | 2026-06-10 | 2026-06-10 | — | Ready For QA. Root cause: handler never queried workspace details/role. Flat superset response (non-breaking); OpenAPI updated. Staging smoke green: 200 with all 4 fields (role=owner). Unblocks BK-6 AC1. Fix-doc comment 11483. |
| BK-99 + BK-100 | MarkdownEditor 50 KB cap not enforced + 90% warning never fired | Ely | #33 | 2026-06-10 | 2026-06-10 | — | Both Ready For QA. Single root cause: KiB/KB mismatch — all cap sites used 50*1024 (51,200) vs the 50,000-byte AC5 contract; submit gate + amber warning already existed but never fired at QA's thresholds. Constants → 50,000, display /1000, forms import shared constants, 4 regression tests (184/184). Staging smoke: 51,000 + 50,500-byte POSTs → 422 description_too_long. Unblocks BK-16. |
| BK-60 + BK-61 + BK-62 | Invite integrity trio (uniqueness vs members, vs pending invites, no-demotion accept) | Ely | #34 | 2026-06-10 | 2026-06-10 | — | All 3 Ready For QA (assignee Nahuel, reporter). Migration 0022 (bunkai_user_id_by_email SECURITY DEFINER, service-role only). POST /invites: admin gate before probes + 409 email_already_member + 409 invite_already_pending (expired/revoked don't block). Accept: inviteAcceptAction no-demotion guard (409 already_member_equal_or_higher_role), promotions + invited-row activation still work; 8 unit tests (192/192). DATA REPAIR: aed86386 owner restored member→owner. Staging smoke: 409 / 201→409 / revoke→201, zero residue. |
| BK-58 | Consolidate remote Supabase migration ledger (0014 ×3) | Ely | #35 | 2026-06-10 | 2026-06-10 | — | Ready For QA, root_cause=Config/Env Error, fix=Bugfix. FULL ledger normalization (user-ratified): deleted 2 amendment rows, renamed 0014/0015/0016/0021 rows to file basenames, reset 0014 statements to final file content, backfilled 0019/0020 (synthetic versions 20260607000019/20). Post-repair: 22 rows 1:1 with repo. Convention + repair log in supabase/migrations/README.md. |
| BK-51 + BK-52 + BK-53 | Project slug integrity trio (reserved slugs, workspace scoping, Unicode names) | Ely | #36 | 2026-06-10 | 2026-06-10 | — | All 3 Ready For QA, root_cause=Code Error, fix=Bugfix, assignee Ely (reporter). BK-51: AC-11 18-word list in lib/projects/validation.ts, 422 slug_reserved on FINAL slug + ratified UI copy. BK-52: resolveActiveWorkspaceId helper + workspace_id filter in 4 resolution sites + 3 inline copies consolidated (URL shape stays /projects/{slug}, ws-scoped URLs deferred as ADR candidate). BK-53: hasAlphanumeric Unicode + slugifyWithFallback (fnv1a32 of trimmed NFKC name) in projects/modules routes + UI previews. 227/227 tests. Staging smoke zero-residue: api/Settings! → 422 slug_reserved; CJK name passes guards (422 only on oversized description); page + /me regression 200. |
| BK-57 + BK-59 + BK-67 | Module mutations hardening (atomic PATCH contract, activity_log audit, create toast) | Ely | #37 | 2026-06-10 | 2026-06-10 | — | All 3 Ready For QA, root_cause=Code Error, fix=Bugfix; assignees: BK-57/59 Ely, BK-67 Andrés (reporters). BK-57: modulePatchShapeError helper, 422 combined_update_and_move (REJECT ratified over atomic RPC; OpenAPI exclusivity documented). BK-59: migration 0023 re-creates the 3 module RPCs with in-function audit inserts (module.renamed/description_updated/moved/archived, actor=auth.uid(), no-ops silent; taxonomy in events.md; module CREATE out of scope). BK-67: moduleCreateToasts — success always first, warning additive. 237/237 tests. Staging smoke: combined PATCH → 422; rename round-trip → 2 module.renamed audit rows with actor (module restored). |
| BK-68 | Create Module 1-char names (client min-length) | Ely | — (already fixed by df47918, 2026-06-08) | 2026-06-08 | 2026-06-08 | — | **Already-fixed case**: reported 6/6, fixed 6/8 by df47918 (isValid >= 2 mirrors server MIN_NAME_LENGTH). Verified on current staging code. Ready For QA, fields set, fix-doc posted, assignee Andrés (reporter). |
| BK-69 | Module name stores raw HTML tags (improvement) | Ely | #38 | 2026-06-10 | 2026-06-10 | — | Ready For QA, assignee Andrés (reporter). stripHtmlTags (tag-shape anchored — 'a < b' survives) before validation in module create + rename + both UI slug previews. 243/243 tests. Staging smoke: PATCH name '<b>Payments</b>' → stored 'Payments'. |
| BK-27 | Test Builder — assemble a test by chaining ATCs | Ely | #40 | 2026-06-12 | 2026-06-12 | — | **QA Approved** — the gate that released the ATC/Test frontier (BK-20/22/23/28/32). Merge commit 54749ba. |
| BK-32 | Test View — read-only expanded Test detail view | Ely | #41 | 2026-06-19 | 2026-06-19 | — | Ready For QA. Merge commit 2f509e4 (merged in a parallel/prior session — full impl detail not captured here). |
| BK-28 | Test Reorder — reorder Test ATC chain (RPC + PATCH route + drag UI) | Ely | #42 | 2026-06-19 | 2026-06-19 | — | Ready For QA. Merge commit d4fb8e2 (merged in a parallel/prior session — full impl detail not captured here). |
| BK-20 | ATC Search — project-scoped full-text search + Projects toolbar filter | Facu Barea | #44 | 2026-06-20 | 2026-06-20 | — | Ready For QA, assignee Facu Barea (shift-left QA owner). Project-scoped FTS search. Merge commit 3574d50. |
| BK-23 | ATC Duplicate — deep-copy ATC with steps, assertions, AC bindings | Benjamin Segovia | #45 | 2026-06-20 | 2026-06-20 | — | Ready For QA, assignee Benjamin Segovia (shift-left QA owner). Atomic deep-copy RPC. Merge commit 5f02be9. |
| BK-22 | ATC Usage — "used in N tests" usage report | Andrés Daniel Cumare Morales | #46 | 2026-06-20 | 2026-06-20 | — | Ready For QA, assignee Andrés Daniel Cumare Morales (shift-left QA owner). Used-in-N-tests report. Merge commit efcb282. Code IS on staging — QA "not deployed" report = staging deploy gap (cf BK-142), not missing code; clarification comment posted to QA 2026-06-24. |
| BK-33 | Test Tags — tag + filter tests | Ely | — | merged prior/parallel session — detail not captured | yes | — | **QA Approved.** Drained the last BK-27-gated ES1 story. Impl detail not captured in this tracker. |
| BK-34 | Start manual run — opens the Runs tail | Ely | — | merged prior/parallel session — detail not captured | yes | — | **QA Approved — the gate that released the Runs tail (BK-35/36/37/38/39).** Impl detail not captured in this tracker. |
| BK-86 | Account / sign-out | Ely | — | merged prior/parallel session — detail not captured | yes | — | **QA Approved.** Settings-cluster root (unblocks BK-87). Impl detail not captured in this tracker. |
| BK-147 | App Shell | Ely | — | merged prior/parallel session — detail not captured | yes | — | **QA Approved.** Impl detail not captured in this tracker. |
| BK-142 | [BK-17] Staging Jira import `jira_unauthorized` — ATLASSIAN_* creds missing in Vercel `staging` Custom Env | Ely | — (env config, no PR/branch) | 2026-06-21 (redeploy) | — | **Ready For QA**, root_cause=Config/Env Error, fix=Bugfix, assignee Andrés (reporter). NOT a UI/API defect — the 3 Jira creds (`ATLASSIAN_URL`/`EMAIL`/`API_TOKEN`, read at runtime in `lib/jira/client.ts:120`) were absent from **every** Vercel scope. Key gotcha: the `staging` branch deploys to a Vercel **Custom Environment named `staging`** (not generic `Preview`), so the prior QA attempt that set vars on "Preview" never reached the staging runtime. Fix: set all 3 (encrypted, from `.env`) on **Production + staging** scopes, redeployed latest staging deployment (`target=staging`, status Ready). Generic `Preview` scope blocked by Vercel CLI 54.5 non-interactive branch-disambiguation quirk → follow-up only. Production scope set; applies on next `main` promotion (no forced prod redeploy per request). |

### Blocked

| Ticket | Owner | Blocking | Since | Decision Pending |
| ------ | ----- | -------- | ----- | ---------------- |
| (none) | — | — | — | — |

Unblocked 2026-06-10 (Task 0): BK-6 (BK-83 fixed), BK-16 (BK-99/100 fixed), BK-18 (BK-96 already Closed) — all transitioned BLOCKED → In Test (changelog confirmed each was blocked from In Test) + tester comment posted on each story.
Unblocked 2026-06-11: BK-10 → In Test (user-approved). Cause correction: the tester's block reason was NOT BK-9 sequencing — her 06-08 run was 25/28 PASS with the only real FAIL being TC-I04 (PAT 401 → defect BK-93, dup of BK-84, fixed + live-verified 06-10). TC-I01/TC-I03 are not-testable by design, not blockers. Evidence comment posted for Jorgelina to re-run TC-I04.

## Sprint 2 Stats

| Metric | Value |
| ------ | ----- |
| Total Sprint Tickets | 62 |
| Open bugs at sprint start | 20 (+2 improvements) |
| Bugs fixed (Ready For QA) | 16 — Waves 1–4 (BK-84, 83, 99, 100, 60, 61, 62, 58, 51, 52, 53, 57, 59, 67, 68, 69) + 5 dup-closed (92, 93, 54, 55, 56) |
| Remaining dev-side | Live frontier: BK-36 Abort → BK-39 Finish verdict → BK-3 OAuth (AC synced); decision-gated BK-89/BK-21 (bug work done; BK-97 improvement still deferred) |
| Stories merged this sprint | 10 — BK-27/33/34/86/147 (QA Approved) + BK-20/22/23/28/32 (Ready For QA) |
| Staging-deployed | PRs #32–#38 (bugs) + #40, #41, #42, #44, #45, #46 (stories) |
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

### 2026-06-24 — Roadmap audit + Jira hygiene
- **Gate release confirmed**: **BK-34 Start manual run is QA Approved** → the Runs tail (BK-35/36/37/38/39) is officially RELEASED. BK-33 (Test Tags), BK-86 (Account), BK-147 (App Shell) also QA Approved this cycle.
- **4 reassignments to Ely**: BK-90 / BK-88 / BK-21 / BK-3 reassigned to Ely. **BK-89 promoted Shift-Left QA → Ready For Dev + assigned Ely.**
- **BK-3 AC-sync DONE**: Acceptance Criteria field synced to the 10 refined ACs — removed `/home` + status `201`; redirect = `/onboarding` (first-time) / `/projects` (returning). Pre-dev AC-sync chore cleared.
- **BK-89 open contract**: still to resolve before coding — `GET /api/v1/workspaces` must add a `role` field; active-workspace data contract (API field vs localStorage vs session) undecided. Comment posted on the issue.
- **BK-35 re-estimate**: re-estimated 1→5 SP; **stays in Estimation** — blocked by Q1 (PO: ATC verdict when steps pending) + Q5 (Dev: realtime transport + latency SLA). Comment posted.
- **BK-22 & BK-23 QA clarification**: dev code IS merged to staging (PR #46 efcb282 / PR #45 5f02be9) — the QA "not deployed" reports are a **staging deploy gap (cf BK-142), not missing code**. Clarification comments posted to QA.

### 2026-06-21 — BK-142 fixed (env config, no code) — staging Jira creds restored
- **BK-142** root cause: the 3 `ATLASSIAN_*` creds (read at runtime by the import worker, `lib/jira/client.ts:120`) were absent from **every** Vercel scope on `upex-bunkai-tms`. Not a UI/API defect — pure environment configuration.
- **Diagnosis that prior QA missed**: the `staging` branch deploys to a Vercel **Custom Environment named `staging`**, not the generic `Preview` scope. The earlier QA attempt set vars on "Preview" → never reached the staging runtime (evidence: 6 identical `jira_unauthorized` jobs even after their redeploys).
- **Fix**: set `ATLASSIAN_URL`/`ATLASSIAN_EMAIL`/`ATLASSIAN_API_TOKEN` (encrypted, values from `.env`) on **Production + staging** scopes via `vercel env add`; redeployed the latest staging deployment (`vercel redeploy`, `target=staging`, status Ready) so the creds inject. No branches/PRs (config-only).
- **Gaps/notes**: generic `Preview` scope could not be set non-interactively (Vercel CLI 54.5 loops on `git_branch_required` even with `--value --yes`) — follow-up only if feature-branch previews must run the import. Production scope set but no forced prod redeploy (applies on next `main` promotion, per request).
- Jira: Open → In Progress (`start fixing`) → Ready For QA (`Hard pushed`); `root_cause=Config/Env Error`; fix-doc comment posted; assignee = reporter (Andrés). **Live verification of the import deferred to QA per request.**

### 2026-06-20 — ATC/Test story frontier shipped (BK-20 #44, BK-23 #45, BK-22 #46)
- Orchestrated sprint loop shipped **BK-20 / BK-23 / BK-22** to staging (PRs #44 / #45 / #46, merge commits 3574d50 / 5f02be9 / efcb282). All three Ready For QA and assigned to their shift-left QA owners (Facu Barea / Benjamin Segovia / Andrés Daniel Cumare Morales).
- Frontier had been released by **BK-27 Test Builder** (QA Approved, #40) earlier in the sprint; **BK-28** (#42) and **BK-32** (#41) merged in parallel/prior sessions (06-19) and are now Ready For QA.
- **Flow change adopted**: the sprint loop now auto-merges `feature/*` → `staging` via admin bypass; `main` (production) stays gated behind explicit promotion.
- Next frontier: **BK-33 Test Tags → BK-34 Start manual run (opens Runs tail BK-35–39) → BK-86 Account/sign-out → BK-3 OAuth (needs AC-field sync first)**. Excluded: Settings cluster BK-87/88/90 🔒, BK-21 (10 propagation Qs), BK-89 (likely superseded by BK-101).

### 2026-06-10 — Waves 3+4 complete (BK-58 #35, BK-51/52/53 #36, BK-57/59/67 #37, BK-69 #38, BK-68 already-fixed)
- Root causes for all 7 Wave-3 bugs confirmed via a 14-agent investigate+adversarial-verify workflow before any code. 4 product decisions ratified by Tech Lead (BK-52 active-ws scoping, BK-53 hash fallback, BK-57 reject-combined, BK-58 full ledger normalization).
- All remaining open bugs/improvements except BK-97 are now Ready For QA with fields, fix-doc comments, and reporter-assignees. BK-97 deferred (story-sized, needs its own Stage 1).
- CORRECTED 2026-06-11: the "Atomic Test Components" → "Acceptance Test Cases" rewrites seen during this session were legitimate work by a PARALLEL session running the terminology remediation (ATC = Acceptance Test Case; canonical glossary `.context/business/domain-glossary.md`; Jira BK-13/18/24/30/40/44/45/46 already remediated). This session mistakenly reverted that work 4× believing it was out-of-scope agent drift — those files are now owned by the other session and must not be touched here. None of this session's PRs (#35–#38) or Jira artifacts used the erroneous expansion.

### 2026-06-10 — Task 0: unblocked BK-6 / BK-16 / BK-18
- Verified live: BK-83, BK-99, BK-100 all Ready For QA; BK-96 Closed; PRs #32/#33 merged on origin/staging.
- Transitioned all 3 stories BLOCKED → In Test (transition 21 "back"; changelog showed each was blocked from In Test) + posted English resume-testing comment with fix-evidence table on each.
- Next: Wave 3 (BK-51/52/53/67 + tech-debt BK-57/59/58).

### 2026-06-10 — Sprint 2 dev batch started (bug-first)
- Read live board state (62 items, sprint 339). Sequenced bug-fix waves into `sprint-sequence.md`; closed Sprint-1 tracker; created this tracker.
- Identified BK-92/93 as likely dups of BK-84 and BK-54/55/56 as dups of BK-51/52/53 (created-by BK-8 link confirms the latter family).
- Next: `/sprint-development` on BK-84 (Highest).
