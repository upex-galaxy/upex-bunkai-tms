# BK-18 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

# BK-18 — Plan de Implementación (Dev)

> TMS-ATC API · POST /api/v1/atcs + PATCH /api/v1/atcs/{id} · Wave 3 · 5 SP
Autor: Dev (sprint-development) · Canónico en Jira `spec*implementation*plan`, materializado aquí.

## Resumen

API REST transaccional para ***crear y editar ATCs**** (Acceptance Test Cases) con sus `steps` y `assertions` en una sola llamada. Cabeza de la cadena ATC — BK-19/20/21/22/23/27 dependen de este contrato. Consumidor primario = CLI/scripts vía ****PAT (bearer)***; la UI (BK-19) aún no existe.

## Hallazgo de diseño bloqueante (y su resolución)

El RPC existente `bunkai*save*atc` (0007) es `SECURITY INVOKER` y depende de `auth.uid()` vía RLS. BK-18 autentica con ***PAT bearer*** → no hay JWT → `auth.uid()` es `NULL`. Los helpers `bunkai*can*write_workspace(ws)` también leen `auth.uid()` internamente, así que el patrón DEFINER de los RPCs de módulos (que asume sesión cookie) tampoco aplica directo.

***Resolución:**** RPCs nuevos `SECURITY DEFINER` que reciben `p*actor*user*id` ****explícito**** y hacen el gate de membresía contra ese actor (no contra `auth.uid()`), invocados siempre vía ****admin client*** (service-role). El actor proviene de `requireAuth` (cookie `getUser()` o PAT verificado), por lo que es confiable. Esto también es la única vía para escribir el evento en `activity*log` (que no tiene INSERT policy para clientes — solo SELECT).

## Decisiones de contrato (del ATP / Shift-Left)

| Tema | Decisión |
| --- | --- |
| Auth | `requireAuth` + `requireScopeOrCookie(ctx, 'atc:write')` en ambos endpoints. PAT `atc:read` → 403. `atc:write` ya existe en el CHECK de `access_tokens` (0008). |
| RPC create | NUEVO `bunkai*create*atc(p*actor*user*id, p*project*id, p*module*id, p*user*story*id, p*title, p*layer, p*tags, p*steps, p*assertions, p*ac_ids) returns uuid` — `SECURITY DEFINER`. |
| RPC update | NUEVO `bunkai*update*atc(p*actor*user*id, p*atc*id, p*if*match, p*title, p*layer, p*tags, p*steps, p*assertions, p*ac*ids)` — `SECURITY DEFINER`. Supersede a `bunkai*save*atc` (se dropea si grep confirma 0 callers). |
| Slug | `<module-slug>/atc-<8 hex de gen*random*uuid()>`. Prefijo = último segmento del `path` del módulo (lo que el QA enunció 3× en el ATP). Sufijo = uuid random fresco (no el id del ATC). Inmutable tras creación. Regex QA: `/^[a-z0-9-]+\/atc-[a-z0-9]{8}$/`. |
| PATCH | Full-replace estilo PUT (omitido = borrado). Body `{}` vacío = no-op → 200 sin bump de version, sin evento, sin llamar al RPC. `user*story*id` / `module_id` / `slug` INMUTABLES. |
| Optimistic lock | Header `If-Match: <version>` (RFC 7232). Ausente = skip. Presente + mismatch = 409 code `conflict`, `details.reason: version*conflict`, `details.current*version`. Guard atómico en RPC con `SELECT ... FOR UPDATE`. |
| Eventos | INSERT a `activity*log` (NO existe `event*log`): `entity*type='atc'`, `action='created' | 'updated'`, `actor*user*id`, `workspace*id` (vía project→workspace), `payload` jsonb `{slug, title, version, affected*test*ids: []}`. `affected*test*ids: []` en MVP (`test_steps` no existe — EPIC-BK-5). |
| Validación cross-entity | (a) todos los `acceptance*criterion*ids` pertenecen al `user*story*id` y están activos; (b) `module_id` == módulo de la US ***o*** descendiente en el mismo project subtree (materialized path `modules.path` + igualdad de project). Corren al inicio del RPC (SELECTs sin lock) antes de cualquier INSERT. |
| Error codes nuevos | `ac*outside*user*story`(422), `module*outside*project*subtree`(422), `steps*position*invalid`(422), `slug_collision`(409). Version conflict reusa `conflict`(409) + `details.reason`. |
| Límites (Zod) | `title` 3..200; `tags` max 10; `layer ∈ {UI,API,Unit}`; `steps` min 1, `content` ≤ 2048 bytes; `acceptance*criterion*ids` min 1; posiciones strictly increasing desde 1. |
| Posiciones | Validadas a nivel de ruta (lista los offending) → `steps*position*invalid`. RPC inserta con la posición validada (1..N). |

## Migración `0021*atc*create_update.sql`

- `bunkai*create*atc(...) returns uuid` — DEFINER, `set search_path=''`:

  1. Resolver `workspace*id` vía `projects` y gate: `workspace*members` activo con rol ≥ member para `p*actor*user_id`, si no → `raise ... errcode '42501'`.
  2. Check (a) ACs∈US → `errcode '45020'` (ac*outside*user*story). Check (b) module∈subtree → `errcode '45021'` (module*outside*project*subtree).
  3. Computar slug `<module-slug>/atc-<substr(gen*random*uuid()::text,1,8)>`.
  4. INSERT `atcs` (project*id, module*id, user*story*id, slug, title, layer, version=1, tags) — unique(project*id,slug) → 23505 = slug*collision.
  5. Bulk INSERT `atc*steps` (position 1..N), `atc*assertions`, `atc*acceptance*criteria`.
  6. INSERT `activity_log` (atc.created). Return el nuevo `id`.

- `bunkai*update*atc(...)` — DEFINER:

  1. `SELECT ... FOR UPDATE` la fila `atcs` por id (NOT FOUND → `errcode 'P0002'`). Gate de membresía contra actor.
  2. Si `p*if*match` no es null y `!= version` → `raise 'version_conflict' errcode '45023'` (incluye version actual en el MESSAGE).
  3. Re-validar ACs∈(user*story*id actual). UPDATE title/layer/tags + `version=version+1`. DELETE+reINSERT hijos. INSERT `activity_log` (atc.updated). Return fila.

- DROP `bunkai*save*atc` ***solo si*** `grep -r bunkai*save*atc app/ lib/` = 0 callers (additive-safe; es función, no dato).
- Grants: revoke public/anon; grant execute a `authenticated` + `service_role`.

## Archivos

| Archivo | Acción |
| --- | --- |
| `supabase/migrations/0021*atc*create_update.sql` | NUEVO — 2 RPCs DEFINER |
| `lib/api/error-envelope.ts` | +4 codes en `API*ERROR*CODES` + `DEFAULT_STATUS` |
| `lib/atcs/validation.ts` | NUEVO — `stepPositionsError`, `assertionPositionsError`, límites título/tags |
| `lib/atcs/errors.ts` | NUEVO — `mapAtcRpcError(error)` SQLSTATE→ApiError |
| `app/api/v1/atcs/route.ts` | NUEVO — POST (export `POST`) |
| `app/api/v1/atcs/[id]/route.ts` | NUEVO — PATCH (export `PATCH`) |
| `app/api/v1/atcs/route.openapi.ts` | NUEVO — spec POST |
| `app/api/v1/atcs/[id]/route.openapi.ts` | NUEVO — spec PATCH |
| `scripts/openapi-gen.ts` | +2 import side-effect lines |
| `public/openapi.json` | regen (23→25 paths) |
| `lib/types/supabase.ts` | regen post-migración (Functions) |
| `lib/atcs/validation.test.ts` | NUEVO — unit tests boundary |
| `.context/business/events.md` | NUEVO — schema payload `atc.created`/`atc.updated` (deuda doc del ATP) |

## Mapeo AC/escenario → paso de implementación

| Escenario ATP | Cubierto por |
| --- | --- |
| H1 create full payload (201, slug regex, evento) | RPC create + route POST + read-back + activity_log |
| H2 PATCH cascade-replace (200, v2, evento []) | RPC update + route PATCH |
| N1 sin auth → 401 | `requireAuth` (antes de cualquier query) |
| N2 scope insuficiente → 403 | `requireScopeOrCookie('atc:write')` |
| N3 PATCH a id inexistente → 404 | RPC FOR UPDATE NOT FOUND → P0002 |
| N4 AC de otra US → 422 ac*outside*user_story + rollback | check (a) en RPC, atómico |
| N5 module fuera de subtree → 422 module*outside*project_subtree | check (b) en RPC |
| N6/N7 posiciones inválidas → 422 steps*position*invalid + offending | `stepPositionsError` en ruta |
| N8 version conflict → 409 conflict + current version | `If-Match` route pre-check + RPC guard |
| B1 título 2 chars → 422 validation_failed | Zod `min(3)` |
| B2 steps vacío → 422 validation_failed | Zod `min(1)` |
| I1 PAT inválido → 401 antes de DB | `requireBearerToken` |
| I2 rollback transaccional | RPC en una sola transacción |

## Estrategia de tests

- ***Commiteados***: unit puros en `lib/atcs/validation.test.ts` (posiciones `[1,3,2]`/`[2,3,4]`/`[1,2,3]`, título 2/3/200/201, tags 10/11).
- ***Prueba en vivo (evidencia, no commiteada)***: Supabase MCP `execute*sql` — seed → `bunkai*create*atc` happy + `ac*outside*user*story` (assert rollback: count hijos = 0) + `module*outside*project_subtree` → cleanup. Igual precedente BK-15/BK-17 (no commitear test que pegue a DB compartida con creds en CI). Se documenta en la Spec Compliance Matrix como `manual:<evidence>`.

## Review Workload Forecast

Estimated: ~950 additions (excl. `public/openapi.json` generado) + ~40 deletions = ~990 total lines
400-line budget risk: ***High***
Chain strategy: ***size-exception*** (unidad transaccional cohesiva — separar migración/ruta/openapi deja estados intermedios no funcionales; precedente BK-15 ~1050 / BK-17 ~1750 single-PR)
Decision needed before apply: ***No***

## missing_input

- `feature-implementation-plan.md` ausente en EPIC-BK-13 (plan macro). No bloquea — story bien refinada (ATP + AC + reglas). Marcado para un pase posterior.

---
_Synced from Jira by sync-jira-issues_
