# BK-28 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

```
Scenario: Elena drags an ATC into a new position and saves
  Given Elena has an existing Test "Add to Cart from Empty State" containing four ATCs in the order A, B, C, D
  When she opens the Test, drags ATC D to the second position so the chain becomes A, D, B, C, and clicks "Save"
  Then the Test is updated and the chain is now A, D, B, C
  And when she or any teammate reopens the Test, the chain still shows A, D, B, C
  And the activity log of her workspace records that Elena reordered this Test, with a timestamp and the new chain A, D, B, C
```

```
Scenario: Saving without changing the order is a no-op
  Given Elena has an existing Test containing ATCs A, B, C in that order
  When she opens the Test, drags an ATC and drops it back in its original slot, then clicks "Save"
  Then no new reorder entry is recorded in the activity log
  And the Test's last-modified timestamp does not change
```

```
Scenario: A viewer cannot reorder a Test
  Given Pablo is signed in to the same workspace as Elena but with the role "viewer"
  When he opens the Test "Add to Cart from Empty State"
  Then the reorder controls are not available to him, with the drag handles absent or visibly disabled
  And any attempt by him to reorder the chain is rejected with a clear permission message
```

```
Scenario: Two teammates reorder the same Test at the same time
  Given Elena and her teammate Mateo are both viewing Test "Add to Cart from Empty State", both seeing the chain A, B, C
  And Mateo reorders the chain to C, B, A and saves first
  When Elena tries to save her own reorder to B, A, C, which was based on the stale A, B, C view
  Then Elena's save is blocked and she sees a clear message that the Test was changed by someone else, showing the current order C, B, A
  And Elena can review the new chain C, B, A and decide whether to start over or keep Mateo's version
```

---
_Synced from Jira by sync-jira-issues_
