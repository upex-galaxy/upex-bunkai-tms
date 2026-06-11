# BK-41 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

```
Scenario: List defects for a module including its sub-modules
  Given the module "Checkout" has sub-modules "Promo codes" and "Payment"
  And there are 3 defects under "Promo codes" and 2 under "Payment"
  When Elena selects the module "Checkout"
  Then she sees all 5 defects in the list
  And the defects from both sub-modules are included
```

```
Scenario: Filter by severity and status combined
  Given the module "Checkout" has 5 defects: 2 are P1 and open, 1 is P1 and resolved, and 2 are P3 and open
  When Elena filters by severity "P1" and status "open"
  Then the list shows only the 2 defects that are both P1 and open
  And the other 3 defects are hidden from the list
```

```
Scenario: Counts by severity and status reflect the current view
  Given the module "Checkout" with no filters applied shows 5 defects
  When Elena looks at the summary counts
  Then she sees "P1: 3, P2: 0, P3: 2, P4: 0" by severity
  And she sees "open: 4, in progress: 0, resolved: 1, closed: 0" by status
```

```
Scenario: Counts recompute when a filter is applied
  Given the module "Checkout" shows 5 defects with counts "open: 4, resolved: 1"
  When Elena filters by status "open"
  Then the list shows the 4 open defects
  And the status counts update to "open: 4, in progress: 0, resolved: 0, closed: 0"
```

```
Scenario: A filter combination with no matches shows an empty state
  Given the module "Checkout" has no defects with severity "P4"
  When Elena filters by severity "P4"
  Then the list shows the message "No defects match these filters"
  And the severity counts show "P4: 0"
```

```
Scenario: A module with no defects at all shows an empty state
  Given the module "Wishlist" has no defects and no sub-modules with defects
  When Elena selects the module "Wishlist"
  Then she sees the message "No defects match these filters"
  And all severity and status counts show 0
```

---
_Synced from Jira by sync-jira-issues_
