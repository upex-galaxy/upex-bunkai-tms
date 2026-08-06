# BK-211 — Implementation Plan (Dev)

> Jira field: `customfield_10165` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-211)

## Implementation Plan — BK-211

Ratifications implemented as-is (no re-decision): 12169 (PO recipient=starter), 12173 (AI Tech Lead: trigger shape + payload), 12196 (AI PO: suppression predicate supersedes 12173's identity-only clause with channel-aware C), 12198 (AI Tech Lead: mechanical cost of 12196, Candidate A — `p_via` parameter).

### DB layer — two migrations (numbered against the live ledger, verified via mcp***supabase***list*migrations: highest applied is 0065*atc*tags*cap_guard, next free is 0066)

1. `0066*run*event_notifications.sql` — ADDITIVE only.

1. `0067*run*finish*abort*via.sql` — REWRITE of two live SECURITY DEFINER functions (stops for approval per migration gate — not additive).

### API layer

- `app/api/v1/runs/[id]/finish/route.ts` and `.../abort/route.ts` pass `principal.via` through to `finishRun`/`abortRun`.
- `lib/supabase/rpc.ts` — `finishRun`/`abortRun` wrappers accept an optional `via` arg and forward it as `p_via`.

### Read layer

- `lib/notifications/view.ts` — `run.finished`/`run.aborted` branches gain the test title in the title text (`Run finished: {title}` / `Run aborted: {title}`), falling back to the currently-shipped bare copy when `payload.title` is absent (defensive, not the expected path — the producer never inserts without a resolved title). Signal/reason unchanged. No component changes (`NotificationRow.tsx` already renders `title.text` / `title.signal` / `title.reason`).

### Tests

- `lib/notifications/run-event-trigger-isolation.test.ts` (DB-integration, mirrors `bug-event-trigger-isolation.test.ts`): probes whether `bunkai*finish*run`/`bunkai*abort*run` accept `p*via` and whether the trigger is deployed; skips loudly with the exact migration to apply if not. When deployed: (a) teammate finishes a run started by fixture user -> 1 notification with correct title/verdict/project*slug/source*event*id; (b) starter finishes her own run via a simulated cookie session (`via: 'cookie'`) -> 0 rows (AC5); (c) starter's own run finished with `via` omitted/bearer -> notifies (12196/12198 channel-aware); (d) abort by teammate -> `reason` in payload; (e) null-recipient run (executor*user*id manually nulled) -> 0 rows, finish still succeeds; (f) idempotency — same activity*log id can't double-insert for one recipient; (g) cross-workspace isolation via `bunkai*list_notifications`.
- `lib/notifications/view.test.ts` (existing file) gains cases for the new title-prefix behavior.
- `lib/supabase/rpc.test.ts` / route tests gain a case asserting `via` is forwarded from `principal.via` into the RPC call args.

### Migration gate (Critical Rule + this story's explicit instruction)

`.agents/project.yaml` `migrations: autonomous` covers ADDITIVE DDL only. `0066` alone would leave the trigger reading a `via` key nothing writes (self-finishes would always notify, breaking AC5) — an incoherent intermediate state. Therefore NEITHER migration is applied in this run. Both files are written and committed; application is a human follow-up.

### Out of scope (unchanged from ratifications)

No `notification*preferences` filter (debt, tracked in Tech Lead's ruling, not this story). No `runs.started*by` column. No backfill of historical `run.finished`/`run.aborted` activity_log rows.

---
_Synced from Jira by sync-jira-issues_
