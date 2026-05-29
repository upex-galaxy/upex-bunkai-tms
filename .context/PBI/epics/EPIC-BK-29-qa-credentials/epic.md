# EPIC: Bunkai TMS — Credenciales de Acceso para Testing (DB / API / UI)

**Jira Key:** [BK-29](https://upexgalaxy67.atlassian.net/browse/BK-29)
**Priority:** Medium
**Status:** Backlog
**Total Story Points:** 0

---

## Description

Este Epic concentra las credenciales y conexiones que usa el equipo de QA para ejercitar Bunkai en los entornos disponibles. ***No publicar fuera de este Epic.*** La guía técnica pública (sin credenciales) vive en `/qa` de la app desplegada.

## Arquitectura

- ***Stack***: Next.js 15 (App Router) + Supabase (Auth + Postgres) + Vercel.
- ***Auth***: magic-link OTP via Supabase + password sign-in via REST + PAT Bearer para agentes/CLI.
- ***Multi-tenant***: cada fila workspace-scoped está protegida por Postgres RLS.
- ***Proyecto Supabase***: `fmbpikzpkafptqximhxn` (region us-east-1, Postgres 17.6).
- ***Base de datos (MVP)***: una sola DB Supabase (`fmbpikzpkafptqximhxn`) sirve local + staging + production (single-project tenancy). `production` = rama `main`; `staging` (`staging-upexbunkai.vercel.app`) = ambiente principal de Sprint Testing, y lo que se valida ahí promociona a `production`.

## Entornos

| ***Entorno**** | ****URL web**** | ****API base**** | ****OpenAPI**** | ****Estado*** |
| --- | --- | --- | --- | --- |
| local | `http://localhost:3000` | `http://localhost:3000/api/v1` | `http://localhost:3000/api/openapi` | dev |
| staging | `https://staging-upexbunkai.vercel.app` | `https://staging-upexbunkai.vercel.app/api/v1` | `https://staging-upexbunkai.vercel.app/api/openapi` | Sprint Testing (principal) |
| production | `https://upexbunkai.vercel.app` | `https://upexbunkai.vercel.app/api/v1` | `https://upexbunkai.vercel.app/api/openapi` | live (rama `main`) |

***Nota Vercel Deployment Protection***: si los endpoints devuelven HTML "Authentication Required", el proyecto Vercel tiene SSO Protection activa. Para QA externo, deshabilitar en Project Settings → Deployment Protection.

## DB Connection — Roles QA con BYPASSRLS (via Session Pooler)

Dos roles dedicados, ambos con LOGIN + BYPASSRLS.

***Alcance de lectura (importante)***: el GRANT es a nivel de tabla, por lo que ambos roles pueden leer todas las columnas — incluidas las columnas hash sensibles (`access*tokens.hash`, `workspace*invites.token*hash`, `magic*link*tokens.token*hash`). No existe un REVOKE column-level efectivo sobre ellas; tratar estas credenciales en consecuencia.

***Pooler****: Supabase deprecó el host directo `db.<ref>.supabase.co` para proyectos nuevos. La conexión correcta es via ****Session Pooler*** (puerto 5432) con el username en formato `<dbuser>.<project-ref>` (concatenado con punto).

| ***Role**** | ****Privileges**** | ****Pooler username**** | ****Password*** |
| --- | --- | --- | --- |
| `qa*inspector*ro` | SELECT on public.* | `qa*inspector*ro.fmbpikzpkafptqximhxn` | `Bunk4i-QA-Read-9zKpM7xL` |
| `qa*inspector*rw` | SELECT + INSERT + UPDATE + DELETE on public.* + sequence usage | `qa*inspector*rw.fmbpikzpkafptqximhxn` | `Bunk4i-QA-Write-8mNqR3yT` |

Connection strings (Session Pooler, puerto 5432):

```
# Read-only
postgresql://qa*inspector*ro.fmbpikzpkafptqximhxn:Bunk4i-QA-Read-9zKpM7xL@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require

# Read-write
postgresql://qa*inspector*rw.fmbpikzpkafptqximhxn:Bunk4i-QA-Write-8mNqR3yT@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

psql ejemplo:

```
psql "postgresql://qa*inspector*ro.fmbpikzpkafptqximhxn:Bunk4i-QA-Read-9zKpM7xL@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

Notas sobre el pooler:

- Puerto ***5432*** = Session pooler (transacciones largas, prepared statements OK).
- Puerto ***6543*** = Transaction pooler (más estricto, sin prepared statements). NO usar para QA.
- La región queda en el subdominio: `aws-1-us-east-1.pooler.supabase.com`.

Rotación de password (cuando aplique):

```
alter role qa*inspector*ro password '<new-secret>';
alter role qa*inspector*rw password '<new-secret>';
```

DBHub MCP / agentes que necesiten un solo URL pueden tomar las vars de `.env` (`QA*INSPECTOR*RO*URL` / `QA*INSPECTOR*RW*URL`).

## API Sign-in sin browser (pure CLI)

Tres formas válidas de obtener un Bearer PAT:

1. ***Headless signup*** — `POST /api/v1/auth/signup` provisiona usuario con password (email_confirm forzado, sin click de email) y mintea PAT en la misma respuesta.
2. ***Headless signin*** — `POST /api/v1/auth/signin` autentica con email + password y mintea PAT fresco. Útil para CI runs.
3. ***Hybrid (browser → mint)*** — magic-link en `/login`, luego `POST /api/v1/tokens` con la cookie session.

***Magic-link users NO pueden usar signin*** (no tienen password en `auth.users.encrypted_password`). Provisionar via signup OR usar hybrid path.

Flujo headless:

```bash
# 1. Signup once (idempotente — 409 si el user ya existe)
curl -X POST https://<host>/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{ "email": "qa.user@example.com", "password": "<secret-de-prueba>" }'

# 2. Signin → devuelve PAT en la response
curl -X POST https://<host>/api/v1/auth/signin \
  -H 'content-type: application/json' \
  -d '{ "email": "qa.user@example.com", "password": "<secret-de-prueba>" }'

# Response:
# {
#   "user": { "id": "...", "email": "qa.user@example.com" },
#   "session": { "access*token": "...", "refresh*token": "..." },
#   "pat": {
#     "token": "bk*pat*<prefix>.<secret>",   <-- shown once
#     "scopes": ["atc:read","atc:write","run:execute","workspace:admin"],
#     "expires_at": null
#   }
# }

# 3. Usar el PAT
curl https://<host>/api/v1/me -H 'Authorization: Bearer bk*pat*<prefix>.<secret>'
curl https://<host>/api/v1/workspaces -H 'Authorization: Bearer bk*pat*<prefix>.<secret>'
```

PAT scopes válidos: `atc:read`, `atc:write`, `run:execute`, `workspace:admin`.

***Fix history***: el verifier Bearer tenía bug de hash mismatch que rechazaba todo PAT (incluso recién minteado). Corregido en commit `7c56670` "fix(api): bearer pat verify reconstructs full secret before hash compare". Si un PAT pre-7c56670 sigue fallando, mintear uno nuevo — el storage está correcto, solo la verificación fallaba.

## UI testing (demo users)

Magic-link sigue funcionando para sign-in browser. Para QA scripts headless, usar el password flow.

| ***Slot**** | ****Rol esperado**** | ****Variable fuente*** |
| --- | --- | --- |
| owner | owner (creador del workspace) | `LOCAL*USER*OWNER*EMAIL / **PASSWORD` |
| admin | admin (invitado) | `LOCAL*USER*ADMIN*EMAIL / **PASSWORD` |
| member | member (invitado) | `LOCAL*USER*MEMBER*EMAIL / **PASSWORD` |

## Flujos críticos para QA

1. ***Sign-up*** (browser) → magic-link → `/onboarding` → crear workspace → `/projects`.
2. ***Sign-up headless*** → `POST /auth/signup` → recibe PAT → usar Bearer en `/me`, `/workspaces`.
3. ***Invite teammate*** → `/workspaces/{id}/members` → generar link → copiar al portapapeles → invitado acepta.
4. ***Workspace switch*** → topbar dropdown O cookie `bk*active*ws` via API.
5. ***Cross-tenant guard*** → connect as `qa*inspector*ro` + query workspaces de otro tenant → BYPASSRLS deja verlo (rol de inspección, no de tenant). El guard verdadero se prueba con dos Bearer PATs de tenants distintos.

## Reglas de seguridad

- NO publicar superuser / service_role keys en este Epic.
- NO subir credenciales reales al repo — están únicamente en `.env` (gitignored) y aquí.
- Los roles `qa*inspector**` tienen BYPASSRLS y operan sobre la DB compartida del MVP, por lo que alcanzan datos de `production`. Mantenerlos solo dentro del equipo (este Epic); rotarlos (`alter role ... password '<new>'`) si se filtran.
- Si una credencial se filtra fuera de este Epic, rotarla (`alter role ... password '<new>'`) antes de re-publicar.

## Snapshot meta (no editar manual)

| ***Key**** | ****Value*** |
| --- | --- |
| stack | `next-supabase-scalar` |
| generated | 2026-05-27 |
| epic | BK-29 |
| migrations | 0001..0010 applied |
| endpoints | 14 paths / 19 operations |
| bearer_fix | `7c56670` |
| pooler_host | `aws-1-us-east-1.pooler.supabase.com` |
| pooler_port | 5432 (session) |

Re-ejecutar `/testability-guide` para sincronizar drift cuando el stack o las migrations cambien.

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:50.461Z_
