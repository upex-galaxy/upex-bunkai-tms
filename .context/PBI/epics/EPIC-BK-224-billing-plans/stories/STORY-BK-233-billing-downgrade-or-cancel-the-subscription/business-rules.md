# BK-233 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-233)

- Only the workspace owner can downgrade, cancel, or resubscribe.
- Downgrade never deletes data: resources beyond the target plan's limits become read-only, selected oldest first, and become editable again on re-upgrade.
- A downgrade cannot be confirmed without the consequence preview being shown, and the preview lists exactly which resources would become read-only.
- Cancellation takes effect at the end of the already-paid period; access and limits are unchanged until then.
- Resubscribing before the period ends reverts the cancellation without a new charge for the paid period.
- Read-only resources stay fully viewable and countable in reports; only mutation is blocked.

### Design intent

- Downgrade and cancel live as secondary (non-prominent) actions on the plan card in the Billing section.
- Consequence preview as a confirmation dialog reusing the current design-system destructive-action pattern: consequence list, affected-resource summary, explicit confirm.
- Pending cancellation shown as a status banner on the plan card with the end date and a resubscribe button.

---
_Synced from Jira by sync-jira-issues_
