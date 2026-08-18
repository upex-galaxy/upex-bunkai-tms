# BK-399 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-399)

## AC-01 — Set a test-design technique when editing an ATC

```gherkin
Scenario: Set a test-design technique on an ATC
  Given I have an ATC open in the editor
  When I set its test-design technique to "Boundary Value Analysis"
  Then the ATC shows "Boundary Value Analysis" as its technique after I save
```

---

## AC-02 — Set a priority when editing an ATC

```gherkin
Scenario: Set a priority on an ATC
  Given I have an ATC open in the editor
  When I set its priority to "High"
  Then the ATC shows "High" as its priority after I save
```

---

## AC-03 — Both fields are optional

```gherkin
Scenario: Saving an ATC with neither technique nor priority set remains valid
  Given I am creating or editing an ATC
  When I leave both the test-design technique and the priority unset
  Then the ATC saves successfully
  And it shows an explicit "not specified" state for both fields, not an error
```

---

## AC-04 — Filter the ATC list by technique

```gherkin
Scenario: Filter the ATC list by test-design technique
  Given ATCs exist with different test-design techniques, including some with none set
  When I filter the list by the "Pairwise" technique
  Then I see only ATCs whose technique is "Pairwise"
```

---

## AC-05 — Filter the ATC list by priority

```gherkin
Scenario: Filter the ATC list by priority
  Given ATCs exist with different priorities, including some with none set
  When I filter the list by "Critical" priority
  Then I see only ATCs whose priority is "Critical"
```

---

## AC-06 — A filter that matches nothing reads as empty, not broken

```gherkin
Scenario: Filtering by a technique no ATC carries returns an explicit empty result
  Given no ATC in the project uses the "State Transition" technique
  When I filter the list by "State Transition"
  Then I see an explicit "nothing found" result, not an error
```

---

## AC-07 — Values persist across a reload

```gherkin
Scenario: Technique and priority persist across a reload
  Given I set an ATC's technique to "Decision Table" and its priority to "Medium"
  When I reload the page
  Then the ATC still shows "Decision Table" as its technique and "Medium" as its priority
```

---

## AC-08 — Pre-existing ATCs show an explicit unset state

```gherkin
Scenario: An ATC created before this story shipped shows an explicit unset state
  Given an ATC was created before test-design technique and priority existed as fields
  When I view that ATC
  Then its technique reads as "not specified" and its priority reads as "not specified"
  And neither field shows a default technique or priority value
```

---

## AC-09 — Technique/priority filters combine with existing filters

```gherkin
Scenario: A technique filter combines with an already-active filter
  Given I have a layer filter active on the ATC list
  When I also filter by a test-design technique
  Then the list shows only ATCs matching both the active layer filter and the technique filter
```

---
_Synced from Jira by sync-jira-issues_
