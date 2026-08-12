# BK-337 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

> ***INFO:*** Revision 2, 2026-08-11. Shift-Left refined, then amended by the Product Owner's four decisions, the Product Owner's follow-up AC1 ruling, and the Tech Lead's technical rulings. QA retracted four claims from the first revision after the Tech Lead's review; see the QA correction comment on this ticket. Section 1 preserves the five criteria as originally authored. Sections 2 and 3 are what gets built.

## 1. Original criteria (as authored, unchanged, for reference)

```gherkin
Scenario: Open a defect filed from a failing run step
  Given Elena is viewing the defects list for project "Storefront"
  And defect "BUG-101" was filed from a failing step in run "RUN-451"
  When she opens "BUG-101"
  Then she sees its id, severity, status, title, and full module path in the header
  And she sees who filed it and when
  And the description, steps to reproduce, and Expected vs Actual are all shown
  And the steps to reproduce are numbered, with the step that failed visually highlighted
  And the Origin panel links to the originating ATC and to run "RUN-451"

Scenario: Open a standalone defect with no linked run
  Given defect "BUG-112" was filed directly from the defects area, with no run involved
  When Elena opens "BUG-112"
  Then she sees its full record exactly as filed
  And the Origin panel shows a quiet notice that it was filed manually
  And no run or ATC link is offered

Scenario: Evidence list shows the count against the attachment cap
  Given defect "BUG-101" has 6 evidence items attached
  When Elena opens "BUG-101"
  Then the evidence panel reads "6 / 10"
  And each evidence row can be opened

Scenario: The defect record carries no edit or status controls
  When Elena opens any defect's detail record
  Then no field on the page can be edited
  And no status-transition or assignment control is offered

Scenario: The defects list links into the detail record
  Given Elena is viewing the defects list for project "Storefront"
  And it includes defect "BUG-101" linked to run "RUN-451"
  When she clicks the "BUG-101" cell
  Then she lands on the detail record for "BUG-101"
  When she instead clicks the "RUN-451" cell on that same row
  Then she also lands on the detail record for "BUG-101"
```

## 1b. What changed in AC1, and why

Three clauses of AC1 are superseded. Rewritten once, in one pass, per the Product Owner's coordination note.

| Original clause | Status | Ruling |
| --- | --- | --- |
| "the description, steps to reproduce, and Expected vs Actual are all shown" | Expected vs Actual STRUCK | PO Q1: no column stores them and no form captures them. Cut from BK-337, moved to a follow-up Story. |
| "the steps to reproduce are numbered, with the step that failed visually highlighted" | Highlight STRUCK, numbering RESTATED | PO follow-up ruling: a run-linked defect carries exactly ONE step, copied verbatim, with no stored index. Numbers are line ordinals in a free-text field, never run-step positions. |
| "links ... to run \"RUN-451\"" | Identifier form STRUCK | PO Q4: the product has no such sequence. Identifiers render as an 8-character prefix with the full value on hover. |

Also struck across the criteria: the Details panel rows for `layer` and `environment` (PO Q2 — both belong to other entities and are read live, so neither survives "exactly as filed" even for a run-linked defect).

## 2. Refined scenarios

### From AC1 — run-linked defect

***Scenario 1.1 — Should show the full header when a run-linked defect is opened*** (Positive, High)

- Given a defect in project "Storefront" with severity P1, status open, module path `Checkout/Payments/Cards`, a known reporter and filing timestamp, and a `run*step*id` pointing at a failed step
- When Elena navigates to `/projects/storefront/bugs/{bugId}`
- Then the header renders the identifier as the first 8 characters of the id, with the full value available on hover, matching the defects list's existing treatment
- And the header renders the severity chip, the status chip, the title, the FULL module path (not the leaf name), and "Filed by {name} · {date}"
- And severity and status are each conveyed by text as well as colour, never colour alone
- And `GET /api/v1/bugs/{id}` returns 200 with a body from the extended `bunkai*bug*json` composer
- And no row is written; `updated_at` is unchanged

***Scenario 1.2 — Should render the description and the steps to reproduce*** (Positive, High)

- Given the same run-linked defect with a non-empty description and steps text
- When Elena opens it
- Then the description renders as prose
- And the steps to reproduce render as an ordered list numbered from 1, one item per line of the stored text, with no line marked as the failing step
- And no Expected block and no Actual block appear anywhere on the record

***Scenario 1.3 — Should state the failing step in the Origin panel*** (Positive, High)

- Given a run-linked defect whose `run*step*id` references the run step stored at position 3
- When Elena opens it
- Then the Origin panel links to the originating ATC and to the run, and states "Failed at step 4 of {ATC title}", where the displayed number is the stored 0-based run-step position plus 1
- And no line of the steps list carries a failed treatment; the ordinals in that list are line numbers of a free-text field and must not be joined back to `run_steps`

***Scenario 1.4 — Should link the Origin panel to the originating ATC and run*** (Positive, High)

- Given a run-linked defect with both `atc*id` and `run*id` present
- When Elena opens it
- Then the Origin panel offers a live link to the ATC and a live link to the run, each labelled with the same 8-character identifier treatment used in the header

### From AC2 — standalone defect

***Scenario 2.1 — Should show the manual-filing notice and offer no origin links*** (Positive, High)

- Given a defect with `run*id`, `run*step*id` and `atc*id` all null
- When Elena opens it
- Then the Origin panel renders a quiet "Filed manually" notice styled as information, not as an error or a warning
- And no ATC link, no run link and no "Failed at step" reference is offered
- And the Details panel renders exactly: severity, status, module path, reporter, filed date, assignee. No layer row and no environment row appear, for any defect, run-linked or standalone

### From AC3 — evidence

***Scenario 3.1 — Should show the evidence count against the ten-item cap*** (Positive, Medium)

- Given a defect with 6 entries in `evidence_urls`
- When Elena opens it
- Then the evidence panel reads "6 / 10" and six rows render
- And each row is labelled with the last non-empty path segment of its URL, falling back to the host, with the full URL available on hover

***Scenario 3.2 — Should read 0 / 10 with an empty state when no evidence was attached*** (Boundary, Medium)

- Given a defect with an empty `evidence_urls` array (the column default)
- When Elena opens it
- Then the panel is present and reads "0 / 10" with an empty state; the panel is NOT hidden, because the cap is part of the record

***Scenario 3.3 — Should read 10 / 10 at the hard cap*** (Boundary, Medium)

- Given a defect with exactly 10 entries, the database check ceiling
- When Elena opens it
- Then the panel reads "10 / 10", all ten rows render, and there is no truncation and no "show more"

***Scenario 3.4 — Should render a non-http evidence URL as inert text*** (Negative / Security, High)

- Given a defect whose `evidence_urls` contains an entry whose scheme is neither http nor https
- When any workspace member opens the defect
- Then the entry renders as plain text and never as an anchor
- And http and https entries render as anchors opening in a new tab, carrying `rel="noopener noreferrer"`
- And the same scheme allowlist is applied at filing time, so no new row can store an entry the render path would have to reject

### From AC4 — read-only record

***Scenario 4.1 — Should offer no editable field and no lifecycle control*** (Positive, High)

- Given any defect, opened by a member holding the ADMIN role, the highest role that would plausibly be granted controls
- When Elena opens the record
- Then no input, textarea or contenteditable region exists on the page
- And no status-transition control, no assignment control and no delete control is offered
- Note: the assertion runs as an admin deliberately; run only as a plain member it would pass vacuously

### From AC5 — navigation into the record

***Scenario 5.1 — Should navigate from the Bug cell to the detail record*** (Positive, High)

- Given the defects list for project "Storefront" showing a defect linked to a run
- When Elena clicks the Bug cell
- Then she lands on `/projects/storefront/bugs/{bugId}` showing that defect

***Scenario 5.2 — Should navigate from the Run cell to the SAME defect record, not to the run report*** (Positive, High)

- Given the same row
- When Elena clicks the Run cell
- Then she lands on the same defect detail record, per the decision recorded on this ticket on 2026-08-10
- And the route onward to the run itself is the Origin panel inside that record

***Scenario 5.3 — Should land on the defect record from a bug notification*** (Positive, Medium)

- Given a bug notification in the inbox, for a run-linked defect and separately for a standalone one
- When Elena follows it
- Then both resolve to `/projects/{slug}/bugs/{bugId}`, the same record the list opens
- And the standalone case resolves to a destination for the first time, where it previously resolved to nothing
- Scope note: this Story changes only the `bug` case of the notification route resolver. The inbox UI, the availability computation and event production remain BK-212's.

## 3. Negative and authorization criteria

> Ratified as regression guards, not as fixes. The not-found convention is already the shipped invariant on this surface: the bug error mapper collapses a missing bug and a bug in a foreign workspace into the same not-found. These criteria exist so the new read route reuses that mapping instead of inventing its own.

***Scenario E-1 — Should answer 404 for a defect in another workspace*** (Negative, High)

- Given Elena is a member of workspace A and defect D exists in workspace B with a well-formed identifier
- When she requests D through the API or the page
- Then both answer not-found, with no response detail distinguishing "does not exist" from "exists but is not yours"

***Scenario E-2 — Should answer 404 for an unknown identifier and 400 for a malformed one*** (Negative, High)

- Given a well-formed identifier matching no row, and separately a non-uuid string such as "abc"
- When each is requested from the API
- Then the unknown identifier answers 404 and the malformed one answers 400, matching the shape every sibling route already uses; a uuid-shape rejection touches no data and discloses nothing
- And the page renders its not-found surface for both, so a reader never sees the distinction

***Scenario E-3 — Should answer not-found when the identifier is real but the URL names a different project*** (Negative, High)

- Given defect D belongs to project P1 and Elena is a workspace member who may legitimately read D
- When she requests the page under P2's slug, within the same workspace
- Then the page answers not-found, re-checking the resolved project against the record rather than trusting the slug
- Scope note: this applies to the page only. The API route is keyed by identifier and never receives a slug, so it has nothing to re-check

***Scenario E-4 — Should let a viewer-role member read the record with no controls*** (Positive, Medium)

- Given a viewer of the workspace; the row-level policy grants read access to any member
- When they open a defect
- Then the full record renders and no control appears anywhere, confirming AC4 holds at the lowest role too

***Scenario E-5 — Should render a defect whose module was archived after filing*** (Edge, Medium)

- Given a defect filed against a module that was later archived
- When Elena opens it
- Then the record renders in full, and the module row in the Details panel carries an "Archived" tag
- And the single-defect read does NOT apply the archived-module exclusion that `bunkai*list*bugs` uses; a defect that is hard to reach must still be readable, and its archived context must be visible rather than silent

***Scenario E-6 — Should show the assignee on the record*** (Positive, Medium)

- Given a defect with an assignee set
- When the assigned developer opens it
- Then the Details panel names them, read-only, using the same value and format the defects list already renders
- And no assignment control is offered, per AC4

---
_Synced from Jira by sync-jira-issues_
