# BK-233 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-233)

```
Scenario: Downgrade preview spells out over-limit consequences
  Given "Acme QA" is on the Team plan with 12 projects, and the Free plan allows 10
  When Mateo starts a downgrade to the Free plan
  Then before confirming he sees that 2 projects will become read-only
  And the preview states that nothing will be deleted
  And the preview shows which resources are affected
```

```
Scenario: Downgrading while over the target plan's limits keeps data safe
  Given Mateo confirms the downgrade from Team to Free with 12 projects
  Then the workspace is on the Free plan
  And the 2 most recently created projects become read-only, none are deleted
  And read-only projects remain fully viewable, including their run history
```

```
Scenario: Cancelling keeps paid access until the period ends
  Given "Acme QA" is on the Team plan, paid until March 31
  When Mateo cancels the subscription on March 10
  Then the workspace keeps full Team limits until March 31
  And the Billing section shows the cancellation and the date the plan will end
  And on April 1 the workspace is on the Free plan with over-limit resources read-only
```

```
Scenario: Resubscribing before the period ends reverts the cancellation
  Given Mateo cancelled on March 10 with paid access until March 31
  When he resubscribes to the Team plan on March 20
  Then the cancellation is reverted with no interruption of access
  And no second charge is made for the already-paid period
```

```
Scenario: Only the owner can downgrade or cancel
  Given an admin of "Acme QA" who is not the workspace owner
  When the admin opens the Billing section
  Then the admin can see the plan state but is not offered downgrade or cancel actions
```

---
_Synced from Jira by sync-jira-issues_
