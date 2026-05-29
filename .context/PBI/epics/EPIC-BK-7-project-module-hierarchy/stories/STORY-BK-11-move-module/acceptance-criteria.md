# BK-11 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-11)

```gherkin
Scenario: Move a Module to a new parent
  Given Modules "Payment" and "Checkout" exist at the Project root
  When I move "Payment" under "Checkout"
  Then "Payment" appears nested beneath "Checkout"
  And its breadcrumb reads "Checkout / Payment"
```

```gherkin
Scenario: Moving a Module relocates its whole sub-tree
  Given "Payment" contains a sub-module "Refunds"
  When I move "Payment" under "Checkout"
  Then "Refunds" moves with it
  And its breadcrumb reads "Checkout / Payment / Refunds"
```

```gherkin
Scenario: Moving a Module onto its own descendant is blocked
  Given "Payment" contains a sub-module "Refunds"
  When I try to move "Payment" under "Refunds"
  Then the move is rejected
  And I see a message that a Module cannot be moved under its own sub-module
```

```gherkin
Scenario: A move that would exceed the maximum depth is blocked
  Given moving a branch would place its deepest Module at the 7th level
  When I confirm the move
  Then the move is rejected
  And I see a message that the maximum nesting depth is 6 levels
```

```gherkin
Scenario: Move a nested Module back to the Project root
  Given "Payment" is nested under "Checkout"
  When I move "Payment" to the Project root
  Then "Payment" appears as a top-level Module
  And its breadcrumb shows only "Payment"
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:47.774Z_
