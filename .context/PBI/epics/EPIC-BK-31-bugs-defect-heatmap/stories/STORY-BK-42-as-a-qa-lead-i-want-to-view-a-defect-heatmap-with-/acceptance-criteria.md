# BK-42 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-42)

```gherkin
@happy
Scenario: Heatmap returns one active module cell per project module
  Given Mateo is an authorized QA Lead for project "Storefront"
  And the project has active modules "Checkout", "Cart", and "Search"
  When Mateo opens the defect heatmap with the default window
  Then the heatmap uses the 30-day window
  And it shows one cell for each active module
  And each cell includes the module name, full module path, defect count, and trend indicator

@happy
Scenario: Module defect counts roll up descendant module defects inside the selected window
  Given module "Checkout" has child module "Checkout / Payment"
  And 2 defects were filed against "Checkout" in the last 30 days
  And 3 defects were filed against "Checkout / Payment" in the last 30 days
  When Mateo views the 30-day heatmap
  Then the "Checkout" cell shows a defect count of 5
  And the "Checkout / Payment" cell remains visible with its own defect count

@happy
Scenario: User can switch between supported heatmap windows
  Given "Cart" has 1 defect in the last 7 days, 4 defects in the last 30 days, and 8 defects in the last 90 days
  When Mateo switches the heatmap window between 7d, 30d, and 90d
  Then the "Cart" count updates to 1, 4, and 8 respectively
  And the selected window is visible to the user

@happy
Scenario: Week-over-week trend uses the latest 7-day UTC bucket versus the previous 7-day UTC bucket
  Given "Checkout" has 9 defects in the latest 7-day UTC bucket
  And "Checkout" had 4 defects in the immediately previous 7-day UTC bucket
  When Mateo views the defect heatmap
  Then the "Checkout" cell shows trend direction "rising"
  And it exposes the current week count of 9 and previous week count of 4
  And it shows a week-over-week increase of approximately 125 percent

@boundary
Scenario: Trend handles zero previous-week baseline without infinite percent
  Given "Search" had 0 defects in the previous 7-day UTC bucket
  And "Search" has 2 defects in the latest 7-day UTC bucket
  When Mateo views the defect heatmap
  Then the "Search" cell shows trend direction "rising"
  And the trend percent is shown as not applicable or null rather than infinity
  And the user can still see that the module degraded from zero to two defects

@boundary
Scenario: Trend handles zero current and previous-week counts as flat
  Given "Settings" had 0 defects in the previous 7-day UTC bucket
  And "Settings" has 0 defects in the latest 7-day UTC bucket
  When Mateo views the defect heatmap
  Then the "Settings" cell shows trend direction "flat"
  And the trend percent is 0
  And the module is displayed as a clean zero-defect module

@happy @accessibility
Scenario: Hotspots are emphasized with accessible non-color-only cues
  Given "Checkout" has the highest defect count in the selected window
  And "Search" has 0 defects in the selected window
  When Mateo views the heatmap
  Then "Checkout" is visually emphasized as the strongest hotspot
  And the emphasis includes count text plus a legend or label, not color alone
  And trend direction is exposed with an icon or text label accessible to assistive technology

@boundary
Scenario: Zero-defect active modules stay visible and clearly distinct from hotspots
  Given "Search" has no defects in the selected 30-day window
  When Mateo views the heatmap
  Then the "Search" cell is visible with defect count 0
  And it uses neutral or clean styling clearly distinct from hotspot modules

@happy
Scenario: Full module paths disambiguate duplicate nested module names
  Given "Checkout" has a child module named "Payment"
  And "Settings" has a child module named "Payment"
  When Mateo views the heatmap
  Then each "Payment" cell displays its full path
  And Mateo can distinguish "Checkout / Payment" from "Settings / Payment"

@integration
Scenario: Freshly filed defect appears in heatmap within the agreed freshness SLA
  Given Elena successfully files a P2 defect against module "Search" through BK-40
  And Mateo is authorized to view the same project heatmap
  When Mateo refreshes or the heatmap polling reads updated stats within 5 seconds
  Then the "Search" cell includes the new defect in its selected-window count
  And the heatmap exposes an updated freshness timestamp or as-of value

@negative
Scenario: Invalid window and unauthorized project access fail without leaking aggregate data
  Given Mateo is authenticated
  When he requests the defect heatmap with unsupported window "365d"
  Then the API returns 400 with an invalid window error
  When a user without project membership requests the same project heatmap
  Then the API returns 403
  And it does not return module names, paths, defect counts, or zeroed aggregate data
```

---
_Synced from Jira by sync-jira-issues_
