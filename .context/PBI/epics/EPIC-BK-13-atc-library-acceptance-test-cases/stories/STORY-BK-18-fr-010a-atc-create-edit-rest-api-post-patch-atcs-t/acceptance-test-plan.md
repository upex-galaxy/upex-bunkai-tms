# BK-18 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

# ATC create + edit REST API (POST/PATCH /atcs, transactional steps + assertions)

**Jira Key:** [BK-18](https://jira.upexgalaxy.com/browse/BK-18)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Priority:** Media
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

**Source spec:** FR-010a — superficie de servidor de ATC (REST)

Como ingeniero de automatización o consumidor de la API, quiero una REST API para crear y editar ATCs (Acceptance Test Cases) con sus steps y assertions en una sola llamada transaccional, para que pueda componer bloques de prueba reutilizables desde herramientas de CLI, scripts y el cliente de UI.

Implementa **FR-010a** — solo superficie de servidor. El formulario de UI es BK-19, la composición de Test posterior es EPIC-BK-5.

## Acceptance Criteria

```
Scenario: Crear ATC con payload válido
Given un miembro autenticado del workspace
And una User Story US-100 en el module M-10 con acceptance criteria AC-1 y AC-2
When el usuario hace POST a /atcs con title "Login with valid email", module*id M-10, user*story*id US-100, acceptance*criterion_ids [AC-1], layer "UI", y 3 steps más 2 assertions
Then la API devuelve 201 con el nuevo ATC, sus steps y sus assertions
And el slug es "{module-slug}/{atc-id-padded}"
And se emite un event atc.created

Scenario: Rechazar ATC cuando las acceptance criteria pertenecen a una user story distinta
Given un miembro autenticado
And AC-9 pertenece a la user story US-200 (no a US-100)
When el usuario hace POST a /atcs con user*story*id US-100 y acceptance*criterion*ids [AC-9]
Then la API devuelve 422 con error code "ac*outside*user_story"
And no se inserta ninguna fila en atcs, atc*steps ni atc*assertions

Scenario: Rechazar ATC cuando el module no está en el project subtree de la user story
Given una User Story US-100 pertenece al project P-1
And el module M-99 pertenece al project P-2
When el usuario hace POST a /atcs con user*story*id US-100 y module_id M-99
Then la API devuelve 422 con error code "module*outside*project_subtree"

Scenario: Las posiciones de los steps deben ser estrictamente crecientes desde 1
Given un miembro autenticado
When el usuario hace POST a /atcs con steps en posiciones [1, 3, 2]
Then la API devuelve 422 con error code "steps*position*invalid"
And el response body lista las posiciones infractoras

Scenario: PATCH /atcs/{id} actualiza campos y reemplaza en cascada steps y assertions de forma atómica
Given un ATC existente en version 1 con 3 steps y 1 assertion
When el usuario hace PATCH a /atcs/{id} con un nuevo title y un array de reemplazo de 2 steps
Then la API devuelve 200 con version 2
And los steps y assertions viejos se eliminan en la misma transaction que los nuevos inserts
And se emite un event atc.updated con affected*test*ids
```

---

## QA Refinements (Shift-Left Analysis)

> Agregado el 2026-05-27 por Shift-Left QA. El ATP DRAFT completo vive en el custom field 🧪 Acceptance Test Plan (ATP) y está reflejado como comentario en este issue. Esta sección captura los slices que el PO y el Dev necesitan antes de la estimación.

### 🔍 Refined Acceptance Criteria — resumen

**Se produjeron 13 Gherkin scenarios** (Happy 2 / Negative 7 / Boundary 2 / Integration 2). Decisiones clave de contrato:

1. **Slug format**: `{module-slug}/atc-{id-first-8-chars}` (prefijo de UUID en minúsculas). — **Rationale:** el prefijo de uuid es determinista (sin dependencia de secuencia), único y legible. 8 caracteres equilibran seguridad de colisión vs brevedad. Coincide con la recomendación del arquitecto en el comentario de BK-2. (Senior DEV)
2. **PATCH semantics**: cuerpo de reemplazo total (estilo PUT), NO merge parcial. Se reutiliza el schema `ATCCreate`. Los campos omitidos NO se preservan — se limpian. — **Rationale:** el RPC existente `bunkai*save*atc` reemplaza los hijos por completo (sin diff). Un merge parcial requeriría tracking a nivel de campo a través de 4 tablas sin infra existente. Si el cliente quiere parcial, hace GET→modificar→PATCH. (Senior DEV)
3. **Version conflict**: optimistic locking vía header `If-Match: <version>`. Sin version en el body. 409 si hay mismatch. — **Rationale:** estándar de la industria (RFC 7232). Previene lost updates. El RPC existente incrementa version incondicionalmente; el route handler chequea el header antes de llamar al RPC. (Senior DEV)
4. **Error codes**: agregar `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid`, `layer*invalid`, `slug*collision` al mapa `API*ERROR*CODES`. Envuelto vía `ApiError('validation*failed', 422, { code: 'ac*outside*user*story' })`. — **Rationale:** el flujo 422 existente en `withApiHandler` atrapa ZodError pero NO los errores de validación semántica. Los errores semánticos necesitan throws explícitos de `ApiError` con codes específicos del dominio. (Senior QA)
5. **Auth**: `requireBearerToken` + `requireScope(ctx, 'atc:write')` en ambos endpoints. Los tokens `atc:read` se rechazan con 403. — **Rationale:** patrón establecido de las rutas de tokens. Consistente con el modelo de scope existente. (Senior QA)
6. RPC `bunkai*create*atc`: el camino de CREATE necesita un NUEVO RPC que devuelva el nuevo `atc*id` (a diferencia de `bunkai*save*atc`, que es void). Firma: `bunkai*create*atc(p*project*id, p*module*id, p*user*story*id, p*title, p*layer, p*tags, p*steps, p*assertions, p*ac*ids) returns uuid`. — **Rationale:** `bunkai*save*atc` recibe `p*atc*id` (solo UPDATE). El INSERT necesita una firma distinta — sin id preexistente, necesita project*id para RLS + slug. Agregar un parámetro `p*create*flag` crearía un RPC dual-path feo. Un RPC dedicado es más limpio. (Senior DEV)
7. `affected*test*ids` **(event de PATCH)**: consultar la tabla `test*steps` joineando por `atc*id`. Un array vacío = el event igual se dispara (los consumidores filtran por `affected*test*ids.length === 0` si solo les importa el impacto de dependencias). — **Rationale:** el SRS muestra el campo `used*in` en la respuesta de ATC → links de `test*steps`. Esta es la fuente canónica. (Senior DEV)
8. **Mutabilidad de **`user*story*id`** en PATCH**: inmutable en PATCH. Si el cliente envía `user*story*id`, se ignora silenciosamente (o 422 si es distinto). Las ACs están atadas a la user story original del ATC. — **Rationale:** reasignar user*story*id rompería la validación de AC (las ACs pertenecen a la US original). La re-validación en cascada es costosa y agrega riesgo. La anotación del arquitecto lo confirma. (Senior PO + Senior DEV)

### ⚠️ Edge Cases Identified

**Se catalogaron 14 edge cases** (6 Alta, 5 Media, 3 Baja):

1. 🔴 Alta — POST con PAT inválido (malformado, expirado, revocado). Mitigación: el auth middleware devuelve 401 `unauthorized` — ya probado en las rutas de tokens.
2. 🔴 Alta — POST con scope `atc:read` (insuficiente). Mitigación: `requireScope` devuelve 403 `forbidden` — patrón establecido.
3. 🔴 Alta — PATCH a un id de ATC inexistente. Mitigación: 404 `not_found` — mismo patrón que tokens.
4. 🔴 Alta — PATCH concurrente — version conflict (dos clientes en version 1). Mitigación: el primero gana (200 v2), el segundo recibe 409 `conflict`.
5. 🔴 Alta — Slug collision (mismo project, mismo slug). Mitigación: constraint DB UNIQUE `(project*id, slug)`. El INSERT levanta unique violation → se mapea a 409 `slug*collision`.
6. 🔴 Alta — POST con `module*id` perteneciente a un project distinto al de `user*story*id`. Mitigación: AC3 cubre el caso positivo. Rechazar con 422 `module*outside*project*subtree`.
7. 🟡 Media — POST con array `steps[]` vacío. Mitigación: el schema `ATCCreate` requiere `minItems: 1`. Zod rechaza → 422 `validation_failed`.
8. 🟡 Media — POST con valor de layer fuera del enum `{UI, API, Unit}`. Mitigación: el enum de Zod rechaza → 422 `validation_failed`.
9. 🟡 Media — POST con 11 tags (excede el máximo de 10). Mitigación: Zod `maxItems: 10` rechaza → 422.
10. 🟡 Media — PATCH con body vacío (sin campos cambiados). **Decisión**: aceptar el PATCH vacío como no-op → 200 con la misma version (sin incremento). El RPC no se llama. (Senior DEV)
11. 🟡 Media — POST con `acceptance*criterion*ids` que son UUIDs válidos pero no existen en la DB. Mitigación: 422 `ac*outside*user_story` (mismo code — la query devuelve vacío para IDs inexistentes también).
12. 🟢 Baja — Title con Unicode/emoji. Mitigación: el tipo `text` existente de la DB maneja UTF-8. El string de Zod lo acepta. No se necesita manejo especial.
13. 🟢 Baja — Contenido de step > 2KB. Mitigación: Zod `maxLength: 2048` en el contenido de step.
14. 🟢 Baja — POST con `acceptance*criterion*ids: []` (array vacío). Mitigación: Zod `minItems: 1` rechaza → 422.

### 📋 Clarified Business Rules

- **Slug uniqueness**: UNIQUE a nivel de DB `(project*id, slug)`. En colisión → 409 `slug*collision`. Los ATCs en distintos projects pueden compartir slugs.
- **Version semantics**: entero monotónicamente creciente, por ATC. POST comienza en 1, PATCH incrementa en 1 (a menos que sea no-op).
- **Optimistic locking**: header `If-Match: <current_version>` en PATCH. Ausente = se omite el version check (modo lenient para clientes simples). Presente y con mismatch = 409. El RPC existente incrementa version incondicionalmente — el route handler chequea el header primero.
- **Transactional boundary**: una transaction de DB por POST/PATCH. La validación cross-entity (AC→US, module→project) corre **antes** de que la transaction abra (queries de solo lectura). El INSERT de steps/assertions ocurre dentro de la transaction. Ante cualquier falla → rollback, cero filas escritas.
- **Event emission**: `atc.created` se dispara al commit del POST. `atc.updated` se dispara al commit del PATCH con `affected*test*ids[]` poblado vía join con `test_steps`. Los events son fire-and-forget (hook after-commit). Si el event bus está caído, la respuesta de la API sigue siendo 200/201 — el event se registra para replay.
- **RLS**: todas las operaciones de tabla pasan por las políticas de RLS existentes (`authenticated` + membresía de workspace). Los RPCs son `security invoker` para que RLS evalúe como el caller de la API.
- **idempotency**: no requerida para el MVP. Los POSTs no son idempotentes por naturaleza (cada uno crea un nuevo ATC). El PATCH es idempotente (mismo payload = mismo resultado). Si se necesita idempotency más adelante, agregar el header `Idempotency-Key` — el `IdempotencyKeySchema` existente en el codebase lo cubre.
- **Soft-delete**: FUERA del scope de BK-18. El endpoint DELETE será BK-? (Story futura). El campo de status existe en el schema pero POST/PATCH no lo tocan.
- Campo `used*in` **en la respuesta**: FUERA del scope de BK-18. El endpoint GET (BK-? futuro) lo expandirá. Las respuestas de POST/PATCH devuelven el objeto ATC sin `used*in`.

### ❓ Open Questions for PO / Dev / Design

**Para PO (3):**

1. **Manejo de reenvío / slug duplicado**: si hay slug collision en POST (improbable pero posible con slugs basados en UUID), ¿deberíamos auto-reintentar con un sufijo o devolver 409 para que el cliente renombre? **Decisión (Senior PO)**: devolver 409 `slug*collision` — el cliente debe elegir un `module*id` distinto o el title del ATC producirá un slug diferente. El auto-reintento enmascara la colisión y confunde a los consumidores.
2. **Consumidores de event**: ¿quién consume `atc.created` / `atc.updated` en el MVP? ¿Hay sistemas posteriores (audit log, webhook, Analytics) que dependan de la forma del event AHORA vs después? **Decisión (Senior PO)**: consumidores del MVP = BK-20 (search index), BK-21 (propagación de PATCH). Ambos están en la Wave 2. Los events pueden registrarse en la tabla `event_log` por ahora; sin webhook externo en el MVP.
3. **Naming de scope**: ¿confirmamos que el nombre de scope `atc:write` cubre tanto POST como PATCH? ¿O se necesitan `atc:create` y `atc:update` separados? **Decisión (Senior PO)**: un único `atc:write` para ambos. Los scopes granulares pueden separarse después si los requisitos de auditoría lo demandan — cambiar de grueso→fino es retrocompatible; lo inverso no.

**Para Dev (4):**

1. **Firma del RPC **`bunkai*create*atc`: confirmar salida: `RETURNS uuid` (el nuevo atc*id)? ¿La entrada incluye `p*project*id` para la computación de slug + RLS? **Decisión (Senior DEV)**: sí — `returns uuid`, recibe `p*project*id uuid` como primer parámetro. El slug se computa como `lower(replace(p*title, ' ', '-')) || '/atc-' || substr(gen*random*uuid()::text, 1, 8)` — determinista a partir de las entradas, sin dependencia de secuencia. RLS funciona porque `project_id` está en la fila.
2. **Computación de slug — ¿SQL puro o capa de app?**: el RPC existente es PL/pgSQL. La computación de slug debería vivir en el RPC (misma transaction, sin round-trip). ¿Confirmamos? **Decisión (Senior DEV)**: PL/pgSQL puro dentro de `bunkai*create*atc`. La capa de app envía el title, el RPC deriva el slug. Inmutable después de la creación.
3. **Registro de error code**: ¿agregar los nuevos codes al mapa `API*ERROR*CODES` o definirlos inline en los route handlers? **Decisión (Senior DEV)**: agregar al mapa `API*ERROR*CODES` por consistencia. El mapa es el registro canónico que lee la generación de la OpenAPI spec.
4. **Query de **`affected*test*ids`: ¿existe `test*steps` en el schema todavía (es parte de EPIC-BK-5 Tests)? ¿O el payload del event debería omitir este campo hasta que llegue esa migración de schema? **Decisión (Senior DEV)**: `test*steps` NO existe todavía. Emitir `affected*test*ids: []` (vacío) en el MVP. Cuando EPIC-BK-5 agregue la tabla, actualizar la emisión del event. El nombre del campo en el contrato del event se mantiene igual — los consumidores manejan arrays vacíos.

**Para Design (0):**

Sin preguntas de design — esta es una Story solo de API (sin UI). La contraparte de UI es BK-19.

### 📐 Scope refinement — IN vs OUT of BK-18

**✅ IN BK-18:**

- Endpoint `POST /api/v1/atcs` (NUEVO)
- Endpoint `PATCH /api/v1/atcs/{id}` (NUEVO)
- RPC `bunkai*create*atc` (NUEVO — devuelve uuid)
- Validación cross-entity: pertenencia AC→US, subtree module→project
- Validación de posición de steps (estrictamente creciente desde 1)
- Bearer auth con scope `atc:write`
- Optimistic locking vía header `If-Match` en PATCH
- Computación de slug (inmutable)
- Incremento de version en PATCH
- Emisión de event: `atc.created` / `atc.updated` (fire-and-forget, registrado)
- Nuevos error codes en el mapa `API*ERROR*CODES`
- Registro en OpenAPI spec para ambos endpoints
- Integration tests para rollback transaccional + gating de auth + reglas cross-entity

**🚫 OUT (delegado a otras Stories):**

- GET /atcs, GET /atcs/{id} → BK-20 (search/browse)
- DELETE /atcs/{id} → BK-? (futuro, soft-delete)
- POST /atcs/{id}/duplicate → BK-23
- Formulario de UI → BK-19
- Expansión de respuesta `used_in` → BK-20 o BK-5
- Soporte de Idempotency-Key → futuro (cuando se necesite idempotency en POST)
- Entrega de events por webhook → futuro
- Scopes granulares (`atc:create` vs `atc:update`) → futuro
- `affected*test*ids` con datos reales → EPIC-BK-5 (tabla test_steps)

---

**Ver el custom field 🧪 Acceptance Test Plan (ATP) + el comentario de Shift-Left para el refinamiento completo (****~****13 test outlines, Gherkin scenarios completos, reconciliación AC↔code por cada divergencia).**

---

## Refined Acceptance Criteria (Shift-Left QA pass — 2026-05-27)

> Refinado y consolidado por QA durante la revisión Shift-Left previa al sprint. El razonamiento de reconciliación (divergencias AC ↔ code, decisiones, edge cases, cortes de scope) está capturado en el campo **🧪 Acceptance Test Plan (ATP)** y en el comentario **Shift-Left Refinement** de este issue.

```
Background:
  Given el workspace tiene un project P-1 con module M-10 y user story US-100
    And US-100 tiene los acceptance criteria AC-1 y AC-2
    And el caller tiene un Personal Access Token válido con scope "atc:write"
    And el module M-10 es descendiente del root module de P-1

# ---- Happy path ----

Scenario: Creación exitosa de ATC con payload completo
  Given un PAT válido con scope "atc:write"
  When el usuario hace POST a /api/v1/atcs con el body:
    | title                      | "Login with valid email"           |
    | module_id                  | M-10                               |
    | user*story*id              | US-100                             |
    | acceptance*criterion*ids   | ["AC-1"]                           |
    | layer                      | "UI"                               |
    | tags                       | ["smoke", "login"]                 |
    | steps[0] (position content)| 1, "Navigate to login page"        |
    | steps[1] (position content)| 2, "Enter email test@example.com"  |
    | steps[2] (position content)| 3, "Click submit"                  |
    | assertions[0] (pos content)| 1, "Response time < 2s"            |
  Then el API devuelve 201
    And el response body tiene un campo "id" (uuid)
    And el response body tiene "slug" que matchea el regex /^[a-z0-9-]+\/atc-[a-z0-9]{8}$/
    And el response body tiene "version" = 1
    And el response body tiene 3 steps con positions 1, 2, 3
    And el response body tiene 1 assertion con position 1
    And existe una fila en atcs que matchea el id devuelto
    And existen 3 filas en atc*steps con el atc*id devuelto
    And existe 1 fila en atc*assertions con el atc*id devuelto
    And existe 1 fila en atc*acceptance*criteria con el atc_id devuelto y AC-1
    And se loguea un event "atc.created"

Scenario: Update PATCH exitoso con cascade-replace
  Given un ATC existente con id ATC-42, version 1, 3 steps (positions 1,2,3), 2 assertions (positions 1,2)
  When el usuario hace PATCH a /api/v1/atcs/ATC-42 con el body:
    | title    | "Login with valid email (updated)" |
    | steps[0] | position=1, content="New step 1"   |
    | steps[1] | position=2, content="New step 2"   |
    | tags     | ["smoke", "login", "updated"]      |
  Then el API devuelve 200
    And el response body tiene "version" = 2
    And el response body tiene "title" = "Login with valid email (updated)"
    And el response body tiene exactamente 2 steps (los 3 viejos se eliminan)
    And el response body tiene 0 assertions (las 2 viejas se eliminan)
    And la DB tiene exactamente 2 filas en atc_steps para ATC-42
    And la DB tiene 0 filas en atc_assertions para ATC-42
    And se loguea un event "atc.updated" con affected*test*ids: []

# ---- Negative path ----

Scenario: Request sin autenticar rechazado
  Given ningún header Authorization
  When el usuario hace POST a /api/v1/atcs con un payload válido
  Then el API devuelve 401
    And el error code es "unauthorized"

Scenario: Scope insuficiente rechazado
  Given un PAT válido con scope "atc:read" (sin "atc:write")
  When el usuario hace POST a /api/v1/atcs con un payload válido
  Then el API devuelve 403
    And el error code es "forbidden"

Scenario: PATCH a un ATC inexistente
  When el usuario hace PATCH a /api/v1/atcs/00000000-0000-0000-0000-000000000000
  Then el API devuelve 404
    And el error code es "not_found"

Scenario: AC pertenece a otra user story
  Given AC-9 pertenece a US-200 (no a US-100)
  When el usuario hace POST a /api/v1/atcs con user*story*id=US-100 y acceptance*criterion*ids=["AC-9"]
  Then el API devuelve 422
    And el error code es "ac*outside*user_story"
    And no se inserta ninguna fila en atcs, atc*steps, atc*assertions (transactional rollback)

Scenario: Module fuera del project subtree de la user story
  Given US-100 pertenece al project P-1
    And el module M-99 pertenece al project P-2 (project distinto)
  When el usuario hace POST a /api/v1/atcs con user*story*id=US-100 y module_id=M-99
  Then el API devuelve 422
    And el error code es "module*outside*project_subtree"

Scenario: Step positions no estrictamente crecientes desde 1
  When el usuario hace POST a /api/v1/atcs con steps positions [1, 3, 2]
  Then el API devuelve 422
    And el error code es "steps*position*invalid"
    And el response body lista las positions infractoras

Scenario: Step positions que no comienzan en 1
  When el usuario hace POST a /api/v1/atcs con steps positions [2, 3, 4]
  Then el API devuelve 422
    And el error code es "steps*position*invalid"

Scenario: Conflicto de version en PATCH concurrente
  Given ATC-42 está en version 1
  When llegan dos requests PATCH con If-Match: "1"
  Then el primero devuelve 200 con version 2
    And el segundo devuelve 409 con error code "conflict"
    And la respuesta de conflicto incluye la version actual

# ---- Boundary / edge ----

Scenario: Title por debajo de la longitud mínima
  Given un caller autenticado
  When el usuario hace POST a /api/v1/atcs con title "AB" (2 caracteres)
  Then el API devuelve 422
    And el error code es "validation_failed"

Scenario: Array de steps vacío rechazado
  Given un caller autenticado
  When el usuario hace POST a /api/v1/atcs con steps: []
  Then el API devuelve 422
    And el error code es "validation_failed"

# ---- Integration ----

Scenario: Integración del auth middleware — validación del bearer token
  Given un PAT inválido o expirado
  When el usuario hace POST a /api/v1/atcs con un payload válido
  Then el API devuelve 401
    And el error se levanta ANTES de que corra cualquier query a la DB

Scenario: Transactional rollback ante falla de validación
  Given un POST que pasaría la validación de Zod pero falla el cross-entity check (AC pertenece a otra US)
  When el usuario hace POST a /api/v1/atcs
  Then el API devuelve 422
    And SELECT count(*) FROM atcs devuelve el mismo count que antes del request
    And SELECT count(*) FROM atc_steps devuelve el mismo count que antes
    And SELECT count(*) FROM atc_assertions devuelve el mismo count que antes
```

**Markers usados:** todos los ítems NEEDS PO/DEV CONFIRMATION están resueltos explícitamente con decisiones de Senior PO/DEV inline en §Key Contract Decisions. El texto de AC de arriba es final con esas decisiones aplicadas.

---

**Copiado desde el Refined AC por QA — Shift-Left pass 2026-05-27. La propiedad de este campo vuelve al PO después del grooming de Estimation; cualquier edición adicional de AC debe pasar por el PO.**

---

## Business Rules

- acceptance*criterion*ids[] deben pertenecer todos al user*story*id provisto (cross-entity check)
- module_id debe ser igual al module de la user story O ser un module descendiente dentro del mismo project (subtree check)
- layer debe ser uno de {UI, API, Unit} — enum constraint a nivel de DB y de API
- las posiciones de steps[] deben ser enteros, estrictamente crecientes, comenzando en 1
- tags[] tiene longitud máxima 10; el title mide entre 3 y 200 caracteres; el contenido de step máximo 2KB Markdown
- el slug se computa una sola vez en la creación y es inmutable a través de las ediciones (los renombres no cambian el slug)
- el entero de version es monotónicamente creciente por ATC; el PATCH lo incrementa en 1
- PATCH sin cambios (body vacío) = 200, sin incremento de version, sin event
- user*story*id es inmutable en PATCH (se ignora silenciosamente si se provee)

---

## Scope

- Endpoint POST /atcs con validación completa del body (title, module*id, user*story_id, AC ids, layer, steps[], assertions[], tags[])
- Endpoint PATCH /atcs/{id} con semántica de reemplazo total + reemplazo en cascada de steps/assertions
- Insert/update transaccional de las tablas atcs + atc*steps + atc*assertions
- Computación de slug "{module-slug}/atc-{id-first-8-chars}"
- Validación cross-entity (AC pertenece a US, module en project subtree, layer enum, posiciones de steps)
- Bearer PAT auth con scope "atc:write"
- Optimistic locking vía header If-Match en PATCH
- Emisión de event: atc.created en POST, atc.updated en PATCH (con affected*test*ids)
- Entradas en OpenAPI spec para ambos endpoints con schemas de request/response
- Unit + integration tests (reglas cross-entity, rollback de la transaction al fallar, gating de auth)

---

## Workflow

Un miembro llama a POST /atcs con un payload completamente formado (title, module*id, user*story*id, AC ids, layer, steps, assertions, tags). La capa de API valida primero el schema de Zod (sincrónico, barato), luego resuelve el bearer token PAT y chequea el scope atc:write. La validación cross-entity corre como queries de solo lectura: las ACs pertenecen a la US, el module está en el project subtree. Dentro de una sola transaction de DB, bunkai*create*atc inserta la fila de atcs, hace bulk-insert de atc*steps + atc*assertions, computa el slug, y devuelve el nuevo id. Al hacer commit, el event bus dispara atc.created con el payload completo. PATCH /atcs/{id} sigue el mismo camino pero: chequea el version guard de If-Match, llama a bunkai*save*atc (que actualiza el header, hace delete-then-insert de los hijos, incrementa version), y emite atc.updated con affected*test_ids.

---

## Definition of Done

- [ ] Implementación completa
- [ ] Unit tests escritos
- [ ] Code reviewed
- [ ] Documentación actualizada

---

## References

- [SRS API Contract — ATC paths](https://github.com/upexgalaxy67/upex-bunkai-tms/blob/main/.context/SRS/api-contracts.yaml#L268)
- [Architect Annotation — BK-2 comment](https://jira.upexgalaxy.com/browse/BK-2?focusedCommentId=12473)

---

## Labels

`api`, `atc`, `backend`, `mvp`, `wave-2`

---
_Synced from Jira by sync-jira-issues_
