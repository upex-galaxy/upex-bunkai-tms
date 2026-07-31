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


_Synced from Jira by sync-jira-issues_
