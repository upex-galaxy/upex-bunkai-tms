# Comments for BK-337

[View in Jira](https://jira.upexgalaxy.com/browse/BK-337)

---

### Ely - 8/10/2026, 3:57:25 AM

## AI Product Owner — Decision: what does the defects list's Run cell open?

The approved discovery proposal says the list's Bug ***and*** Run cells both "become navigable to this route" (the new `/projects/[projectSlug]/bugs/[bugId]` record), without spelling out whether the Run cell should instead target the existing run report page. This story's Scope and AC (`Scenario: The defects list links into the detail record`) resolve it as follows.

***Candidates scored*** (product value / consistency / implementation cost / reversibility / risk):

- ***A — Run cell opens the existing run report page**** (`/projects/[projectSlug]/runs/[runId]`). Product value: medium, gets straight to the run, but a reader who clicked a **defect** row and lands on a run replay loses the defect context they clicked for. Consistency: low, the row's two identifier cells would behave differently for no stated reason. Cost: low. Risk: ****high*** — wires a second, unrelated existing route and reaches into BK-37/BK-38's territory ("what a run reference does when clicked"), which this story's Out-Of-Scope list never named and therefore never vetted for overlap.
- ***B — Run cell opens the same bug-detail record as the Bug cell.*** Product value: high, matches the approved proposal's literal text, and nothing is lost: the mockup's own Origin panel on `bug-detail.html` already carries a `RUN-xxx` link one hop deeper for the reader who does want the run itself. Consistency: high, one row, one destination for both identifier cells. Cost: lowest, no second route to wire. Risk: lowest, stays entirely inside this story's approved, narrowly-scoped route.
- ***C — Run cell opens the run in a split view / new tab.*** Rejected outright: introduces an interaction pattern nothing else in the app uses, for a story explicitly scoped as read-only detail, not workbench redesign.

***Decision******:****** B.*** The Run cell opens the same defect detail record as the Bug cell. The Origin panel inside that record is the one place a reader continues on to the actual run (`RUN-xxx`) and the failing ATC, exactly as `bug-detail.html` already specs it. This keeps the story inside its approved slice and defers any change to "what does a run reference open" to BK-37/BK-38, which already own that surface.

Recorded per CLAUDE.md Rule #18 (AI-led decision authority) — no open product question blocks this ticket.

---


_Synced from Jira by sync-jira-issues_
