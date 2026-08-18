# BK-229 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-229)

- Only the workspace owner and admins can open the Billing section; only the owner can change plan or payment state (enforced in the write stories).
- Seat counting = active members only. Pending invitations do not consume a seat until accepted.
- Tier ladder on Bunkai Cloud: Free, then Team (per-seat subscription), then Enterprise. The self-hosted Community edition is outside the billing surface.
- Usage meters reflect the live workspace state at the moment the view opens.
- A meter at or above 80% of its limit renders in a warning state; at 100% it renders in a limit-reached state.

### Design intent

- Billing appears as a sidebar entry inside the Settings hub (same navigation pattern as the existing Settings sub-views).
- Plan card on top (tier, price, renewal), seat meter and resource usage meters below in a card grid.
- Meters reuse the current design-system progress components and semantic warning tokens; no new visual primitives.

---
_Synced from Jira by sync-jira-issues_
