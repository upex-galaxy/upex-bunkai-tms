# BK-572 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-572)

- A ***Remove**** action on the Workspace members screen, placed in the existing member row, offered only where the ladder permits it: a caller may remove a target whose role does not outrank their own, on viewer < member < admin < owner. An Admin looking at an Owner's row sees ****no*** Remove affordance at all — absent, not present-and-refused
- A confirmation that names the exact teammate and states the two consequences before the caller commits: their Personal Access Tokens for this Workspace stop working, and the Bugs assigned to them become unassigned
- Removal ends the membership outright. There is no reversible or suspended state; ***re-invitation through the existing invite flow is the reversal***
- The whole removal is ***one all-or-nothing act***: ending the membership, revoking the target's Workspace-scoped Personal Access Tokens, unassigning their Bugs and recording the removal either all happen or none of them do
- Revocation is scoped to this Workspace. Personal Access Tokens the removed teammate holds that are not tied to a single Workspace are left alone, so one Workspace can never break their access to another
- Everything the removed teammate authored — ATCs, Tests, Runs, Bugs, Milestones and their Activity Stream entries — stays attributed to them, and each Bug still records who previously held it
- Four refusals, each with its own stated outcome: a target who is not a member and a Workspace the caller cannot see are ***indistinguishable*** from each other; removing the last remaining Owner is refused; removing yourself is refused and points at Leave; an Admin removing an Owner is refused
- ***Narrowing the row-level security policy on Workspace memberships**** so the same ladder and the same self-protection are enforced at the data layer, not only at the endpoint. Shipped with a database-integration test that attempts the delete ****directly through the data API*** as an admin targeting an owner and asserts denial — a test that goes through the endpoint does not satisfy this
- The refusals are enforced ***twice and independently***: the endpoint rejects early, and the underlying operation re-checks on its own
- The removal is recorded in the Workspace Activity Stream, naming the actor, the removed teammate and the moment
- The freed Seat is reflected in the Workspace's Seat count, with no billing action taken
- Screen states for the flow: the row with and without the Remove affordance, the confirmation, in-flight, success, and each refusal — including a failure that leaves everything exactly as it was

---
_Synced from Jira by sync-jira-issues_
