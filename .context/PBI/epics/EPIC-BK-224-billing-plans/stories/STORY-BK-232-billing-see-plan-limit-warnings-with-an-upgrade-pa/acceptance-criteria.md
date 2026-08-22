# BK-232 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-232)

```
Scenario: Approaching a limit shows a non-blocking warning
  Given the workspace "Acme QA" is on the Free plan with 9 of 10 projects used
  When Elena creates the 9th project
  Then the project is created normally
  And she sees a dismissible warning that the workspace is approaching its project limit
  And her current work is not interrupted
```

```
Scenario: Hitting a limit as a non-owner shows a friendly block with the owner path
  Given "Acme QA" has reached its 10-project limit
  And Elena is a member, not the workspace owner
  When she tries to create an 11th project
  Then the creation is blocked with a message explaining the plan limit
  And the message names the workspace owner as the person who can upgrade the plan
  And no upgrade checkout is offered to her
```

```
Scenario: Hitting a limit as the owner routes directly to the upgrade flow
  Given "Acme QA" has reached its 10-project limit
  And Mateo, the workspace owner, tries to create an 11th project
  Then the creation is blocked with the same plan-limit explanation
  And he is offered a direct path to the upgrade flow
```

```
Scenario: The blocked action succeeds right after the owner upgrades
  Given Elena was blocked from creating an 11th project on the Free plan
  When the workspace owner completes an upgrade to the Team plan
  And Elena retries the project creation
  Then the project is created without her signing out or reloading her session
```

---
_Synced from Jira by sync-jira-issues_
