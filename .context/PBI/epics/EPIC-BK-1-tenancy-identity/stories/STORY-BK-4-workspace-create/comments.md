# Comments for BK-4

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-4)

---

### Ely - 5/19/2026, 9:05:42 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Modal: `<CreateWorkspaceDialog />` triggered from Workspace switcher or empty-state CTA.
- Client-side slug preview computed via `slugify(name)`.

### Backend

- Route: `app/api/v1/workspaces/route.ts` (POST).
- Validation: zod schema.
- DB transaction.

### Database

- Tables: `workspaces`, `workspace_members`.
- Index: `UNIQUE (slug)` on `workspaces`; `UNIQUE (owner_user_id, lower(name))`.

## Dependencies
### Blocked By

- BK-2 or BK-3 (need a signed-in user).

### Blocks

- BK-5 (invite teammate) needs an existing workspace.
- BK-6 (switch workspace) needs ≥2 workspaces.
- EPIC-BK-2 (Project & Module Hierarchy) needs Workspace.

## Definition of Done
- [ ] Endpoint passes all 5 AC scenarios on staging.
- [ ] Reserved-slug list defined in `lib/config.ts` (or similar).
- [ ] Realtime event emitted + observable from UI subscription.
- [ ] E2E test: sign-in → create workspace → land on workspace home.

---

### Diego Soria - 5/19/2026, 9:32:53 PM

**Criterios de Aceptación**

#1 - Creación con datos válidos
El usuario autenticado debe poder crear un Workspace ingresando un nombre único y una descripción opcional. El sistema debe validar que el nombre no exista previamente y que cumpla con las reglas de formato (ej. sin caracteres especiales). Al crearse exitosamente, se debe redirigir al usuario al dashboard del nuevo Workspace.

#2 - Aislamiento de datos (multi-tenancy)
Una vez creado el Workspace, todos los datos, configuraciones y miembros asociados deben estar completamente aislados de otros Workspaces. Un usuario de un Workspace no debe poder acceder a datos de otro Workspace bajo ninguna circunstancia.

#3 - Manejo de errores y límites
El sistema debe mostrar mensajes de error claros cuando: (a) el nombre del Workspace ya existe, (b) se excede el límite máximo de Workspaces por usuario, (c) ocurre un error del servidor. Además, debe impedir la creación si el usuario no está autenticado.

---

### Ely - 5/19/2026, 9:36:21 PM

🤖 **Análisis de Shift-Left QA**

He realizado una revisión preventiva (Shift-Left) sobre el scope de esta historia y sugiero refinar los Criterios de Aceptación (AC) para evitar fallos de seguridad (inyección), colisiones silenciosas en BD y errores de sanitización.

Aquí está la propuesta con los ACs refinados y los nuevos escenarios a incorporar:

```gherkin
### 🔄 Criterios Refinados (Existentes)

Escenario: Creación exitosa ignorando payload inyectado (Strict Parsing)
  Dado un usuario autenticado
  Cuando hace un POST a /api/v1/workspaces con {"name": "Acme QA", "role": "admin"}
  Entonces el sistema ignora el campo malicioso "role"
  Y crea el workspace con slug "acme-qa" y rol "owner" por defecto
  Y retorna 201

Escenario: Nombre duplicado por owner (Case & Accent-insensitive)
  Dado un usuario que ya es dueño del workspace "Acme QA"
  Cuando envía un POST para crear el workspace "Ácme qa" (con tildes y minúsculas)
  Entonces el sistema retorna 409 con código NAME_DUPLICATE_FOR_OWNER

Escenario: Rechazo de nombre muy corto (Aplicando trim)
  Dado un usuario autenticado
  Cuando envía un nombre de workspace "   A   " (con espacios)
  Entonces el sistema aplica trim() previo
  Y retorna 400 con código NAME_TOO_SHORT (min 3 chars)

### 🆕 Nuevos Criterios Propuestos

Escenario: Colisión global de slug derivado
  Dado un usuario autenticado
  Cuando envía un nombre que deriva a un slug que ya existe a nivel global (de otro tenant)
  Entonces el sistema retorna 409 con código SLUG_IN_USE

Escenario: Slug derivado inválido (Sanitización destructiva)
  Dado un usuario autenticado
  Cuando envía un nombre (ej. "! @ # A * &") que al derivarse resulta en un slug < 3 caracteres
  Entonces el sistema retorna 400 con código INVALID_DERIVED_SLUG
```

---

### Deiberson Escalante - 5/19/2026, 9:37:20 PM

1. **El usuario autenticado puede crear un workspace** enviando un nombre válido vía POST a `/api/v1/workspaces`.
2. **El nombre del workspace debe tener al menos 3 caracteres**. Si tiene 1 o 2 caracteres, se rechaza con error 400 y código `NAME_TOO_SHORT`.
3. **El nombre no puede exceder la longitud máxima** (definida en {{PROJECT_KEY}}-002, por ejemplo 50 caracteres). Si la excede, se rechaza con 400 y código `NAME_TOO_LONG`.
4. **No se permiten slugs reservados** (como `api`, `app`, `auth`, `admin`, `bunkai`, etc.). Si el nombre se slugifica a una palabra reservada, se rechaza con 400 y código `SLUG_RESERVED`, indicando la lista de slugs prohibidos.
5. **Un usuario no puede tener dos workspaces con el mismo nombre (insensible a mayúsculas/minúsculas)**. Si intenta crear un segundo workspace con un nombre que ya posee (ej. ya tiene "Acme QA" y quiere "acme qa"), se rechaza con 409 y código `NAME_DUPLICATE_FOR_OWNER`.
6. **Se emite un evento **`workspace.created` en el canal de tiempo real exclusivo para el propietario del workspace.
7. **Los usuarios no autenticados no pueden crear workspaces**. Si intentan hacerlo, reciben 401 Unauthorized con el código `MISSING_OR_INVALID_TOKEN`.
8. **El slug generado debe ser único a nivel global** (no puede existir otro workspace con el mismo slug, incluso de otro usuario). Si hay conflicto, el sistema debe rechazar con 409 `SLUG_ALREADY_EXISTS` o, alternativamente, añadir un sufijo numérico (según decisión de diseño). Este criterio debe aclararse en las reglas de negocio.
9. **El slug debe generarse correctamente** a partir de nombres con espacios, mayúsculas, acentos o caracteres especiales, normalizándolos a minúsculas y caracteres alfanuméricos con guiones (ej. "Mi Área de Trabajo!!" → "mi-area-de-trabajo").
10. **El usuario puede crear múltiples workspaces con nombres diferentes** sin restricción de cantidad (siempre que cumplan el resto de validaciones). Cada uno será independiente y el usuario será owner de cada uno.

---

### Luis Eduardo Flores Villarroel - 5/19/2026, 9:40:34 PM

---

# User Story: Create Space — Criterios de Aceptación

## Contexto

  Sistema de test management multicliente. El workspace es el tenant raíz.
  El creador recibe rol `owner` automáticamente. El slug se auto-deriva del nombre.

---

## GRUPO 1 — Happy Path

  **Scenario 1.1 — Creación exitosa (caso base)**
  Given un usuario autenticado
  When POST /api/v1/workspaces con { name: "Acme QA" }
  Then se inserta un row en workspaces con slug "acme-qa"
  And se inserta el creador en workspace_members con role "owner"
  And retorna 201 con { workspace_id, name: "Acme QA", slug: "acme-qa", created_at }

  **Scenario 1.2 — Nombre con espacios múltiples/leading/trailing se normaliza**
  Given un usuario autenticado
  When POST con { name: "  Acme   QA  " }
  Then el nombre se normaliza a "Acme QA" antes de persistir (trim + colapso de espacios)
  And el slug se deriva del nombre normalizado: "acme-qa"
  And retorna 201

> ⚠️ Zona gris resuelta: el nombre almacenado es el normalizado, no el original literal.

  **Scenario 1.3 — Nombre con caracteres acentuados/unicode**
  Given un usuario autenticado
  When POST con { name: "Área QA" }
  Then el slug transliterado es "area-qa" (acentos eliminados, no slug vacío)
  And el nombre almacenado conserva los acentos: "Área QA"
  And retorna 201 con slug "area-qa"

---

## GRUPO 2 — Validación del Campo `name`

  **Scenario 2.1 — Campo **`name` ausente en el payload
  Given un usuario autenticado
  When POST con payload {} o payload vacío
  Then retorna 400 con code MISSING_REQUIRED_FIELD y campo "name" indicado en el error

  **Scenario 2.2 — **`name` con tipo incorrecto (no-string)
  Given un usuario autenticado
  When POST con { name: 123 } o { name: true } o { name: null }
  Then retorna 400 con code INVALID_FIELD_TYPE

  **Scenario 2.3 — Nombre string vacío**
  Given un usuario autenticado
  When POST con { name: "" }
  Then retorna 400 con code NAME_TOO_SHORT y { min: 3 }

  **Scenario 2.4 — Nombre solo espacios en blanco**
  Given un usuario autenticado
  When POST con { name: "   " }
  Then retorna 400 con code NAME_TOO_SHORT (longitud efectiva tras trim = 0)

  **Scenario 2.5 — Nombre en límite inferior exacto (3 chars) — boundary value**
  Given un usuario autenticado
  When POST con { name: "QAs" } (exactamente 3 caracteres)
  Then retorna 201

  **Scenario 2.6 — Nombre por debajo del mínimo (1–2 chars)**
  Given un usuario autenticado
  When POST con { name: "AB" } (2 caracteres)
  Then retorna 400 con code NAME_TOO_SHORT y { min: 3 }

  **Scenario 2.7 — Nombre en límite superior exacto (100 chars) — boundary value**
  Given un usuario autenticado
  When POST con un nombre de exactamente 100 caracteres
  Then retorna 201

  **Scenario 2.8 — Nombre excede el máximo (> 100 chars)**
  Given un usuario autenticado
  When POST con un nombre de 101+ caracteres
  Then retorna 400 con code NAME_TOO_LONG y { max: 100 }

  **Scenario 2.9 — Nombre con solo caracteres especiales (produce slug vacío)**
  Given un usuario autenticado
  When POST con { name: "!@#$%" } cuyo slug resultante sería "" o "-"
  Then retorna 400 con code INVALID_NAME_FORMAT

---

## GRUPO 3 — Derivación y Validación del Slug

  **Scenario 3.1 — Slug reservado por nombre literal**
  Given un usuario autenticado
  When POST con { name: "API" } (slug: "api")
  Then retorna 400 con code SLUG_RESERVED
  And el body incluye la lista completa de slugs reservados

  **Scenario 3.2 — Nombre no reservado que produce slug reservado tras sanitización**
  Given un usuario autenticado
  When POST con { name: "A.D.M.I.N" } que tras sanitización produce slug "admin"
  Then retorna 400 con code SLUG_RESERVED

> ⚠️ La validación debe ejecutarse sobre el slug derivado, no sobre el nombre literal.

  **Scenario 3.3 — Colisión de slug entre owners distintos**
  Given que ya existe workspace con slug "acme-qa" creado por el usuario A
  When el usuario B POST con { name: "Acme QA" }
  Then [DECISIÓN PENDIENTE — definir scope de unicidad del slug]
    Opción A (slug global único): retorna 409 con code SLUG_TAKEN
    Opción B (slug único por owner): retorna 201

> ⚠️ Zona gris crítica: este comportamiento debe quedar explícito en el diseño antes de implementar.

---

## GRUPO 4 — Unicidad por Owner

  **Scenario 4.1 — Duplicado por owner case-insensitive (existente)**
  Given un usuario que ya posee un workspace con nombre "Acme QA"
  When POST con { name: "acme qa" }
  Then retorna 409 con code NAME_DUPLICATE_FOR_OWNER

  **Scenario 4.2 — Mismo nombre literal, slug diferente (¿se considera duplicado?)**
  Given un usuario que ya posee workspace "Acme QA" (slug: "acme-qa")
  When el mismo usuario POST con { name: "Acme-QA" } (slug también: "acme-qa")
  Then retorna 409 con code NAME_DUPLICATE_FOR_OWNER

> ⚠️ El chequeo de duplicado debe operar sobre el slug derivado, no solo sobre el nombre literal.

---

## GRUPO 5 — Autenticación y Autorización

  **Scenario 5.1 — Request sin token de autenticación**
  Given un cliente sin Authorization header
  When POST /api/v1/workspaces
  Then retorna 401 con code UNAUTHORIZED

  **Scenario 5.2 — Token expirado**
  Given un cliente con JWT vencido
  When POST /api/v1/workspaces
  Then retorna 401 con code TOKEN_EXPIRED

  **Scenario 5.3 — Campos de ownership ignorados del payload**
  Given un usuario autenticado como usuario A
  When POST con { name: "Acme QA", owner_id: "user-B-id" }
  Then el workspace es creado con owner = usuario A (del token)
  And el campo owner_id del payload es ignorado silenciosamente
  And retorna 201

> ⚠️ El ownership siempre se deriva del token autenticado, nunca del payload.

---

## GRUPO 6 — Atomicidad y Consistencia Transaccional

  **Scenario 6.1 — Fallo en **`workspace_members` después de insertar en `workspaces`
  Given que la inserción en workspaces es exitosa
  When la inserción en workspace_members falla (e.g., error de DB)
  Then la transacción hace rollback completo
  And no queda ningún row huérfano en workspaces
  And retorna 500 con code INTERNAL_ERROR

  **Scenario 6.2 — Fallo de emisión del evento **`workspace.created`
  Given una creación de workspace exitosa (ambas inserciones OK)
  When la emisión del evento falla (e.g., broker caído)
  Then [DECISIÓN PENDIENTE — definir si la emisión es bloqueante]
    Opción A (síncrona y crítica): rollback → retorna 500
    Opción B (asíncrona/best-effort): workspace persiste, evento se reintenta → retorna 201

> ⚠️ Zona gris: si el evento falla y no hay rollback, el sistema puede quedar
en estado inconsistente para listeners que dependen del evento.

---

## GRUPO 7 — Concurrencia

  **Scenario 7.1 — Dos requests simultáneos con el mismo nombre, mismo owner**
  Given un usuario autenticado sin workspaces previos
  When dos POST con { name: "Acme QA" } son enviados simultáneamente
  Then exactamente uno retorna 201 y el otro retorna 409 con code NAME_DUPLICATE_FOR_OWNER
  And no se crean filas duplicadas en workspaces

> ⚠️ La unicidad debe garantizarse mediante DB constraint (unique index),
no solo validación a nivel aplicación. Sin esto, la condición de carrera
puede crear duplicados.

---

## GRUPO 8 — Payload y Protocolo HTTP

  **Scenario 8.1 — Content-Type incorrecto**
  Given un usuario autenticado
  When POST con Content-Type: text/plain
  Then retorna 415 Unsupported Media Type

  **Scenario 8.2 — JSON malformado**
  Given un usuario autenticado
  When POST con body { name: "Acme QA" (JSON sin cerrar)
  Then retorna 400 con code MALFORMED_JSON

  **Scenario 8.3 — Payload con campos extra**
  Given un usuario autenticado
  When POST con { name: "Acme QA", plan: "enterprise", role: "god" }
  Then el sistema ignora campos no reconocidos
  And retorna 201 usando solo el campo name

---

## GRUPO 9 — Evento Realtime

  **Scenario 9.1 — Evento **`workspace.created` emitido con contrato completo (existente, refinado)
  Given una creación de workspace exitosa
  Then se emite evento workspace.created en el canal realtime del owner
  And el payload del evento incluye { workspace_id, slug, name, created_at }

> ⚠️ El contrato del evento (qué campos lleva) debe estar definido explícitamente.

  **Scenario 9.2 — Solo el owner recibe el evento**
  Given una creación de workspace exitosa
  Then solo el canal del owner recibe el evento
  And el evento no se emite a canales globales ni a otros usuarios

---

## Zonas Grises Pendientes de Decisión

| #   | Zona gris | Impacto si no se define |
| --- | --------- | ----------------------- |
|     | ZG-       |                         | ¿Slug es único globalmente o solo por owner                 |  | Comportamiento indefinido cuando dos usuarios crean el mismo nombr |
|     | ZG-       |                         | ¿La emisión del evento es síncrona (bloqueante) o asíncrona |  | Inconsistencia de estado si el evento falla sin rollbac            |
|     | ZG-       |                         | ¿El nombre se almacena normalizado o tal como llega         |  | Inconsistencias en búsqueda y displa                               |
|     | ZG-       |                         | ¿Existen límites de workspaces por plan de usuario          |  | Sin definir, no hay cómo testear el límit                          |
|     | ZG-       |                         | ¿Qué campos lleva el payload del evento `workspace.created` |  | Listeners pueden romper por contrato ambigu                        |
|     | ZG-       |                         | ¿Cómo se transliteran caracteres unicode en el slug         |  | Comportamiento no determinístico para nombres no-ASCI              |

---

  Los puntos más críticos antes de comenzar la implementación son ZG-1 (scope del slug) y ZG-2 (naturaleza del evento), porque afectan directamente el modelo de datos y la estrategia de
  rollback. El resto puede resolverse durante el desarrollo, pero estos dos generan decisiones de arquitectura que son caras de cambiar después.

---

### Jürgen Salinas - 5/19/2026, 9:40:40 PM

- **El Rol del Creador (Múltiples Organizaciones):** La regla dice **"Duplicate name per owner"**. En sistemas B2B/SaaS modernos, la restricción de duplicados suele aplicar a nivel de toda la base de datos (global) para evitar colisiones en la URL (ej. `app.bunkai.io/acme-qa`). Si es por dueño, significa que el Usuario A puede crear "Acme" y el Usuario B también puede crear "Acme". Si tu arquitectura maneja subdominios o URLs dinámicas, la unicidad del **slug** debería ser global. He asumido que prefieres **unicidad global del slug** para proteger las URLs.
- **Sanitización del Slug:** ¿Qué pasa con los caracteres especiales o acentos? (Ej: "Logística & QA" -> `logistica-qa`). Vale la pena aclarar cómo se procesa.
- **Límites Máximos:** Definiste el mínimo (3 caracteres), pero falta el límite máximo de la base de datos (generalmente 50 o 100 caracteres) para evitar errores de desbordamiento de columna.
- **Validación del Token/Autenticación:** Añadir el escenario obvio pero vital para QA: ¿qué pasa si el usuario no está autenticado? (401 Unauthorized).

---

### Nahuel Gomez - 5/19/2026, 9:54:07 PM

## QA Engineer - Acceptance Criteria

*Scope: *QA sign-off checklist for BK-4. See Luis Eduardo ACs (comment 12465) for detailed field-level coverage.

### 1. Happy Path - Creation and Data Isolation

```gherkin
Scenario: Authenticated user creates a workspace successfully
  Given an authenticated user with a valid JWT
  When they POST /api/v1/workspaces with {"name": "Acme QA"}
  Then the response status is 201
  And the response body contains id, name, slug, createdAt, ownerId
  And the slug is derived as "acme-qa"
  And the user is auto-assigned role "owner" in workspace_members
```

```gherkin
Scenario: Data isolation between workspaces is enforced
  Given workspace A owned by User1 and workspace B owned by User2
  When User1 requests a resource from workspace B
  Then the response status is 403
  And no data from workspace B is leaked
```

```gherkin
Scenario: Unauthenticated request is rejected
  Given no Authorization header
  When a POST is sent to /api/v1/workspaces with {"name": "Test"}
  Then the response status is 401
  And the response body contains code "UNAUTHORIZED"
```

### 2. Non-Functional Verification

**API Contract**

- Response payload matches OpenAPI schema: `id` (uuid), `name`, `slug`, `createdAt` (ISO8601), `ownerId` (uuid)
- Extra fields in payload are silently ignored (no 4xx)

**Database Integrity**

- Record persists in `workspaces` with correct `owner_user_id` FK
- Creator row in `workspace_members` with role "owner"
- If `workspace_members` fails, `workspaces` is rolled back

**Security**

- Expired JWT returns `401 TOKEN_EXPIRED`
- Ownership fields (`owner_id`, `role`) ignored

**Performance & Observability**

- P95 response time < 500ms under 100 concurrent requests
- Audit log for every workspace creation

### 3. Edge Cases & Concurrency

```gherkin
Scenario: Concurrent creation with same name
  Given an authenticated user with no existing workspaces
  When two POST requests with {"name": "Acme QA"} are sent simultaneously
  Then exactly one returns 201
  And the other returns 409 with code "NAME_DUPLICATE_FOR_OWNER"
  And only one row exists in workspaces table
```

```gherkin
Scenario: Creation with reserved slug
  Given a reserved slug list containing "api", "admin", "settings"
  When an authenticated user POSTs {"name": "API"}
  Then the response status is 400 with code "SLUG_RESERVED"
```

### 4. Test Coverage Requirement

**Automated test suite must include:**

- 1 integration test per Gherkin scenario above
- Contract test validating OpenAPI schema compliance
- Data isolation test (cross-tenant access)
- Concurrency test (race condition)

**All scenarios in Luis Eduardo ACs **must also be covered by automated tests before QA sign-off.

---

### maibeth vega - 5/19/2026, 9:57:27 PM

### Casos de Prueba — BK-4: Create a Workspace

**Analista: **Maibeth Vega  |  **Fecha: **2026-05-19  |  **Alineación: **100% criterios de aceptación

| ID    | Criterio AC  | Escenario                                     | Entrada                                                           | Resultado Esperado                                                      |
| ----- | ------------ | --------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CP-01 | AC 1–4, 9–10 | Happy path completo                           | POST /api/v1/workspaces { name: "Acme QA" } — usuario autenticado | 201 con { workspace_id, slug: "acme-qa" }, UI navega al nuevo workspace |
| CP-02 | AC 5         | Nombre demasiado corto                        | { name: "A" } (1 char)                                            | 400 — código NAME_TOO_SHORT                                             |
| CP-03 | AC 5         | Nombre sin carácter alfanumérico              | { name: "---" }                                                   | 400 — validación alfanumérica                                           |
| CP-04 | AC 6         | Slug reservado                                | { name: "API" } → slug "api"                                      | 400 — código SLUG_RESERVED                                              |
| CP-05 | AC 6         | Nombre duplicado por owner (case-insensitive) | Owner ya tiene "Acme QA". POST con { name: "acme qa" }            | 409 — código NAME_DUPLICATE_FOR_OWNER                                   |
| CP-06 | AC 7         | Creator asignado como owner                   | Creación exitosa                                                  | Fila en workspace_members con role=owner para el creador                |
| CP-07 | AC 8         | Evento workspace.created emitido              | Creación exitosa                                                  | Evento workspace.created emitido en canal realtime del owner            |
| CP-08 | AC 1         | Usuario no autenticado                        | POST sin token de autenticación                                   | 401 Unauthorized                                                        |

**— Análisis QA generado por Maibeth Vega**

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:57:59.716Z_
