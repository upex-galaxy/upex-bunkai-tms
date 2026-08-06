# BK-211 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-211)

- The recipient of a run's terminal events is the user who started the run; broader audiences (watchers, project subscribers) are not part of this story.
- The actor never self-notifies: if the run starter is also the person finishing or aborting, no notification is created.
- Verdict vocabulary matches the run lifecycle exactly: passed and failed are final verdicts; aborted is a distinct terminal event that always carries its reason.
- Runs executed by any executor kind (human, agent, or CI) notify identically — executor parity is preserved.
- Visibility follows the inbox rules: if the starter loses access to the project, the notification is not delivered or shown.

## Design intent

- Notification row shows a run icon, the test name, and a verdict chip reusing the exact chip styles of the run history views (passed green, failed red, aborted neutral with reason on a second line).
- Real-time arrival animates the row in at the top of the Today group and increments the badge.

---
_Synced from Jira by sync-jira-issues_
