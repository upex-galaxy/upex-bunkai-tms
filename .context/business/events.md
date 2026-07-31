# Domain Events

> Audit/event sink = `public.activity_log` (migration `0009_cross_cutting.sql`). There is **no** `event_log` table. Each event is one `activity_log` row: `entity_type`, `entity_id`, `action` (the event name), `actor_user_id`, `workspace_id`, `payload` (jsonb), `created_at`. Writes happen only via `service_role` / `SECURITY DEFINER` RPCs (the table has no client INSERT policy). Workspace members read their workspace's trail via the SELECT RLS policy.

## ATC events (BK-18)

Emitted inside the create/edit transaction (`bunkai_create_atc` / `bunkai_update_atc`) — committed atomically with the ATC write, so a logged event always corresponds to a persisted change.

### `atc.created`

| Field | Value |
|---|---|
| `entity_type` | `atc` |
| `entity_id` | the new ATC id |
| `action` | `atc.created` |
| `actor_user_id` | the resolved caller (PAT or cookie) |
| `workspace_id` | the ATC's project workspace |

`payload`:

```json
{
  "slug": "<module-slug>/atc-<8 hex>",
  "title": "Login with valid email",
  "version": 1,
  "affected_test_ids": []
}
```

### `atc.updated`

| Field | Value |
|---|---|
| `entity_type` | `atc` |
| `entity_id` | the edited ATC id |
| `action` | `atc.updated` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the ATC's project workspace |

`payload`:

```json
{
  "title": "Login with valid email",
  "version": 2,
  "affected_test_ids": ["<test uuid>", "..."]
}
```

> **BK-21**: `affected_test_ids` now carries the REAL set of Tests that chain the edited ATC — the DISTINCT `test_steps.atc_id` references, computed **inside the same transaction** as the edit (migration `0035`), so a logged event always matches the persisted change. A Test that chains the ATC at multiple positions appears **once**. The array is `[]` when no Test chains the ATC. An empty-body PATCH is a no-op — it emits **no** `atc.updated` event and does not bump `version`. (Pre-BK-21 the field was hard-coded `[]` because `test_steps` had not shipped; `test_steps` landed in `0024`.)

## Module events (BK-59)

Emitted inside the three SECURITY DEFINER module-mutation RPCs (`bunkai_update_module`, `bunkai_move_module`, `bunkai_archive_module_subtree` — migration `0023_module_activity_log.sql`), atomically with the mutation. Actor = `auth.uid()` (the RPCs run through a user-scoped client on both auth paths and role-gate on it). No-op early returns (same-parent move, already-archived subtree) emit nothing. Module **create** is intentionally not audited: it is a direct RLS table insert, not an RPC.

All module events share: `entity_type` = `module`, `entity_id` = the module id, `workspace_id` = the owning project's workspace.

### `module.renamed`

`payload`: `{ "name": "<new name>", "old_path": "a/b", "new_path": "a/c" }`

### `module.description_updated`

`payload`: `{}` (deliberately empty — no content leak into the audit trail).

### `module.moved`

`payload`: `{ "old_path": "a/b", "new_path": "c/b", "old_parent_id": "<uuid|null>", "new_parent_id": "<uuid|null>" }`

### `module.archived`

`payload`: the same per-table counts the RPC returns — `{ "modules": n, "user_stories": n, "acceptance_criteria": n, "atcs": n }`.

## Run events (BK-34/36/37/39)

Covers the remaining write sites not already documented above: two `test.*` events (BK-27, BK-26, BK-30) and the three `run.*` events (BK-34/40, BK-36, BK-37). Grouped under one heading per the BK-49 Activity Stream refresh (item 4 of the 2026-07-31 canonical resolution) — the header name mirrors the module-events precedent's format even though it spans two entity types (`test`, `run`), since both are emitted by the Runs/Tests domain's RPCs.

### `test.created`

| Field | Value |
|---|---|
| `entity_type` | `test` |
| `entity_id` | the new Test id |
| `action` | `test.created` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Test's project workspace |

`payload`: `{ "title": "Login with valid email" }` (`bunkai_create_test`, `0024_tests.sql`).

### `test.reordered`

| Field | Value |
|---|---|
| `entity_type` | `test` |
| `entity_id` | the reordered Test id |
| `action` | `test.reordered` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Test's project workspace |

`payload`: the new ATC step order (`bunkai_reorder_test_steps`, `0026_tests_reorder.sql`).

### `test.tags_changed`

| Field | Value |
|---|---|
| `entity_type` | `test` |
| `entity_id` | the Test id |
| `action` | `test.tags_changed` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Test's project workspace |

`payload`: the new tag set (`bunkai_set_test_tags`, `0030_test_tags.sql`).

### `run.started`

| Field | Value |
|---|---|
| `entity_type` | `run` |
| `entity_id` | the new Run id |
| `action` | `run.started` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Run's project workspace |

`payload`: Run start context (`bunkai_create_run`, `0031_runs.sql`; superseded by `0040_run_module_snapshot.sql`'s module-snapshot variant — same event name, same write site responsibility).

### `run.aborted`

| Field | Value |
|---|---|
| `entity_type` | `run` |
| `entity_id` | the aborted Run id |
| `action` | `run.aborted` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Run's project workspace |

`payload`: `{ "reason": "<free text, ≤500 chars>", "skipped_steps": n }` (`bunkai_abort_run`, `0036_run_abort.sql`). **`reason` is free-text, unredacted operator input** — BK-49's Activity Stream feed excludes it entirely from its projection (dropped outright, not role-gated — see BK-49 implementation-plan.md Decision 3); only `skipped_steps` is safe to surface there.

### `run.finished`

| Field | Value |
|---|---|
| `entity_type` | `run` |
| `entity_id` | the finished Run id |
| `action` | `run.finished` |
| `actor_user_id` | the resolved caller |
| `workspace_id` | the Run's project workspace |

`payload`: `{ "verdict": "passed"\|"failed", "skipped_steps": n }` (`bunkai_finish_run`, `0037_run_finish.sql`).

> **Footnote — `run_step.marked` (BK-35, anticipated):** BK-35 ("mark run step") adds a per-step marking RPC on a concurrent branch not yet merged into `staging` as of this writing. It is not yet a confirmed write site and is therefore NOT documented here and NOT in BK-49's MVP allowlist (`ACTIVITY_ALLOWED_ACTIONS` / `bunkai_list_activity`'s `p_actions` default). Once BK-35 merges and actually writes `activity_log` rows, this doc and the allowlist need an explicit decision on whether `run_step.marked` belongs in the Activity Stream feed — it is excluded automatically by the allowlist mechanism until that decision is made, not silently dropped.

## Consumers

- **BK-20** (ATC search) — reindex on `atc.created` / `atc.updated`.
- **BK-21** (ATC propagation) — fan out edits to chained Tests on `atc.updated` (once `test_steps` exists).
