# EPIC: Bunkai TMS — Credenciales de Acceso para Testing (DB / API / UI)

**Jira Key:** [BK-29](https://jira.upexgalaxy.com/browse/BK-29)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 0

---

## Description

Credenciales reales para testear Bunkai TMS. Esta página va al grano: qué credenciales son y qué variables setear en tu `.env`. La guía de ***cómo*** testear (sin credenciales) vive en /qa de la app desplegada. No publicar nada de esto fuera de este Epic.

## 🌐 Entornos

| Entorno | URL web | API base | OpenAPI | Estado |
| --- | --- | --- | --- | --- |
| local | http://localhost:3000 | http://localhost:3000/api/v1 | http://localhost:3000/api/openapi | dev |
| staging | https://staging-upexbunkai.vercel.app | https://staging-upexbunkai.vercel.app/api/v1 | https://staging-upexbunkai.vercel.app/api/openapi | Sprint Testing (principal) |
| production | https://upexbunkai.vercel.app | https://upexbunkai.vercel.app/api/v1 | https://upexbunkai.vercel.app/api/openapi | live (rama main) |

> Vercel Deployment Protection: si los endpoints devuelven HTML "Authentication Required", el proyecto tiene SSO Protection activa. Para QA externo, deshabilitar en Project Settings → Deployment Protection.

## 🔐 Auth a nivel UI (browser)

Roles del sistema: `viewer` · `member` · `admin` · `owner`.

Cómo crear tu usuario (cada tester el suyo):

- Andá a `/login` e ingresá tu email → llega un magic-link (login passwordless, no hay campo de password en la UI).
- El primer login te manda a `/onboarding` → creás tu workspace → quedás `owner` de ese workspace.
- Cada tester usa su PROPIO usuario y su PROPIO workspace. Compartir solo si lo acuerdan entre compañeros (vía invite: `admin`/`member`/`viewer`).

Para sacar un PAT desde una sesión de browser (camino híbrido): `POST /api/v1/tokens` con la cookie de sesión. El paso a paso está en /qa.

## 🗄️ Auth a nivel DB (DBHub MCP)

Dos roles dedicados (LOGIN + BYPASSRLS), vía Session Pooler (puerto 5432). El username del pooler es `<rol>.<project-ref>`.

| Rol | Permisos | Pooler username | Password |
| --- | --- | --- | --- |
| qa*inspector*ro | SELECT en public.* | qa*inspector*ro.fmbpikzpkafptqximhxn | Bunk4i-QA-Read-9zKpM7xL |
| qa*inspector*rw | SELECT + INSERT + UPDATE + DELETE en public.* + uso de secuencias | qa*inspector*rw.fmbpikzpkafptqximhxn | Bunk4i-QA-Write-8mNqR3yT |

Cuidado: BYPASSRLS = estos roles ven datos de TODOS los tenants (son de inspección, no de tenant). El GRANT es a nivel tabla, así que alcanzan columnas hash sensibles. Tratar como secreto; solo dentro de este Epic.

Hay DOS formatos distintos y NO son intercambiables:

1) Connection string crudo del pooler — sirve SOLO para una extensión SQL de VSCode/Cursor (no para DBHub):

```
postgresql://qa*inspector*ro.fmbpikzpkafptqximhxn:Bunk4i-QA-Read-9zKpM7xL@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

2) Formato `[[sources]]` del `dbhub.toml` — es lo que usa el DBHub MCP. El `dbhub.toml` ya viene committeado con placeholders `${VAR}`; vos NO lo editás, solo seteás estas variables en tu `.env`:

```bash
# .env — DBHub read-only (qa*inspector*ro)
DBHUB_TYPE=postgres
DBHUB_HOST=aws-1-us-east-1.pooler.supabase.com
DBHUB_PORT=5432
DBHUB_DATABASE=postgres
DBHUB*USER=qa*inspector_ro.fmbpikzpkafptqximhxn
DBHUB_PASSWORD=Bunk4i-QA-Read-9zKpM7xL
```

Para read-write, cambiá las dos últimas:

```bash
DBHUB*USER=qa*inspector_rw.fmbpikzpkafptqximhxn
DBHUB_PASSWORD=Bunk4i-QA-Write-8mNqR3yT
```

Verificá las vars ANTES de lanzar el agente. Ojo importante: `bun run claude` / `bun run opencode` inyectan el `.env` solo dentro del proceso del agente (y de ahí al MCP), NO en tu terminal. Por eso un `env | grep DBHUB` pelado en tu shell sale vacío aunque todo esté bien — no es el chequeo correcto. Usá uno de estos:

- ¿Están en el archivo `.env`? → `grep DBHUB .env`
- ¿Se inyectan de verdad (lo mismo que verá el MCP)? → `dotenv -e .env -- env | grep DBHUB`
- Si abriste un subshell con `bun run env`, ahí sí vale → `env | grep DBHUB`

Si falta una var, DBHub inserta el literal `${VAR}` como si fuera el valor real y da un fallo de auth críptico (no falla al arrancar).

## 🔌 Auth a nivel API (OpenAPI MCP)

El OpenAPI MCP no tiene archivo de config: se maneja con 3 variables de entorno. Seteá en tu `.env` (apuntando a staging):

```bash
# .env — OpenAPI MCP
API*BASE*URL=https://staging-upexbunkai.vercel.app
OPENAPI*SPEC*PATH=https://staging-upexbunkai.vercel.app/api/openapi
API_TOKEN=
```

El `API_TOKEN` es PERSONAL — NO lo copies de nadie, lo generás vos con TU usuario. Dos formas:

- Rápida (recomendada): `bun run api:login:staging --role owner`. El script ya está adaptado a Bunkai TMS: mintea tu PAT y lo escribe solo en tu `.env` como `API_TOKEN=`. Reiniciá la terminal después (el MCP cachea env al spawn).
- Manual: `POST /api/v1/auth/signin` con tu email + password → devuelve `pat.token` (`bk*pat*<prefix>.<secret>`). Pegalo en `API_TOKEN`.

Nota: los usuarios de magic-link no tienen password, así que para el camino headless usá `POST /api/v1/auth/signup` una vez (te provisiona password + mintea PAT) o el camino híbrido browser → `/tokens`.

## ⚙️ Activar los MCPs (inyectar el .env)

Los archivos `.mcp.json` (Claude) y `opencode.jsonc` (OpenCode) traen placeholders `${VAR}` / `{env:VAR}` — sin secretos. Los valores reales viven en tu `.env` (gitignored). El agente lee las vars al spawnear cada MCP, así que hay que inyectar el `.env` en la terminal antes de lanzarlo:

```bash
bun run claude      # Claude Code con el .env inyectado (= dotenv -e .env -- claude)
bun run opencode    # OpenCode con el .env inyectado
```

O cargá el `.env` en tu shell actual y después corré `claude` / `opencode` pelados (sourcealo, no `bun run` — corre en subshell y no persiste):

```bash
set -a; source .env; set +a
```

Alternativa (Mac/Linux): `direnv allow` con el `.envrc` del repo. Cualquier cambio en `.env` → reiniciá el agente (env cacheado al spawn).

## 🔒 Seguridad

- NO publicar `service_role` / superuser keys en este Epic.
- NO subir credenciales reales al repo — solo viven en `.env` (gitignored) y acá.
- Si una credencial se filtra fuera de este Epic, rotarla (`alter role <rol> password '<new>'`) antes de re-publicar.

---

Guía pública de testeo (arquitectura, trifuerza UI/API/DB, paso a paso — sin credenciales): /qa de la app. · Re-correr `/testability-guide` si el stack o las migraciones cambian.

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
