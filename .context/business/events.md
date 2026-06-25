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

## Consumers

- **BK-20** (ATC search) — reindex on `atc.created` / `atc.updated`.
- **BK-21** (ATC propagation) — fan out edits to chained Tests on `atc.updated` (once `test_steps` exists).
