# BK-229 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

```gherkin
Scenario: Workspace owner views the billing overview of a paid workspace
  Given Mateo is the owner of the workspace "Acme QA" on the Team plan
  And the workspace has 8 active members out of a 10-seat limit
  When Mateo opens the Billing section in Settings
  Then he sees the plan name "Team", the per-seat price, and the next renewal date
  And he sees the seat meter "8 of 10 seats"
  And he sees a usage meter for each plan-limited resource, including projects and run history retention
```

```gherkin
Scenario: Workspace owner views the billing overview of an Enterprise workspace
  Given Mateo is the owner of the workspace "Acme QA" on the Enterprise plan
  And the workspace has 15 active members out of a 50-seat limit
  When Mateo opens the Billing section in Settings
  Then he sees the plan name "Enterprise", the per-seat price "Custom", and the next renewal date
  And he sees the seat meter "15 of 50 seats"
  And he sees a usage meter for each plan-limited resource, including projects and run history retention
```

```gherkin
Scenario: Usage meter signals an approaching limit
  Given the workspace "Acme QA" has created 9 projects out of a 10-project limit
  When Mateo opens the Billing section in Settings
  Then the projects meter shows "9 of 10" in a warning state
```

```gherkin
Scenario: Usage meter signals warning state at exactly 80% boundary
  Given the workspace "Acme QA" has created 8 projects out of a 10-project limit
  When Mateo opens the Billing section in Settings
  Then the projects meter shows "8 of 10" in a warning state
```

```gherkin
Scenario: Usage meter signals a reached limit
  Given the workspace "Acme QA" has created 10 projects out of a 10-project limit
  When Mateo opens the Billing section in Settings
  Then the projects meter shows "10 of 10" in a limit-reached state
```

```gherkin
Scenario: Usage meter signals an exceeded limit
  Given the workspace "Acme QA" has created 11 projects out of a 10-project limit
  When Mateo opens the Billing section in Settings
  Then the projects meter shows "11 of 10" in a limit-reached state
```

```gherkin
Scenario: Free workspace shows limits and an upgrade entry instead of renewal data
  Given the workspace "Acme QA" is on the Free plan
  And the Free plan has a limit of 3 projects and 5 seats
  When Mateo opens the Billing section in Settings
  Then he sees the plan name "Free" with its limits
  And he sees the text "No active subscription" instead of a renewal date
  And he sees a usage meter for projects showing current usage against the 3-project limit
  And he sees a usage meter for run history retention showing current usage against 30-day limit
  And he sees an option to upgrade to a paid plan
```

```gherkin
Scenario: Run history retention meter shows correct limit for paid plan
  Given the workspace "Acme QA" is on the Team plan with 90-day run history retention
  When Mateo opens the Billing section in Settings
  Then the run history meter shows current usage against 90-day limit
```

```gherkin
Scenario: A workspace owner can open the billing view
  Given Mateo is the owner of the workspace "Acme QA"
  When he opens the Settings hub
  Then the Billing section is shown to him
```

```gherkin
Scenario: A workspace admin can open the billing view
  Given Carlos is an admin of the workspace "Acme QA"
  When he opens the Settings hub
  Then the Billing section is shown to him
```

```gherkin
Scenario: A workspace member cannot open the billing view
  Given Elena is a member (not owner or admin) of the workspace "Acme QA"
  When she opens the Settings hub
  Then the Billing section is not offered to her
```

```gherkin
Scenario: Seat meter counts active members only
  Given the workspace "Acme QA" has 8 active members and 2 pending invitations
  When Mateo opens the Billing section in Settings
  Then the seat meter shows "8 of 10 seats"
  And the pending invitations do not consume a seat
```

```gherkin
Scenario: Suspended members do not count toward the seat meter
  Given the workspace "Acme QA" has 7 active members, 1 suspended member, and 2 pending invitations
  When Mateo opens the Billing section in Settings
  Then the seat meter shows "7 of 10 seats"
```

```gherkin
Scenario: Seat meter shows zero when no active members exist
  Given the workspace "Acme QA" has 0 active members
  When Mateo opens the Billing section in Settings
  Then the seat meter shows "0 of 10 seats"
```

```gherkin
Scenario: Seat meter shows exceeded limit when active members surpass plan limit
  Given the workspace "Acme QA" has 11 active members out of a 10-seat limit
  When Mateo opens the Billing section in Settings
  Then the seat meter shows "11 of 10 seats" in a limit-reached state
```

```gherkin
Scenario: Billing view handles API failure gracefully
  Given Mateo is the owner of the workspace "Acme QA"
  And the billing API is unavailable
  When Mateo opens the Billing section in Settings
  Then he sees an error message "Unable to load billing info"
  And he sees a retry button
```

```gherkin
Scenario: Billing view handles API timeout gracefully
  Given Mateo is the owner of the workspace "Acme QA"
  And the billing API takes longer than 10 seconds to respond
  When Mateo opens the Billing section in Settings
  Then he sees a loading state
  And after timeout he sees an error message "Unable to load billing info"
  And he sees a retry button
```

---
_Synced from Jira by sync-jira-issues_
