# BK-230 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-230)

- Only the workspace owner can complete a purchase; admins can view the comparison but not confirm.
- A declined payment changes nothing: the workspace keeps its current plan and no partial state is left behind.
- Plan limits unlock at the moment of successful confirmation — no waiting period, no manual activation.
- Every successful purchase produces a receipt addressed to the owner.
- The tier ladder is Free, Team, Enterprise; Enterprise purchase is sales-assisted by design.

### Design intent

- Tier comparison as a three-column layout reusing current design-system cards, with the active tier highlighted.
- Checkout as a focused modal or dedicated pane inside the Billing section: plan summary, seat selector, payment entry, single confirm action.
- Success state returns to the Billing view showing the new plan card.

---
_Synced from Jira by sync-jira-issues_
