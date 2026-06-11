# BK-43 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

```
Scenario: A filed defect syncs automatically and links back to Bunkai
  Given the external tracker integration is enabled for the project "Storefront"
  When Elena files the defect "Promo code accepts expired voucher" against module "Checkout"
  Then a matching item is created in the external tracker shortly after
  And the defect in Bunkai shows a "synced" state with a link to open the external item
  And the external item contains a link back to the defect in Bunkai
```

```
Scenario: Sync never blocks filing the defect
  Given the external tracker integration is enabled
  When Elena files the defect "Cart total ignores currency rounding"
  Then the defect is saved and visible in Bunkai immediately
  And she is not made to wait for the external tracker before continuing her run
```

```
Scenario: The external tracker is unreachable when a defect is filed
  Given the external tracker is temporarily unreachable
  When Elena files the defect "Search returns no results for valid query"
  Then the defect is still created and fully usable in Bunkai
  And it is marked as "sync-failed"
  And no error stops Elena from continuing to file or run
```

```
Scenario: A sync-failed defect is retried automatically and recovers
  Given the defect "Search returns no results for valid query" is marked "sync-failed"
  And the external tracker becomes reachable again
  When the automatic retry runs later
  Then the defect syncs to the external tracker
  And its state changes from "sync-failed" to "synced"
  And Sara can now open the matching item in the external tracker and follow the link back to Bunkai
```

```
Scenario: Sync is one-way only
  Given the defect "Promo code accepts expired voucher" is synced and shown as "synced" in Bunkai
  When a developer changes the title of the matching item in the external tracker
  Then the defect title in Bunkai stays unchanged
  And the change does not flow back from the external tracker into Bunkai
```

```
Scenario: A defect filed while the integration is disabled is not synced
  Given the external tracker integration is disabled for the project
  When Elena files the defect "Checkout button misaligned on mobile"
  Then the defect is created and usable in Bunkai
  And it is not sent to the external tracker
  And it shows no synced state and no sync-failed mark
```

---
_Synced from Jira by sync-jira-issues_
