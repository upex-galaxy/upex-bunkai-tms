# BK-373 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

```gherkin
Scenario: AC-1 — A failed send retries itself
  Given a defect whose send to Jira failed for a reason that could still clear
  When time passes
  Then Bunkai attempts the send again on its own
  And Mateo does nothing to make that happen
```

```gherkin
Scenario: AC-2 — Retries slow down but do not stop
  Given a defect that has failed to reach Jira several times in a row
  Then each further attempt is spaced further apart than the last, up to a ceiling on the interval
  And the attempts never stop while the failure is one that could still clear
```

```gherkin
Scenario: AC-3 — A failure that cannot clear stops retrying
  Given a defect whose send failed because the destination cannot accept it at all
  Then no further attempts are made
  And the defect shows the sync-failed state with the reason
```

```gherkin
Scenario: AC-4 — A sent defect shows where it landed
  Given a defect that reached Jira
  When Mateo opens the defect record
  Then the External tracker panel shows the sent state, the Jira issue key as a way to open it, and when it was last sent
```

```gherkin
Scenario: AC-5 — A failed defect shows why, and stays usable
  Given a defect whose send failed
  When Mateo opens the defect record
  Then the External tracker panel shows the failed state with the reason and when it was attempted
  And it says the defect is fully saved in Bunkai and stays usable
  And every other action on the defect still works
```

```gherkin
Scenario: AC-6 — No manual retry control
  Given a defect in the sync-failed state
  When Mateo looks at the External tracker panel
  Then there is no retry control for him to press
  And the panel tells him retries happen automatically once the connection is fixed in Settings
```

```gherkin
Scenario: AC-7 — No panel when the project has no destination
  Given a Project whose defect sync is not enabled
  When Mateo opens a defect filed in that Project
  Then the External tracker panel is absent entirely, with no badge and no empty panel
```

```gherkin
Scenario: AC-8 — Rate limiting reads as delayed, never as failed
  Given Jira is rate-limiting Bunkai
  When a send is deferred because of it
  Then the defect does not show the sync-failed state
  And the send is simply attempted later
```

```gherkin
Scenario: AC-9 — An interrupted attempt never yields a second issue
  Given a send attempt that reached Jira but was interrupted before recording the result
  When the recovery picks that defect up
  Then it adopts the Jira issue that already exists
  And no second Jira issue is created
```

---
_Synced from Jira by sync-jira-issues_
