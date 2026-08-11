# BK-373 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

- A defect whose send failed is retried automatically until it succeeds, with no manual action required.
- Successive attempts are spaced further apart each time, up to a ceiling on the interval. There is no ceiling on the number of attempts while the failure is one that could still clear — the cap is on frequency, not on attempts.
- A failure that can never clear on its own stops the attempts. A failure caused by a credential problem keeps retrying at the widest interval, because the frozen copy promises it self-heals once the connection is fixed in Settings.
- A rate-limited send is a delayed send, never a failed one, and must not surface the failure badge.
- The defect record shows exactly the states frozen in the mockup and nothing else. There is no manual retry control.
- A defect whose sync failed stays fully usable in Bunkai; every other action on it still works.
- One defect maps to at most one Jira issue, forever. Recovery from an interrupted attempt adopts the issue that already exists rather than creating another.
- Recovery only ever touches defects belonging to the Project whose destination it is using. A defect can never land in another Project's Jira destination.
- A failure reason is shown to the user verbatim, so it stays short and carries nothing sensitive.

---
_Synced from Jira by sync-jira-issues_
