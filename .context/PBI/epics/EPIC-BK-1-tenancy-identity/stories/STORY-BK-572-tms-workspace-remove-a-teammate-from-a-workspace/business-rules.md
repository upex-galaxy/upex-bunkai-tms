# BK-572 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-572)

- ***A caller may remove a target whose role does not outrank the caller's***, on the ladder viewer < member < admin < owner. An Owner may remove anyone including another Owner; an Admin may remove a Viewer, a Member or another Admin, but never an Owner. Admin-removes-admin is deliberately allowed, because an Admin can invite an Admin and the undo must match the create
- ***Only Owner and Admin may remove at all.*** Member and Viewer never see the action and cannot reach it by any route
- ***An Admin looking at an Owner's row sees nothing to click.*** The affordance is absent rather than disabled, so the ladder is communicated by the interface rather than discovered by being refused
- ***A Workspace never reaches zero active Owners.*** A removal that would leave none is refused, regardless of who initiated it. This is a property of the Workspace, not of the caller, and it holds even where the ladder makes it presently unreachable
- ***The rule that stops a person stranding themselves does not apply to a target.*** Whether the removed teammate belongs to any other Workspace is irrelevant to whether they may be removed — an administrative control whose availability depends on the subject's own circumstances is not a control, and answering the question would require disclosing another tenant's membership to this Workspace's administrator. Nobody is stranded: anyone can create a new Workspace with no precondition
- ***Removing yourself through this action is refused.*** Leaving a Workspace is its own act with its own guard, and a second door to the same operation with a different guard is not acceptable. The refusal names Leave as the correct route
- ***Removal is not reversible; re-invitation is the reversal.*** The membership ends outright. There is no suspended state, no grace period and no restore. A re-invited teammate returns as a new joiner: their original tenure is gone, and the Personal Access Tokens revoked by the removal stay revoked, so they must issue new ones
- ***Personal Access Tokens scoped to this Workspace stop working immediately***, exactly as if revoked. Tokens the holder has that are not tied to a single Workspace are never touched — one Workspace must not be able to break a person's access to another
- ***No Bug stays assigned to someone who is no longer a member.*** Every Bug held by the removed teammate becomes unassigned in the same act, and each one still records who previously held it, so the question "who used to own this" stays answerable afterwards
- ***Authorship is preserved permanently.*** Nothing the removed teammate created is deleted or reassigned, and their name continues to render on the Activity Stream entries they generated. Removal ends access; it does not rewrite history
- ***The removal is one transaction.*** Ending the membership, revoking the Workspace-scoped Personal Access Tokens, unassigning the Bugs and recording the event either all succeed or all fail. A partial outcome that ends access while leaving credentials live is the worst available result and must be unreachable
- ***A non-member target and an invisible Workspace must be indistinguishable.*** Neither refusal may reveal whether the Workspace exists or whether the named person has an account
- ***Every refusal is enforced at both layers independently*** — the endpoint rejects early, and the underlying operation re-checks on its own without trusting the caller
- ***The ladder is enforced at the data layer too.*** Reaching the membership records directly, rather than through the removal endpoint, must produce the same refusals. An endpoint-level check standing over a permissive data-layer policy is a lock painted on an open door
- ***Removal frees a Seat and nothing more.*** The Workspace's Seat count reflects the removal because it counts active members, and no Billing Plan, Tier or Subscription changes as a result

---
_Synced from Jira by sync-jira-issues_
