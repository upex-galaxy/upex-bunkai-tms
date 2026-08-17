# BK-499 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

- Capability enforcement is wired into the remaining 28 handlers (27 receive a capability posture):
- Reads take `atc:read`; identity and notification routes take a justified no-capability posture; `POST /workspaces` and `DELETE /workspaces/{id}/membership` stay capability-free.
- The fixture PAT at `app/api/v1/projects/[id]/traceability/route.test.ts:132` is widened from `['atc:write']` to `['atc:read','atc:write']`.
- The five in-code "no scope requirement" comments this Story's enforcement decision supersedes are updated: `app/api/v1/bugs/route.ts:213`, `app/api/v1/activity/route.ts:13`, `app/api/v1/tests/[id]/runs/route.ts:11`, `app/api/v1/projects/[id]/coverage/route.ts:10`, `app/api/v1/projects/[id]/runs/report/route.ts:14`.
- No database migration.

---
_Synced from Jira by sync-jira-issues_
