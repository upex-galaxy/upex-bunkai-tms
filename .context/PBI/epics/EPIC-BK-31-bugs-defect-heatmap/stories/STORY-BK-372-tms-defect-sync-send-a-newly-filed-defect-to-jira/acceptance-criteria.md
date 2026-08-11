# BK-372 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

```gherkin
Scenario: AC-1 — A newly filed defect is sent automatically
  Given a Project whose defect sync is enabled and pointed at a Jira destination
  When Elena files a defect in that Project
  Then the defect is sent to that Jira destination without anyone asking for it
```

```gherkin
Scenario: AC-2 — Filing never waits on the send
  Given Jira is unreachable
  When Elena files a defect
  Then the defect is saved in Bunkai and appears in her list straight away
  And the failed send is recorded against the defect rather than reported as a filing error
```

```gherkin
Scenario: AC-3 — The Jira issue links back to Bunkai
  Given a defect has been sent to Jira successfully
  When Sara opens the resulting Jira issue
  Then it contains a link back to that defect's record in Bunkai
```

```gherkin
Scenario: AC-4 — One defect, at most one Jira issue, forever
  Given a defect that already carries a reference to a Jira issue
  When a further send is attempted for that defect, for any reason
  Then no second Jira issue is created
  And the defect keeps its original reference
```

```gherkin
Scenario: AC-5 — Severity and module carry across
  Given a defect recorded at a given severity and anchored to a Module
  When it is sent to Jira
  Then the Jira issue's priority reflects that severity
  And the Module's full path appears in the issue body
  And no evidence attachment leaves Bunkai
```

```gherkin
Scenario: AC-6 — Sync not enabled for the project
  Given a Project whose defect sync is not enabled
  When Elena files a defect in that Project
  Then no send is attempted
  And the defect carries no sync state
  And no sync error is shown anywhere on it
```

```gherkin
Scenario: AC-7 — One-way only
  Given a defect that has been sent to Jira
  When the Jira issue is edited, transitioned or commented on
  Then nothing about the Bunkai defect changes
```

```gherkin
Scenario: AC-8 — Edits after the send do not travel
  Given a defect that has already been sent to Jira
  When its content is changed in Bunkai
  Then the Jira issue is left exactly as it was
```

---
_Synced from Jira by sync-jira-issues_
