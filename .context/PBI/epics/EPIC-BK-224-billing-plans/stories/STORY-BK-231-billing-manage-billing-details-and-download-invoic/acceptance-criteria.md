# BK-231 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-231)

```
Scenario: Owner updates the company billing details
  Given Mateo is the owner of "Acme QA" on the Team plan
  When he edits the billing details to company "Acme Corp S.L.", billing email "finance@acme.example", and the Madrid office address
  Then the saved details are shown in the Billing section
  And the next invoice issued carries the updated company details
```

```
Scenario: Owner replaces the payment method
  Given the workspace has a card on file ending in 4242
  When Mateo replaces it with a new card and confirms
  Then the Billing section shows the new card as the active payment method
  And the next renewal charges the new card
```

```
Scenario: Owner downloads a past invoice
  Given "Acme QA" has 6 invoices from six months of Team subscription
  When Mateo opens the invoice history and chooses the March invoice
  Then a PDF of that invoice downloads
  And it carries the company billing details, the period, the seat count, and the amount
```

```
Scenario: Failed renewal is visible and recoverable
  Given the renewal charge on the card on file was declined
  When Mateo opens the Billing section
  Then he sees the failed payment clearly flagged with the grace period end date
  And after he updates the payment method he can retry the charge from the same place
```

---
_Synced from Jira by sync-jira-issues_
