# BK-28 — Spec Compliance Matrix

PR: #42 (feature/BK-28-reorder-atcs → staging). Generated Stage 3.

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| Successful reorder (200, v2, positions, event) | test:reorder.test.ts#real-reorder | RPC suite + live UI (version 1→2, event logged) | covered |
| Reorder persists across reads | manual:playwright | getTestExpanded returns new order+version after Save | manual |
| No-op same order (no bump/event/updated_at) | test:reorder.test.ts#no-op | RPC suite | covered |
| Single-ATC no-op | test:reorder.test.ts#single-step | RPC suite | covered |
| Unauthenticated (401) | review-approved:handler | withApiHandler {auth:'required'} (route layer, all v1 endpoints) | review-approved |
| Viewer forbidden (403) | test:reorder.test.ts#viewer + page gate | RPC 42501 (suite seed-skipped) + UI canReorder hides handles | covered |
| Version conflict (409 + current_chain + current_version) | test:reorder.test.ts#stale-ifmatch | RPC 45125; route enriches body via re-fetch (+message fallback) | covered |
| Chain mismatch (422, missing/extra) | test:reorder.test.ts#wrong-set | RPC 45123 + route chainDiff details | covered |
| Duplicate ids (422 chain_invalid) | test:reorder.test.ts#duplicate | RPC 45124 + route reorderStructuralError | covered |
| Empty chain (422 chain_invalid) | test:reorder.test.ts#empty | RPC 45124 | covered |
| Activity log captures reorder event | test:reorder.test.ts#real-reorder | event count asserted; payload verified live | covered |
| Retry-safe double-click no-op | test:reorder.test.ts#retry-safe | RPC suite (one event total) | covered |

No `uncovered` rows. Viewer RPC-denial is seed-gated (logs+passes when no viewer member); UI affordance-hide is structural.
