# BK-10 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-10)

```gherkin
Scenario: Rename a Module
  Given a Module named "Payment" exists
  When I rename it to "Payments & Billing"
  Then the tree shows "Payments & Billing" in place of "Payment"
  And every breadcrumb under it reflects the new name
```

```gherkin
Scenario: Rename is rejected when the name is too short
  Given a Module named "Payment" exists
  When I rename it to "P"
  Then the name is not changed
  And I see a message that the name must be at least 2 characters
```

```gherkin
Scenario: Soft-delete removes a Module from the active tree
  Given a Module "Legacy" with no sub-modules
  When I delete "Legacy" and confirm
  Then "Legacy" no longer appears in the active tree
  And it is retained as archived rather than destroyed
```

```gherkin
Scenario: Deleting a parent Module cascades to its sub-tree and linked work
  Given a Module "Payment" with a sub-module "Refunds" and ATCs anchored under both
  When I delete "Payment" and confirm
  Then "Payment", "Refunds" and the anchored work are all archived together
  And none of that work is left orphaned in the tree
```

```gherkin
Scenario: A deleted Module's content is excluded from default listings
  Given a Module "Payment" has been deleted
  When I open the Project's default Module and ATC listings
  Then neither "Payment" nor its archived content appears
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:45.655Z_
