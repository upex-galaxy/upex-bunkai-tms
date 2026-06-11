# BK-40 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-40)

```
Scenario: File a defect from a failing step with everything pre-filled
  Given Elena is running the test "Checkout - apply promo code" and step 4 "Promo code field rejects expired code" has just been marked failed
  And the step captured one screenshot "expired-code-error.png"
  When she clicks "Report defect"
  Then the defect form opens with module "Checkout" already selected
  And the steps-to-reproduce already list steps 1 through 4 as executed
  And the failing ATC "Apply promo code" is shown as linked
  And the screenshot "expired-code-error.png" is already attached as evidence
  And she only needs to set the severity and confirm the title before saving
```

```
Scenario: File a standalone defect with no run attached
  Given Elena is viewing the defects area for the project "Storefront"
  And she is not inside any run
  When she clicks "New defect"
  And she enters the title "Cart total ignores currency rounding"
  And she selects the module "Cart"
  And she sets the severity to "P2"
  And she saves
  Then the defect "Cart total ignores currency rounding" is created in the open state
  And it appears at the top of the defects list with no linked run
```

```
Scenario: Title shorter than the minimum is rejected
  Given Elena is filing a defect for the module "Cart"
  When she enters the title "bug"
  And she tries to save
  Then the defect is not created
  And she sees the message "Title must be between 5 and 200 characters"
  And the title field is highlighted for correction
```

```
Scenario: Attaching more than the allowed number of evidence links is blocked
  Given Elena is filing a defect and has already attached 10 evidence links
  When she tries to attach an 11th link
  Then the 11th link is not added
  And she sees the message "You can attach up to 10 evidence links"
  And the existing 10 attachments remain intact
```

```
Scenario: Choosing a severity outside the allowed set is not possible
  Given Elena is filing a defect for the module "Checkout"
  When she opens the severity selector
  Then the only choices offered are "P1", "P2", "P3" and "P4"
  And no other severity value can be entered or saved
```

```
Scenario: Module must belong to the current project
  Given Elena is filing a defect in the project "Storefront"
  When she opens the module selector
  Then only modules that belong to "Storefront" are listed
  And modules from other projects such as "Admin Console" are not offered
```

---
_Synced from Jira by sync-jira-issues_
