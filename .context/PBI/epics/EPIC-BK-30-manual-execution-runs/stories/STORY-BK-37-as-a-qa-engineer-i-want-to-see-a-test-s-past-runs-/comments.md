# Comments for BK-37

[View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

---

### Ely - 6/30/2026, 3:58:28 PM

@@Andrés Daniel Cumare Morales Le asigno a @@Juan Ignacio Marmo porque no tenía ninguna asignada en el proyecto. Gracias Andres!

---

### Carlos Alcala - 7/21/2026, 7:35:43 PM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT lives in the ***Acceptance Test Plan (ATP)**** field. Refined ACs live in the ****Acceptance Criteria (Gherkin)*** field. See the "QA Refinements (Shift-Left Analysis)" section in this Story's description for Edge Cases + Clarified Business Rules + Open Questions.

***3 Critical Questions for PO**** and ****3 Technical Questions for Dev*** block sprint planning / implementation — see the description or the full ATP field.

---

### Carlos Alcala - 7/21/2026, 8:24:39 PM

## PO Decision — Shift-Left Open Questions Resolved

Reviewed the Shift-Left refinement with QA + Dev + Design input. Posting the decision on all 3 Critical Questions so the Story can be estimated.

### 1. In-progress ("running") Runs in history?

***Decision******:****** Excluded.*** History shows terminal Runs only (passed / failed / aborted). A Run in progress belongs to the live execution view (already covered by BK-34/BK-35/BK-39), not this history list — mixing a run with no outcome yet into a "past runs" comparison view would confuse the mental model.

### 2. Page-size contract

***Decision******:****** 50***, matching the number already used in the AC example. Business Rules should state this explicitly instead of leaving it implicit. (Design flagged that 50 may be a lot per page for scannability — noted as a future polish item, not blocking this Story.)

### 3. Filter + pagination composition

***Decision******:****** Confirmed — the active outcome filter stays applied when loading older runs.*** Resetting the filter mid-"load more" would break the investigation flow this Story exists to support.

---

### Handoff to Dev (non-blocking for PO, blocking for implementation)

- ***No GET endpoint exists yet*** to list/filter/paginate a Test's Runs (confirmed via code: `runs/route.ts` is POST-only, `runs/[id]/route.ts` is single-Run GET-only). Please size this into the estimate — the current 1-point estimate predates this finding; expect it to move.
- Tie-break sort key for identical timestamps: use `id` as the secondary sort — no design implication, proceed as you see fit.
- Empty-state copy for a 0-match filtered result: use `"No {Outcome} runs found for this Test"` (outcome capitalized) to stay consistent with the existing "No runs yet for this Test" tone.

Ready for re-estimation with these answers locked in.

— Carlos (PO)

---

### Carlos Alcala - 7/21/2026, 8:49:25 PM

## PO Decision — Re-estimation (1 -> 5 points)

Ran a planning-poker pass with QA + Dev (Backend/Frontend) + Design now that the 3 Critical Questions are resolved and the missing-endpoint gap is confirmed.

***New estimate******:****** 5 points*** (was 1).

### Why the jump

- ***No pagination pattern exists anywhere in the codebase yet*** (checked: no cursor/offset query params on any API route, no reusable paginated-list component). This Story is the first to need one — both a new backend endpoint pattern and a new frontend list pattern, with nothing to copy.
- The original 1-point estimate assumed the read endpoint already existed (`GET /runs/{id}` does, a **list** endpoint does not).
- Sized against siblings in this epic: comparable to BK-39 (5pts, derived-state + verdict logic) rather than BK-38 (3pts, which only needs aggregate totals — no itemized pagination).

### What's NOT inflating this

- All 3 ambiguities are already resolved (see prior comment) — no design risk left to pad for.
- Scope stays exactly as refined — no new functionality added, just the endpoint gap now priced in.

***Sequencing note for Dev***: if BK-37 ships before BK-38, BK-38 may reuse the pagination pattern this Story establishes — worth a quick sync between the two before either starts.

— Carlos (PO)

---

### Carlos Alcala - 7/21/2026, 8:52:08 PM

## PO Decision — Story committed to sprint

***Status***: `Ready For Dev`
***Assignee***: Ely
***Story Points***: 5 (re-estimated — see prior comment)

All 3 Critical Questions are resolved, Business Rules + Acceptance Criteria updated to reflect the confirmed decisions, and the missing-GET-endpoint gap is priced into the new estimate. Ely — please read the Acceptance Criteria + Acceptance Test Plan (ATP) fields on this Story before starting; the ATP field has the full Shift-Left analysis (endpoint gap, boundary cases, coverage estimate).

Flagging again for sequencing: if BK-38 hasn't started yet, worth a quick sync since it may reuse the pagination pattern this Story establishes.

— Carlos (PO)

---

### Ely - 7/30/2026, 1:28:04 PM

Mockup — Test run history (per-test past runs). Source: .context/designs/bunkai-test-management-tool/bk-30-test-runs-index/test-run-history.html · spec: master-design-plan §4.8



---

### Automation for Jira - 7/30/2026, 9:21:47 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 7/31/2026, 2:32:59 AM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Ely - 7/31/2026, 2:38:47 AM

## Ready For QA — BK-37 deployed to staging

@@Carlos Alcala — assigning back to you as the shift-left owner (you held this during Shift-Left QA on 2026-07-21 and authored the ATP).

***Staging******:*** https://staging-upexbunkai.vercel.app — Vercel deploy `success` on `9694413f`.

***PRs******:*** [#65](https://github.com/upex-galaxy/upex-bunkai-tms/pull/65) backend (`feat/BK-37-runs-history-api`) · [#66](https://github.com/upex-galaxy/upex-bunkai-tms/pull/66) frontend (`feat/BK-37-runs-history-ui`). Both merged to `staging` with merge commits.

### Where to look

Run History is a ***tab on the Test detail page***, not a standalone screen:

`/projects/{projectSlug}/tests/{testId}/runs`

The outcome filter lives in the URL (`?outcome=passed|failed|aborted`), so every state is deep-linkable and directly assertable.

### Seed fixtures already in place

Workspace ***Bunkai Smoke QA**** → project ****Smoke Checkout***. Four Tests titled `BK-37 QA Seed…`:

| Test | Fixture | What it exercises |
| --- | --- | --- |
| `a8067098-8325-45f2-9ccb-f09e5894f1cd` | 12 terminal (7 passed / 3 failed / 2 aborted) + 1 running | default list, all three outcome chips, running Run excluded |
| `93bd0270-117c-4e94-bacd-d17cd0a36b1b` | 55 terminal (44 passed / 11 failed) | `Load older runs` → appends 5; add `?outcome=failed` for filter-scoped paging |
| `83c3a4b0-cfd2-431a-95cf-f7cd356f749f` | 3 passed, 0 failed | `?outcome=failed` → the 0-match empty state |
| `75a2ba2c-ba53-4233-b8be-95e0dba3f5bb` | 0 runs | the never-run empty state |

***These are throwaway fixtures and must be purged after your sign-off*** — this project shares one Supabase instance across environments, so they are visible in production too:

```sql
delete from public.runs where test_id in (select id from public.tests where title like 'BK-37 QA Seed%');
delete from public.tests where title like 'BK-37 QA Seed%';
```

### Already verified on staging

12 rows on the 13-run fixture (the in-progress Run is correctly excluded from both the list and the totals) · filter → Aborted gives 2 rows with foot `runs 1–2 of 2 · Aborted only` while the totals stay all-time · pagination 50 → 55 rows with ***55 unique row ids***, no duplicate and no skip, and the button hides on the last page.

### Frozen copy — assert these strings exactly

- Never run: `No runs yet for this Test`
- Filter matches zero: `No {Outcome} runs found for this Test` (outcome capitalised, e.g. `No Aborted runs found for this Test`)

That second string is your 2026-07-21 contract, which supersedes the shorter phrasing inside the AC scenario. Recorded in the implementation plan §3.1.

### Two things that changed beyond this story

`aborted`*** is now amber, app-wide.**** It was in the red/fail family since BK-36, so the same Run read red in the runner and amber in history. Run history lists Failed and Aborted side by side, so two identical reds defeated the filter's colour dots and the summary bar. ****The runner's aborted chip changed colour too*** — expected, not a regression. Ratified as D14 in `master-design-plan` §5.

***The Test detail page now has a tab strip.**** Its header moved into a shared layout so `Steps` and `Run History` can share it. The Steps tab should render exactly as before. ****Please give this one a deliberate look on a Test that has an ATC chain*** — no workspace reachable from the dev credentials had one, so that path was verified by reading the diff rather than by rendering it. It is the one declared gap.

### Declared verification gaps

1. Filter-plus-pagination composition ***across a page boundary*** was not reproduced by hand — no fixture has a filtered subset larger than 50. It is asserted at the DB layer instead.
2. The Steps tab's ATC chain, as above.

Full evidence: `compliance-matrix.md` (11/11 AC rows covered, zero uncovered) and `review.md` (11 review findings, all adjudicated) in the story folder.

### Security note

The Stage 3 review found that the run-history RPC trusted its `p*actor*user*id` parameter as identity without binding it to the caller's JWT — with a public anon key that let any signed-in user read across the workspace boundary. Closed for this function in migration `0039` and verified live. ***The same gap is still open in ****`bunkai*get*test*expanded`**** and ***`bunkai*get*run_expanded` — tracked as BK-249. Worth knowing while you test anything that touches tenancy.

---


_Synced from Jira by sync-jira-issues_
