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
  "affected_test_ids": []
}
```

> `affected_test_ids` is **always `[]`** in the MVP: the `test_steps` table that links Tests to ATCs does not exist yet (EPIC-BK-5). The field name is fixed so consumers handle empty arrays today and real ids later. An empty-body PATCH is a no-op — it emits **no** `atc.updated` event and does not bump `version`.

## Consumers

- **BK-20** (ATC search) — reindex on `atc.created` / `atc.updated`.
- **BK-21** (ATC propagation) — fan out edits to chained Tests on `atc.updated` (once `test_steps` exists).
