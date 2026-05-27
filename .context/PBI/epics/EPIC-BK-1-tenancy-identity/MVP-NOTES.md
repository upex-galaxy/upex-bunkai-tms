# EPIC-BK-1 — MVP closure notes

> Lean MVP cierre del epic sin pasar por Jira / sprint-development. Próximos sprints retoman el flujo formal.

## Stories incluidas

| Story | Título | Estado |
|---|---|---|
| BK-2 | Email magic-link | done (gaps cerrados) |
| BK-4 | Workspace create | done (REST + UI migrada) |
| BK-5 | Invite teammate | done (full impl, email dispatch stubbed) |
| BK-6 | Workspace switch | done (cookie + dropdown) |
| BK-3 | OAuth sign-in | **deferred** — magic-link suficiente para design-partners |

## Commits asociados

- `feat(auth): rfc 5321 email length cap + magic-link audit trail` — B1
- `feat(workspaces): rest endpoints for workspace create / list / get / patch (bk-4)` — B2
- `feat(invites): workspace invite issuance + accept flow (bk-5)` — B3
- `feat(workspaces): active-workspace switch via cookie + /me introspection (bk-6)` — B4

## Cobertura runtime — qué se puede probar end-to-end

1. Sign-up con magic-link → `/onboarding` → crear workspace via `POST /api/v1/workspaces` → `/projects`.
2. Owner abre `/workspaces/{id}/members` → form de invite → link copiado al portapapeles.
3. Invitee abre link → si no logueado, redirect a `/login?next=/invites/accept?token=...` → magic-link → acepta → `POST /api/v1/invites/accept` → membership creada.
4. WorkspaceSwitcher en Topbar muestra ambos workspaces (cuando founder tiene 2) → seleccionar workspace → `POST /api/v1/me/active-workspace` → cookie `bk_active_ws` rotada → route refresh.
5. Cross-tenant guard: User B intenta query `projects` de workspace A vía supabase client directo → RLS devuelve 0 filas.

## Endpoints REST disponibles (post-bloque)

```
GET    /api/v1
GET    /api/v1/health
POST   /api/v1/auth/magic-link
GET    /api/v1/me
POST   /api/v1/me/active-workspace
POST   /api/v1/tokens
GET    /api/v1/tokens
GET    /api/v1/tokens/{id}
PATCH  /api/v1/tokens/{id}
DELETE /api/v1/tokens/{id}
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/{id}
PATCH  /api/v1/workspaces/{id}
POST   /api/v1/workspaces/{id}/invites
GET    /api/v1/workspaces/{id}/invites
POST   /api/v1/workspaces/{id}/invites/{inviteId}
DELETE /api/v1/workspaces/{id}/invites/{inviteId}
POST   /api/v1/invites/accept
```

OpenAPI: 12 paths / 17 operations en `/api/openapi`. Scalar docs en `/api/docs`.

## Deuda técnica conocida

- **Email transactional**: dispatch via Resend / Supabase Edge Function. MVP genera link y lo loguea + lo copia al portapapeles del inviter.
- **`lib/supabase/with-workspace.ts`** no lee aún `bk_active_ws` para inyectar scope en queries server-side. Server pages todavía resuelven el workspace via membership fetch. Wireup pendiente cuando llegue el primer endpoint que necesita scope per-workspace via API.
- **Cross-tenant test automatizado**: documentado como validación manual; vitest no instalado todavía.
- **OAuth (BK-3)**: GitHub + Google providers no configurados. Sprint 3.

## Próximos pasos (siguiente sprint formal)

Sprint 2 real (vía `/sprint-development`):
- BK-005 Tests (entidad Tests + chain de ATCs)
- BK-006 Manual Runs (Run + run_atcs + run_steps + Realtime)
- BK-007 Bugs & Heatmap (Bug + module_defect_stats MV)
