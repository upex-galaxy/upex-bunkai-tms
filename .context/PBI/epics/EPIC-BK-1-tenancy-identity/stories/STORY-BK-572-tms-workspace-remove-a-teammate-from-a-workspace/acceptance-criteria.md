# BK-572 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-572)

## AC-01 — An Owner finds Remove on every other member's row

```gherkin
Scenario: The Owner can act on every role below Owner and on Owners too
  Given I am signed in as an Owner of a Workspace
  And that Workspace also has an Admin, a Member, a Viewer and a second Owner
  When I open the Workspace members screen
  Then the rows for the Admin, the Member, the Viewer and the second Owner each offer a "Remove" action
  And the existing invite, resend-invite and revoke-invite actions are unchanged
```

## AC-02 — An Admin sees no Remove affordance on an Owner's row

```gherkin
Scenario: The Remove control is absent on a row the Admin may not act on, not disabled
  Given I am signed in as an Admin of a Workspace
  And that Workspace has an Owner, another Admin, a Member and a Viewer
  When I open the Workspace members screen
  Then the rows for the other Admin, the Member and the Viewer each offer a "Remove" action
  And the Owner's row offers no "Remove" action at all
  And there is no disabled, greyed or otherwise present-but-refused Remove control on the Owner's row
```

## AC-03 — Member and Viewer never reach member removal

```gherkin
Scenario: A non-administering role cannot see or reach the removal
  Given I am signed in with the Member or Viewer role in a Workspace
  When I open the Workspace members screen
  Then no "Remove" action is offered on any row, including my own
  And I cannot reach a member removal for that Workspace by any route in the app
```

## AC-04 — The confirmation names the person and states both consequences

```gherkin
Scenario: The caller is told exactly what removal costs before committing
  Given I am an Owner or an Admin of a Workspace
  When I choose "Remove" on a teammate's row
  Then a confirmation opens naming that exact teammate and no other
  And it states that their Personal Access Tokens for this Workspace will stop working
  And it states that the Bugs currently assigned to them will become unassigned
  And nothing has been removed yet
```

## AC-05 — Backing out of the confirmation changes nothing

```gherkin
Scenario: Dismissing the confirmation leaves the membership untouched
  Given the removal confirmation for a teammate is open
  When I dismiss the confirmation instead of confirming
  Then that teammate is still an active member of the Workspace with the same role
  And their Personal Access Tokens for this Workspace still work
  And the Bugs assigned to them are still assigned to them
```

## AC-06 — Confirming ends access immediately and completely

```gherkin
Scenario: The removed teammate can no longer reach the Workspace
  Given a teammate is an active Member of my Workspace and can open its Projects today
  When I confirm their removal
  And that teammate next loads the app
  Then the Workspace is absent from their list of Workspaces
  And they cannot reach any screen belonging to it
  And every other Workspace they belong to is unaffected
```

## AC-07 — Their Personal Access Tokens for this Workspace stop working, and only those

```gherkin
Scenario: Revocation is scoped to the Workspace the removal happened in
  Given a teammate holds a Personal Access Token scoped to my Workspace
  And that same teammate holds a Personal Access Token that is not scoped to any single Workspace
  And both work today
  When I remove that teammate from my Workspace
  Then the Workspace-scoped Personal Access Token is refused from that moment on
  And the Personal Access Token that is not scoped to a single Workspace still works for the other Workspaces they belong to
```

## AC-08 — Bugs assigned to the removed teammate become unassigned, and history survives

```gherkin
Scenario: No Bug is left assigned to someone who is no longer a member
  Given a teammate is assigned three Bugs in my Workspace
  When I remove that teammate
  Then none of those three Bugs is assigned to anyone
  And each of those Bugs still records that this teammate previously held it
  And the Workspace Activity Stream shows each of those Bugs being unassigned
  And nobody receives a Notification about those unassignments
```

## AC-09 — Everything they authored stays attributed to them

```gherkin
Scenario: Removal ends access without erasing authorship
  Given a removed teammate had created ATCs, Tests, Bugs and Milestones in my Workspace
  And had recorded Runs whose entries appear in the Activity Stream
  When I open those records after removing them
  Then each record still names that person as its author
  And their name still renders in the Activity Stream entries they generated
  And no record they authored has been deleted or reassigned
```

## AC-10 — Removing the last remaining Owner is refused

```gherkin
Scenario: A Workspace never reaches zero Owners
  Given I am the only Owner of my Workspace
  And another Owner attempts to remove me, or I attempt to remove the only other Owner leaving none
  When the removal is confirmed
  Then the removal is refused with a reason stating the Workspace would be left without an Owner
  And the membership is unchanged
```

## AC-11 — I cannot remove myself through this action

```gherkin
Scenario: Self-removal belongs to Leave, not to Remove
  Given I am an Owner or an Admin of a Workspace
  When I look at my own row on the members screen
  Then it offers no "Remove" action
  And if a removal targeting myself is attempted by any route
  Then it is refused with a reason that points me at leaving the Workspace instead
  And my membership is unchanged
```

## AC-12 — Removal frees a Seat

```gherkin
Scenario: The Seat count reflects the removal without any billing action
  Given my Workspace counts a number of Seats against its Tier
  When I remove one active member
  Then the Workspace's Seat count is one lower
  And no change is made to the Workspace's Billing Plan or Subscription
```

## AC-13 — The removal is recorded in the Activity Stream

```gherkin
Scenario: The act is an event, not a silent disappearance
  Given I am an Owner or an Admin of a Workspace with an Activity Stream
  When I confirm a teammate's removal
  Then the removal is recorded in that Workspace's Activity Stream as it happens
  And the entry names me as the actor, names the removed teammate, and records the moment it occurred
```

## AC-14 — A failed removal changes absolutely nothing

```gherkin
Scenario: Removal is all or nothing
  Given I confirmed the removal of a teammate
  And the removal could not be completed
  Then I am told the removal failed
  And that teammate is still an active member with the same role and the same joined date
  And their Personal Access Tokens for this Workspace still work
  And the Bugs assigned to them are still assigned to them
  And no removal entry was written to the Activity Stream
  And I can attempt the removal again
```

## AC-15 — Re-invitation is the only reversal, and it does not restore what was revoked

```gherkin
Scenario: A returning teammate comes back as a new joiner
  Given I removed a teammate who had been a Member since a year ago
  And they held a Personal Access Token scoped to this Workspace before removal
  When I invite them again and they accept
  Then they are an active member again with the role I picked at invite time
  And their joined date is the date they accepted the new invite, not the original one
  And the Personal Access Token revoked by the removal is still refused
  And they must issue a new Personal Access Token to regain programmatic access
```

## AC-16 — Removing someone here never touches another Workspace

```gherkin
Scenario: Isolation between Workspaces holds through a removal
  Given a teammate is an active member of both my Workspace and a second Workspace
  When I remove them from my Workspace
  Then their membership, role and joined date in the second Workspace are unchanged
  And the Bugs assigned to them in the second Workspace are still assigned to them
  And no entry about this removal appears in the second Workspace's Activity Stream
```

## AC-17 — An API consumer receives a distinct, non-disclosing outcome for each refusal

```gherkin
Scenario Outline: The four refusal paths are distinguishable except where non-disclosure requires otherwise
  Given I am an autonomous agent calling the Bunkai API with a Personal Access Token
    carrying the workspace:admin scope
  When I request the removal described by <case>
  Then the response status is <status>
  And the response carries the reason <reason>

  Examples:
    | case                                                          | status | reason               |
    | a target who is not a member of this Workspace                | 404    | (not disclosed)      |
    | a Workspace my Personal Access Token cannot see               | 404    | (not disclosed)      |
    | the removal would leave the Workspace with no Owner           | 409    | sole_owner           |
    | the target is the caller                                      | 409    | cannot*remove*self   |
    | I hold admin and the target holds owner                       | 403    | cannot*remove*owner  |
```

```gherkin
Scenario: A non-member target and an invisible Workspace are indistinguishable
  Given I am an autonomous agent calling the Bunkai API
  When I request the removal of a user who is not a member of a Workspace I administer
  And I request the removal of a user from a Workspace I have no membership in at all
  Then both responses are identical in status, body and timing shape
  And neither response reveals whether the Workspace exists
  And neither response reveals whether that user has an account
```

## AC-18 — The refusals hold against the data API, not only against the endpoint

```gherkin
Scenario: The ladder is enforced at the data layer, so bypassing the endpoint gains nothing
  Given I hold the admin role in a Workspace that also has an Owner
  And I address the membership records directly through the data API rather than through
    the removal endpoint
  When I attempt to delete the Owner's membership record directly
  Then the deletion is refused by the data layer itself
  And the Owner is still an active member of the Workspace
  When I attempt to delete my own membership record directly
  Then that deletion is also refused by the data layer itself
  When I attempt to delete a Member's membership record directly
  Then the ladder permits it, confirming the refusals above are rank-based and not a blanket denial
```

## AC-19 — The guards hold at both layers independently

```gherkin
Scenario: Neither layer is decorative
  Given a removal that must be refused, for any of the stated reasons
  When the request reaches the endpoint
  Then the endpoint refuses it before any record is touched
  When the same removal is requested in a way that reaches the underlying operation directly
  Then the underlying operation refuses it on its own, without relying on the endpoint's check
  And in both cases the membership, the Personal Access Tokens and the Bug assignments are unchanged
```

## AC-20 — The removal flow is reachable and operable by keyboard

```gherkin
Scenario: A keyboard-only administrator can complete and cancel a removal
  Given I am an Owner or an Admin navigating the members screen by keyboard only
  When I reach the "Remove" action on a teammate's row and activate it
  Then focus moves into the confirmation
  And I can reach the confirming and dismissing actions without a pointer
  And the confirmation announces the teammate's name and both stated consequences to a screen reader
  And dismissing returns focus to the row I started from
```

---
_Synced from Jira by sync-jira-issues_
