# BK-555 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

Mateo opens the app on Monday wanting one thing: what is broken across the product right now, and who owns it. Today that means opening each Project's Bug Reports view in turn and holding the picture in his head. The sidebar has named a "Bug Reports" destination all along, but it has been a greyed-out "soon" item he cannot even tab to.

Now it is a real destination, with a count beside it telling him how many defects the workspace holds. He selects it and lands on a single list of every defect across every Project, worst first — the Critical ones at the top, and within them the newest first. Each row tells him enough to triage it without opening anything: which defect it is, its title, which Project it belongs to, the full module path it was filed against, how bad it is, where it sits in its lifecycle, who is carrying it, and whether it came out of a Run or was filed by hand.

Above the list, the counts tell him the shape of the problem: how many Critical, Major, Minor and Trivial, and how many open, in progress, resolved and closed. They describe every defect matching what he has filtered to, not just the rows that happen to have loaded.

He narrows it. One Project, open only — and the list intersects both, showing him just the outstanding defects of the Project he cares about, with the counts recomputing to match. He adds Critical severity and it narrows again. When he wants the whole picture back, he clears the filters and the full list returns.

Two of the rows name a module called "Payments" and they belong to different Projects. He can tell them apart at a glance, because each row carries its own Project alongside its own full module path.

He finds the one he was looking for and opens the row. The app takes him to that defect's full record, inside its owning Project, where the description, the steps, the evidence and the origin already live — this screen never assigned anything, never advanced a status, and never let him edit a defect in place.

If a filter combination matches nothing, he is told nothing matched and the counts read zero, not that something broke. If the workspace has no defects at all, he is told that plainly, and it reads as a clean workspace rather than a failure. If the list cannot load, he gets a named error and a retry that keeps the filters he had set, rather than dumping him back at the start.

And a defect from a workspace he does not belong to is never on the screen — not in the list, not among the Projects he can filter by, not in the counts, and not in the number beside the sidebar entry.

---
_Synced from Jira by sync-jira-issues_
