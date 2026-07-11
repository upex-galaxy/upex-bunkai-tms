# BK-230 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-230)

```gherkin
Scenario: Owner compares tiers before choosing
  Given Mateo is the owner of the workspace "Acme QA" on the Free plan
  When he chooses "Upgrade" in the Billing section
  Then he sees the Free, Team, and Enterprise tiers side by side
  And each tier shows its limits (seats, projects, run history retention) and its price model
  And the current plan is clearly marked
```

```gherkin
Scenario: Successful upgrade from Free to Team unlocks limits immediately
  Given "Acme QA" is on the Free plan with the 3-project limit reached
  When Mateo selects the Team plan for 10 seats, enters a valid payment method, and confirms
  Then the workspace is on the Team plan immediately
  And creating a 4th project now succeeds
  And Mateo receives a confirmation receipt for the purchase
```

```gherkin
Scenario: Payment is declined
  Given Mateo confirms the Team plan with a card that is declined
  Then the workspace stays on the Free plan with nothing charged
  And he sees a clear message that the payment was declined
  And he can retry with a different payment method without re-entering the plan choice
```

```gherkin
Scenario: Enterprise is a contact path, not a checkout
  Given Mateo is viewing the tier comparison
  When he selects the Enterprise tier
  Then he is offered a contact path to the Bunkai team
  And no payment method entry is requested
```

```gherkin
Scenario: Only the owner can complete an upgrade
  Given an admin of "Acme QA" who is not the workspace owner
  When the admin opens the tier comparison
  Then the admin can view the tiers but cannot confirm a purchase
  And the admin is told the workspace owner completes upgrades
```

---
_Synced from Jira by sync-jira-issues_
