# BK-512 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

## AC-01 — An Owner finds Delete workspace on the rows they own

```gherkin
Scenario: The Delete workspace action appears only on owned rows
  Given I am signed in and I own one of the workspaces I belong to
  And I am only a Member of another workspace in the same list
  When I open Settings and go to Workspaces
  Then the row for the workspace I own offers a "Delete workspace" action
  And the row where I am only a Member offers no "Delete workspace" action
  And the "Leave" action is still present and unchanged on the rows that already offered it
```

## AC-02 — Admin, Member and Viewer never reach workspace deletion

```gherkin
Scenario: A non-Owner cannot see or reach the deletion
  Given I am signed in with the Admin, Member or Viewer role in a workspace
  When I open Settings and go to Workspaces
  Then no "Delete workspace" action is offered for that workspace
  And I cannot reach a workspace deletion for it by any route in Settings
```

## AC-03 — The confirmation names the workspace and states the consequence before anything happens

```gherkin
Scenario: The Owner is told what deletion means before committing
  Given I am the Owner of a workspace
  When I choose "Delete workspace" on its row
  Then a confirmation opens naming that exact workspace and no other
  And it states that the workspace and everything inside it will be removed
  And it states that the deletion happens immediately and cannot be undone
  And nothing has been deleted yet
```

## AC-04 — Typing the exact workspace name gates the destructive action

```gherkin
Scenario: The destructive action stays out of reach until the name matches exactly
  Given the delete confirmation for my workspace is open
  When I have typed nothing
  Then the confirming action is unavailable
  When I type a name that differs from the workspace's name in any way
  Then the confirming action is still unavailable
  When I type the workspace's exact name
  Then the confirming action becomes available
```

## AC-05 — Backing out of the confirmation changes nothing

```gherkin
Scenario: Dismissing the confirmation leaves the workspace untouched
  Given the delete confirmation for my workspace is open and I have typed its exact name
  When I dismiss the confirmation instead of confirming
  Then the workspace still exists with all of its contents
  And I am back on the Workspaces list with that workspace still listed
  And reopening the confirmation starts with an empty name field
```

## AC-06 — An export is offered before the deletion, not after

```gherkin
Scenario: The Owner is offered their data before it is erased
  Given the delete confirmation for my workspace is open
  Then it offers me a way to export this workspace's data first
  And it explains that the data cannot be exported once the workspace is deleted
  When I take that offer
  Then I am taken to the workspace data export without the deletion having happened
  And I can return to the delete confirmation afterwards
```

## AC-07 — Confirming removes the workspace and everything inside it

```gherkin
Scenario: The whole workspace is gone
  Given I am the Owner of a workspace holding Projects, Modules, User Stories,
    Acceptance Criteria, ATCs, Tests, Runs, Bugs, Milestones and Project environments
  When I confirm the deletion with the exact name typed
  Then the workspace is no longer listed anywhere for me
  And none of its Projects, Modules, User Stories, Acceptance Criteria, ATCs,
    Tests, Runs, Bugs, Milestones or Project environments can be reached any more
  And its memberships, pending invites, Personal Access Tokens and Notifications are gone with it
```

## AC-08 — Other members lose access immediately

```gherkin
Scenario: A member of the deleted workspace can no longer reach it
  Given a teammate is an active Member of the workspace I am about to delete
  When I confirm the deletion
  And my teammate next loads the app
  Then the deleted workspace is absent from their list of workspaces
  And they cannot reach any screen belonging to it
  And every other workspace they belong to is unaffected
```

## AC-09 — A member whose active workspace was deleted is re-pointed, not stranded

```gherkin
Scenario: The deleted workspace was someone's active workspace
  Given a teammate has the workspace I am about to delete set as their active workspace
  And they also belong to at least one other workspace
  When I confirm the deletion
  And my teammate next loads the app
  Then they are placed in one of the workspaces they still belong to
  And the app tells them which workspace they are now in
  And they are not signed out and are not shown a broken shell
```

## AC-10 — Deleting my only workspace lands me on onboarding

```gherkin
Scenario: The Owner deletes the last workspace they belong to
  Given the workspace I am deleting is the only workspace I belong to
  When I confirm the deletion
  Then I am taken to onboarding
  And I am offered the ways to create or join a workspace
  And I am still signed in
```

## AC-11 — Deleting one of several workspaces moves me to another

```gherkin
Scenario: The Owner still belongs to other workspaces afterwards
  Given I am the Owner of the workspace I am deleting
  And I belong to at least one other workspace
  When I confirm the deletion
  Then I land in one of the workspaces I still belong to
  And the app tells me which workspace I am now in
  And that workspace's contents are unchanged
```

## AC-12 — Being the only Owner does not block the deletion

```gherkin
Scenario: A sole Owner may delete, even though a sole Owner may not leave
  Given I am the only Owner of my workspace and other members belong to it
  When I open the Workspaces list
  Then the "Leave" action for that workspace is still refused with its stated reason
  And the "Delete workspace" action is offered and is not refused
  When I confirm the deletion with the exact name typed
  Then the workspace is deleted
```

## AC-13 — Personal Access Tokens issued against the workspace stop working

```gherkin
Scenario: A PAT never outlives the workspace it was issued for
  Given a Personal Access Token has been issued against my workspace and works today
  When I delete that workspace
  And the token is used afterwards
  Then it is refused
  And it is refused without revealing that the workspace ever existed
```

## AC-14 — Pending invites to the workspace stop working

```gherkin
Scenario: An outstanding invite dies with its workspace
  Given an invite to my workspace is outstanding and has not been accepted
  When I delete the workspace
  And the invited person opens their invite afterwards
  Then the invite is refused
  And it is refused without revealing that the workspace ever existed
```

## AC-15 — A run in progress does not block the deletion

```gherkin
Scenario: An in-flight run is erased with everything else
  Given a Run in my workspace is still running
  When I confirm the deletion of that workspace
  Then the deletion goes through without asking me to wait for the Run
  And the Run and its recorded steps are gone with the workspace
```

## AC-16 — Deleting one workspace never touches another

```gherkin
Scenario: Isolation between workspaces holds through a deletion
  Given I own two workspaces, each with its own Projects, Tests, Runs and members
  When I delete the first one
  Then the second workspace is completely unchanged
  And every Project, Test, Run, Bug and member of the second workspace is still there
  And no member of the second workspace loses access to it
```

## AC-17 — The deletion is recorded in the Activity Stream as it happens

```gherkin
Scenario: The act is an event, not a silent disappearance
  Given I am the Owner of a workspace with an Activity Stream
  When I confirm the deletion
  Then the deletion is recorded in that workspace's Activity Stream as it happens,
    naming me as the actor and the moment it occurred
```

## AC-18 — A failed deletion leaves the workspace whole

```gherkin
Scenario: Deletion is all or nothing
  Given I confirmed the deletion of my workspace
  And the deletion could not be completed
  Then I am told the deletion failed
  And the workspace is still listed with every Project, Test, Run and Bug it had
  And no part of it has been removed
  And I can attempt the deletion again
```

## AC-19 — Deleting is visibly not the same act as leaving

```gherkin
Scenario: The two actions are never mistaken for each other
  Given I am the Owner of a workspace that other members also belong to
  When I open the Workspaces list
  Then "Leave" and "Delete workspace" are offered as two separate, separately labelled actions
  And each confirmation states what happens to the other members:
    leaving removes only me, deleting removes the workspace for everyone
```

## AC-20 — The delete flow is reachable and operable by keyboard

```gherkin
Scenario: A keyboard-only Owner can complete and cancel the deletion
  Given I am the Owner of a workspace and I am navigating by keyboard only
  When I reach the "Delete workspace" action and activate it
  Then focus moves into the confirmation
  And I can reach the name field and the confirming and dismissing actions without a pointer
  And dismissing returns focus to where I started
```

---
_Synced from Jira by sync-jira-issues_
