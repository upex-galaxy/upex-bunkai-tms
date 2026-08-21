# BK-571 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-571)

A Senior QA Engineer is tidying an ATC Library that has drifted. A handful of cases cover a flow that was redesigned two releases ago — they are no longer worth reusing, but deleting them is out of the question, because each one is still the only artifact tying a past regression to the requirement it broke.

She opens one of them and chooses to archive it. A confirmation appears. It names the ATC, states plainly that archiving is reversible, and tells her how many Tests currently chain it — here, three, named. It also tells her those Tests keep the ATC in their chains. She confirms.

The ATC leaves its Project's ATC list, stops surfacing in ATC search and in the command palette, and stops being offered as a step when anyone builds a Test chain. What does **not** change is everything already recorded: the three Tests keep the ATC at exactly the positions it occupied, each showing that the step refers to an archived ATC; the Runs that executed it still render every step, its content and its result exactly as recorded; the User Story's Traceability chain still shows the ATC as the evidence covering its Acceptance Criterion, marked as archived rather than reported as a gap.

Weeks later a regression resurfaces in that old flow and her QA Lead asks whether a case for it ever existed. She opts into the archived view, sees the ATC listed with who archived it and when, and restores it. It reappears in the list, in search, and in the command palette, is editable again, and can be chained into a new Test — as if it had never left. Both the archive and the restore are visible as separate entries in the workspace Activity Stream, so the history of the decision is legible to the whole team.

---
_Synced from Jira by sync-jira-issues_
