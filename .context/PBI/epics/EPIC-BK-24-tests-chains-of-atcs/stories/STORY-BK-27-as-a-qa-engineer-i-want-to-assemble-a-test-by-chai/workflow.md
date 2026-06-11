# BK-27 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

## User flow

1. Elena is signed in to her workspace and navigates to the Tests area.
2. She clicks "New Test". A form opens asking for a title and an ordered selection of ATCs.
3. She types a title that describes what the Test validates, e.g. "Add to Cart from Empty State".
4. She picks ATCs from her workspace's ATC library by searching or browsing. She arranges them in the order she wants them to run during execution.
5. She reviews her chain — the order matters, so she double-checks it.
6. She clicks "Save".
7. The system validates the input. If the chain is empty or the title is missing, the form shows a clear message and stays open. Elena fixes the input and tries again.
8. On successful save, Elena lands on the new Test's detail page (or sees the Test added to the Tests list), and her workspace's activity log shows that she just created this Test.
9. From here, Elena (or anyone else in the workspace with the right role) can later open this Test and start a Run on it — covered by the Manual Runs epic (BK-006).

## Note for the AI-agent and CI-agent path

When an agent (Claude Code, GitHub Copilot, a Playwright CI job) creates a Test using the Bunkai headless surface instead of the UI, the exact same business rules above apply. The agent provides title + ATC chain + a retry-safe identifier; the system applies the same validations and emits the same activity-log entry. There is no parallel "agent-only" Test creation path — one rulebook, three executors.

---
_Synced from Jira by sync-jira-issues_
