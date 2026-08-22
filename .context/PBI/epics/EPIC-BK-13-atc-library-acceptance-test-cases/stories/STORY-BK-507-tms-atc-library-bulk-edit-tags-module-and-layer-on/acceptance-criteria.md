# BK-507 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-507)

## AC-01 — Select individual ATCs

```gherkin
Scenario: Selecting ATC rows reveals the bulk-edit action and a live count
  Given I am viewing a Project's ATC list with several ATCs
  And nothing is selected
  When I select three ATCs
  Then the list shows that 3 ATCs are selected
  And a bulk-edit action becomes available
```

## AC-02 — Select and clear every listed ATC in one gesture

```gherkin
Scenario: The header control selects every listed ATC and clears them again
  Given I am viewing a Project's ATC list with 40 ATCs listed
  When I trigger the select-all control
  Then all 40 listed ATCs are selected and the count reads 40
  When I trigger the select-all control again
  Then no ATC is selected and the bulk-edit action is no longer available
```

## AC-03 — Bulk-edit action is unavailable with an empty selection

```gherkin
Scenario: No selection means no bulk-edit action
  Given I am viewing a Project's ATC list
  And no ATC is selected
  Then the bulk-edit action is not available
```

## AC-04 — Add a tag across the selection

```gherkin
Scenario: Adding a tag applies it to every selected ATC without disturbing their other tags
  Given I have selected 5 ATCs, each carrying its own set of tags
  When I bulk-add the tag "checkout" and confirm
  Then all 5 ATCs carry the tag "checkout"
  And every other tag each ATC already carried is still present
```

## AC-05 — Remove a tag across the selection

```gherkin
Scenario: Removing a tag clears it from every selected ATC and leaves the rest intact
  Given I have selected 5 ATCs, 3 of which carry the tag "legacy"
  When I bulk-remove the tag "legacy" and confirm
  Then none of the 5 ATCs carries the tag "legacy"
  And the 2 ATCs that never carried it are reported as succeeded, not failed
```

## AC-06 — Move the selection to another Module

```gherkin
Scenario: A bulk Module move relocates every selected ATC
  Given I have selected 12 ATCs in the Project "Bunkai Web"
  When I bulk-move them to the Module "Checkout / Payments" in the same Project and confirm
  Then all 12 ATCs report "Checkout / Payments" as their Module in the list
```

## AC-07 — Set the layer across the selection

```gherkin
Scenario: A bulk layer change sets the same layer on every selected ATC
  Given I have selected 8 ATCs with a mix of UI, API and Unit layers
  When I bulk-set the layer to "API" and confirm
  Then all 8 ATCs show the layer "API", with its colour paired with the text label "API"
```

## AC-08 — Confirmation names the change and the count before anything is written

```gherkin
Scenario: The confirmation step states exactly what will change and how many ATCs it touches
  Given I have selected 40 ATCs
  When I choose to move them to the Module "Checkout / Payments"
  Then I am asked to confirm a step that names both the destination Module and the number 40
  And no ATC has changed until I confirm
  When I cancel instead of confirming
  Then no ATC has changed and my selection of 40 is still intact
```

## AC-09 — Partial failure: the successful changes stand and the failures are named

```gherkin
Scenario: 3 of 40 ATCs fail to change and the outcome reports the split honestly
  Given I have selected 40 ATCs
  And 3 of them cannot be changed
  When I bulk-move all 40 to another Module and confirm
  Then I am told that 37 ATCs changed and 3 did not
  And each of the 3 that did not change is named, with the reason it did not
  And the 37 that changed show their new Module in the list immediately
  And the outcome is not presented as an error or as a rollback
```

## AC-10 — Partial failure keeps only the failures selected, so a retry is scoped

```gherkin
Scenario: After a partial failure only the ATCs that did not change stay selected
  Given a bulk edit of 40 ATCs has just finished with 37 changed and 3 unchanged
  Then exactly the 3 unchanged ATCs are still selected and the count reads 3
  And the 37 that changed are no longer selected
  When I retry the same change
  Then only those 3 ATCs are attempted
```

## AC-11 — Total failure changes nothing and keeps the whole selection

```gherkin
Scenario: When no ATC in the selection can be changed, nothing changes and nothing is lost
  Given I have selected 40 ATCs
  And none of them can be changed
  When I bulk-move them to another Module and confirm
  Then I am told that 0 ATCs changed and 40 did not, with the reason
  And all 40 ATCs are still selected
  And no ATC in the list shows a changed value
```

## AC-12 — Full success clears the selection

```gherkin
Scenario: A bulk edit where every ATC changed leaves nothing selected
  Given I have selected 12 ATCs
  When I bulk-set their layer to "Unit" and confirm
  And all 12 change successfully
  Then I am told that 12 ATCs changed and 0 did not
  And no ATC is selected any more
```

## AC-13 — A bulk edit propagates to chained Tests exactly as a single edit does

```gherkin
Scenario: Tests that chain a bulk-edited ATC reflect the change
  Given a Test chains one of the ATCs I have selected
  When I bulk-edit that selection and it succeeds
  Then the Test reflects the changed ATC the same way it would after editing that ATC on its own
```

## AC-14 — Each changed ATC is audited on its own

```gherkin
Scenario: The Activity Stream records one entry per ATC, not one entry per bulk action
  Given I bulk-edit 12 ATCs and all 12 change
  When I open the workspace Activity Stream
  Then I see 12 separate entries, one naming each changed ATC
```

## AC-15 — A bulk edit cannot change an ATC the member could not change alone

```gherkin
Scenario: Batching does not widen what a member is allowed to change
  Given my selection includes an ATC I am not allowed to edit on its own
  When I bulk-edit the selection and confirm
  Then that ATC is reported among the ones that did not change, with the reason
  And the ATCs I am allowed to edit still change
```

---
_Synced from Jira by sync-jira-issues_
