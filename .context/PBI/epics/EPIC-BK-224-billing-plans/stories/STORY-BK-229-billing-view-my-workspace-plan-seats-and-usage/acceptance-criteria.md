# BK-229 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

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
Scenario: Usage meter signals an approaching limit
  Given the workspace "Acme QA" has created 9 projects out of a 10-project limit
  When Mateo opens the Billing section in Settings
  Then the projects meter shows "9 of 10" in a warning state
```

```gherkin
Scenario: Free workspace shows limits and an upgrade entry instead of renewal data
  Given the workspace "Acme QA" is on the Free plan
  When Mateo opens the Billing section in Settings
  Then he sees the plan name "Free" with its limits
  And no renewal date or payment method is shown
  And he sees an option to upgrade to a paid plan
```

```gherkin
Scenario: A member cannot open the billing view
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

---
_Synced from Jira by sync-jira-issues_
