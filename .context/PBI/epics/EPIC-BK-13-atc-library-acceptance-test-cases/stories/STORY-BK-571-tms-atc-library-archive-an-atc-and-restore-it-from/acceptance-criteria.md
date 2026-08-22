# BK-571 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-571)

## AC-01 — Archive an ATC

```gherkin
Scenario: Archiving an ATC removes it from circulation after an explicit confirmation
  Given I am a Senior QA Engineer viewing an ATC named "Login with expired token" that I can edit in its Project
  When I choose to archive it
  Then I am asked to confirm, and the confirmation names the ATC and states that archiving is reversible
  And the confirmation states how many Tests currently chain this ATC
  When I confirm
  Then the ATC is archived
  And I am told it was archived and how to restore it
```

```gherkin
Scenario: Cancelling the confirmation leaves the ATC untouched
  Given I am asked to confirm archiving an ATC
  When I dismiss the confirmation without confirming
  Then the ATC is not archived
  And nothing about it has changed
```

## AC-02 — An archived ATC leaves every default library surface

```gherkin
Scenario: An archived ATC no longer appears where ATCs are offered for reuse
  Given an ATC has been archived
  When I browse its Project's ATC list with no archived view opted into
  Then that ATC is absent from the list
  And any ATC count shown alongside that list no longer includes it
  And it is absent from ATC search results and from the command palette
```

```gherkin
Scenario: Archiving one ATC leaves its siblings alone
  Given a Module holds four ATCs
  When I archive exactly one of them
  Then the other three still appear in the list exactly as before
```

## AC-03 — Review the archived ATCs in their own view

```gherkin
Scenario: An opt-in archived view lists what has been archived
  Given several ATCs have been archived in my workspace
  When I opt into viewing archived ATCs
  Then I see those ATCs listed and clearly marked as archived
  And each one shows who archived it and when
  And each one still shows its name, owning Project, Module, layer and anchored User Story / Acceptance Criterion
```

```gherkin
Scenario: A workspace that has archived nothing says so without reading as an error
  Given no ATC in my workspace has ever been archived
  When I opt into viewing archived ATCs
  Then I see an explicit empty state saying nothing has been archived
  And nothing on the screen reads as an error
```

```gherkin
Scenario: The archived view respects the same access rules as the library
  Given an ATC was archived in a Project I am not a member of
  When I opt into viewing archived ATCs
  Then that ATC never appears in the archived list
```

## AC-04 — Restore an archived ATC

```gherkin
Scenario: Restoring an archived ATC returns it to full circulation
  Given an ATC named "Login with expired token" is archived
  When I restore it from the archived view
  Then it reappears in its Project's ATC list, in any count shown alongside it, in ATC search and in the command palette
  And it is no longer marked as archived
  And it is editable again
  And it can be added as a step to a Test chain again
```

```gherkin
Scenario: Restoring reports what happened
  Given I restore an archived ATC
  Then I am told which ATC was restored
  And it disappears from the archived view
```

## AC-05 — Archiving an ATC that Tests currently chain is warned about, not refused

```gherkin
Scenario: The warning names the real usage before anything is written
  Given an ATC is chained by 3 Tests
  When I choose to archive it
  Then the confirmation warns me that 3 Tests chain this ATC and names them
  And it states that those Tests keep the ATC in their chains
  And I am still able to proceed
```

```gherkin
Scenario: Archiving an in-use ATC is allowed and never edits the Tests that chain it
  Given an ATC is chained by 3 Tests, at 4 chain positions in total
  When I archive it
  Then the archive succeeds
  And all 4 chain positions remain exactly where they were, in the same order
  And none of the 3 Tests loses a step or changes its step count
  And each of those Tests shows that one of its steps refers to an archived ATC
```

```gherkin
Scenario: Archiving an ATC that no Test chains needs no usage warning
  Given an ATC that no Test chains
  When I choose to archive it
  Then the confirmation states that no Test chains it
  And no usage warning is shown
```

## AC-06 — Historical Run evidence is never blanked by archiving

```gherkin
Scenario: A past Run of an archived ATC still renders in full
  Given a Run executed a Test whose chain included an ATC named "Login with expired token"
  And that Run finished and recorded a result for every step
  When that ATC is archived afterwards
  And I open that past Run
  Then every step of the Run still renders, including the one for "Login with expired token"
  And that step still shows the step content and assertions exactly as they were recorded at execution time
  And that step still shows the result it recorded
  And no step renders blank, missing, or as "not found"
```

```gherkin
Scenario: Archiving does not change any recorded Run outcome
  Given a finished Run recorded a failing result on a step whose ATC is later archived
  When I reopen that Run after the ATC is archived
  Then the Run's own outcome is unchanged
  And the failing step still reads as failing
```

```gherkin
Scenario: A Defect raised against an archived ATC keeps its evidence
  Given a Defect was raised from a Run step whose ATC is later archived
  When I open that Defect
  Then it still resolves and displays the ATC and Run it was anchored to
```

## AC-07 — Traceability and coverage keep counting an archived ATC as evidence

```gherkin
Scenario: An Acceptance Criterion covered only by an archived ATC is not reported as uncovered
  Given an Acceptance Criterion is bound to exactly one ATC
  And that ATC has been run at least once
  When that ATC is archived
  And I open the User Story's Traceability chain
  Then the Acceptance Criterion still shows the ATC, the Test and the Run as its evidence
  And the ATC is marked as archived in that chain
  And the Acceptance Criterion is not reported as "uncovered"
```

## AC-08 — An archived ATC is frozen until it is restored

```gherkin
Scenario: An archived ATC cannot be edited
  Given an ATC is archived
  When I try to change its name, steps, assertions, tags, Module, layer or anchored Acceptance Criteria
  Then the change is refused
  And I am told the ATC is archived and must be restored first
```

```gherkin
Scenario: An archived ATC cannot be added as a new step to a Test chain
  Given an ATC is archived
  When I build or edit a Test chain
  Then that ATC is not offered as a step to add
```

## AC-09 — Only someone who could edit the ATC can archive or restore it

```gherkin
Scenario: A member without write access to the Project cannot archive
  Given I can read a Project but not write to it
  When I view one of its ATCs
  Then no archive action is offered to me
  And an archive attempt is refused
```

```gherkin
Scenario: Restoring requires the same access as archiving
  Given I can read a Project but not write to it
  When I view its archived ATCs
  Then no restore action is offered to me
```

## AC-10 — Archive and restore are each recorded in the workspace Activity Stream

```gherkin
Scenario: Archiving and restoring each leave their own audit entry
  Given I archive an ATC and later restore it
  When I open the workspace Activity Stream
  Then I see one entry recording the archive, naming the ATC and me
  And I see a separate later entry recording the restore, naming the ATC and me
```

## AC-11 — Repeating the action is harmless

```gherkin
Scenario: Archiving an already-archived ATC changes nothing
  Given an ATC is already archived
  When an archive is attempted on it again
  Then the outcome is reported as success
  And neither who archived it nor when it was archived changes
```

```gherkin
Scenario: Restoring an ATC that is not archived changes nothing
  Given an ATC is not archived
  When a restore is attempted on it
  Then the outcome is reported as success
  And the ATC is unchanged
```

## AC-12 — Archiving never destroys an ATC

```gherkin
Scenario: No action in this story permanently removes an ATC
  Given an ATC has been archived
  Then the ATC record still exists and is reachable from the archived view
  And no action offered on this screen permanently deletes it
```

```gherkin
Scenario: A failed archive leaves everything as it was
  Given archiving an ATC fails partway
  When I return to the ATC list
  Then the ATC is not archived
  And I see a named error explaining what failed
  And I can retry the same action
```

---
_Synced from Jira by sync-jira-issues_
