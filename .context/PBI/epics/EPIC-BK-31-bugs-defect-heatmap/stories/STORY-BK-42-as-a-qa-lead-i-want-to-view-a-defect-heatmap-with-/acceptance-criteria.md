# BK-42 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-42)

```
Scenario: See defect counts and trend per module over a 30-day window
  Given the project "Storefront" has modules "Checkout", "Cart" and "Search"
  And over the last 30 days "Checkout" has 12 defects, "Cart" has 4 and "Search" has 0
  When Mateo opens the defect heatmap with the window set to 30 days
  Then he sees a cell for each of "Checkout", "Cart" and "Search"
  And "Checkout" shows 12 defects, "Cart" shows 4 and "Search" shows 0
  And "Checkout" is visually emphasized as the strongest hotspot
```

```
Scenario: Week-over-week trend highlights a degrading module
  Given "Checkout" had 4 defects last week and 9 defects this week
  When Mateo views the heatmap
  Then the "Checkout" cell shows a rising trend indicator
  And the cell labels the change as roughly a 125% week-over-week increase
```

```
Scenario: A freshly filed defect appears in the heatmap promptly
  Given the "Search" module currently shows 0 defects on the heatmap
  When Elena files a new P2 defect against "Search"
  And Mateo refreshes the heatmap shortly after
  Then the "Search" cell shows 1 defect
  And "Search" is no longer shown as a zero-defect module
```

```
Scenario: Changing the window changes the counts
  Given "Cart" has 4 defects in the last 30 days but only 1 in the last 7 days
  When Mateo changes the window from 30 days to 7 days
  Then the "Cart" cell updates to show 1 defect
  And the trend recalculates for the 7-day window
```

```
Scenario: Modules with no defects in the window read as clean
  Given "Search" has 0 defects in the chosen 30-day window
  When Mateo views the heatmap
  Then the "Search" cell shows 0 defects
  And it is styled as a clean module, clearly distinct from the "Checkout" hotspot
```

```
Scenario: Nested modules are told apart by their path
  Given "Checkout" has a sub-module also named "Payment" and "Settings" has a sub-module named "Payment"
  When Mateo views the heatmap
  Then each "Payment" cell shows its full module path, such as "Checkout / Payment" and "Settings / Payment"
  And he can tell the two apart at a glance
```

---
_Synced from Jira by sync-jira-issues_
