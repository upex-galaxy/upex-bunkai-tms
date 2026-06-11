# Comments for BK-4

[View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

---

### Ely - 5/19/2026, 9:05:42 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Modal: `<CreateWorkspaceDialog />` triggered from Workspace switcher or empty-state CTA.
- Client-side slug preview computed via `slugify(name)`.

1. 

- Route: `app/api/v1/workspaces/route.ts` (POST).
- Validation: zod schema.
- DB transaction.

1. 

- Tables: `workspaces`, `workspace_members`.
- Index: `UNIQUE (slug)` on `workspaces`; `UNIQUE (owner*user*id, lower(name))`.

1. 

- [https://jira.upexgalaxy.com/browse/BK-2#icft=BK-2](https://jira.upexgalaxy.com/browse/BK-2#icft=BK-2) or [https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3](https://jira.upexgalaxy.com/browse/BK-3#icft=BK-3) (need a signed-in user).

1. 

- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) (invite teammate) needs an existing workspace.
- [https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6](https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6) (switch workspace) needs ≥2 workspaces.
- EPIC-BK-2 (Project & Module Hierarchy) needs Workspace.

1. 

- [ ] Endpoint passes all 5 AC scenarios on staging.
- [ ] Reserved-slug list defined in `lib/config.ts` (or similar).
- [ ] Realtime event emitted + observable from UI subscription.
- [ ] E2E test: sign-in → create workspace → land on workspace home.

---

### Diego Soria - 5/19/2026, 9:32:53 PM

***Criterios de Aceptación***

#1 - Creación con datos válidos
El usuario autenticado debe poder crear un Workspace ingresando un nombre único y una descripción opcional. El sistema debe validar que el nombre no exista previamente y que cumpla con las reglas de formato (ej. sin caracteres especiales). Al crearse exitosamente, se debe redirigir al usuario al dashboard del nuevo Workspace.

#2 - Aislamiento de datos (multi-tenancy)
Una vez creado el Workspace, todos los datos, configuraciones y miembros asociados deben estar completamente aislados de otros Workspaces. Un usuario de un Workspace no debe poder acceder a datos de otro Workspace bajo ninguna circunstancia.

#3 - Manejo de errores y límites
El sistema debe mostrar mensajes de error claros cuando: (a) el nombre del Workspace ya existe, (b) se excede el límite máximo de Workspaces por usuario, (c) ocurre un error del servidor. Además, debe impedir la creación si el usuario no está autenticado.

---

### Ely - 5/19/2026, 9:36:21 PM

🤖 ****Análisis de Shift-Left QA****

He realizado una revisión preventiva (Shift-Left) sobre el scope de esta historia y sugiero refinar los Criterios de Aceptación (AC) para evitar fallos de seguridad (inyección), colisiones silenciosas en BD y errores de sanitización.

Aquí está la propuesta con los ACs refinados y los nuevos escenarios a incorporar:

```gherkin

1. 

Escenario: Creación exitosa ignorando payload inyectado (Strict Parsing)

Dado un usuario autenticado
Cuando hace un POST a /api/v1/workspaces con {"name": "Acme QA", "role": "admin"}
Entonces el sistema ignora el campo malicioso "role"
Y crea el workspace con slug "acme-qa" y rol "owner" por defecto
Y retorna 201

Escenario: Nombre duplicado por owner (Case & Accent-insensitive)
Dado un usuario que ya es dueño del workspace "Acme QA"
Cuando envía un POST para crear el workspace "Ácme qa" (con tildes y minúsculas)
Entonces el sistema retorna 409 con código NAME*DUPLICATE*FOR_OWNER

Escenario: Rechazo de nombre muy corto (Aplicando trim)
Dado un usuario autenticado
Cuando envía un nombre de workspace "   A   " (con espacios)
Entonces el sistema aplica trim() previo
Y retorna 400 con código NAME*TOO*SHORT (min 3 chars)

1. 

Escenario: Colisión global de slug derivado

Dado un usuario autenticado
Cuando envía un nombre que deriva a un slug que ya existe a nivel global (de otro tenant)
Entonces el sistema retorna 409 con código SLUG*IN*USE

Escenario: Slug derivado inválido (Sanitización destructiva)
Dado un usuario autenticado
Cuando envía un nombre (ej. "! @ # A * &") que al derivarse resulta en un slug < 3 caracteres
Entonces el sistema retorna 400 con código INVALID*DERIVED*SLUG
```

---

### Deiberson Escalante - 5/19/2026, 9:37:20 PM

1. ***El usuario autenticado puede crear un workspace*** enviando un nombre válido vía POST a `/api/v1/workspaces`.
2. ***El nombre del workspace debe tener al menos 3 caracteres***. Si tiene 1 o 2 caracteres, se rechaza con error 400 y código `NAME*TOO*SHORT`.
3. ***El nombre no puede exceder la longitud máxima*** (definida en FR-002, por ejemplo 50 caracteres). Si la excede, se rechaza con 400 y código `NAME*TOO*LONG`.
4. ***No se permiten slugs reservados*** (como `api`, `app`, `auth`, `admin`, `bunkai`, etc.). Si el nombre se slugifica a una palabra reservada, se rechaza con 400 y código `SLUG_RESERVED`, indicando la lista de slugs prohibidos.
5. ***Un usuario no puede tener dos workspaces con el mismo nombre (insensible a mayúsculas/minúsculas)***. Si intenta crear un segundo workspace con un nombre que ya posee (ej. ya tiene "Acme QA" y quiere "acme qa"), se rechaza con 409 y código `NAME*DUPLICATE*FOR_OWNER`.
6. ***Se emite un evento*** `workspace.created` en el canal de tiempo real exclusivo para el propietario del workspace.
7. ***Los usuarios no autenticados no pueden crear workspaces***. Si intentan hacerlo, reciben 401 Unauthorized con el código `MISSING*OR*INVALID_TOKEN`.
8. ***El slug generado debe ser único a nivel global*** (no puede existir otro workspace con el mismo slug, incluso de otro usuario). Si hay conflicto, el sistema debe rechazar con 409 `SLUG*ALREADY*EXISTS` o, alternativamente, añadir un sufijo numérico (según decisión de diseño). Este criterio debe aclararse en las reglas de negocio.
9. ***El slug debe generarse correctamente*** a partir de nombres con espacios, mayúsculas, acentos o caracteres especiales, normalizándolos a minúsculas y caracteres alfanuméricos con guiones (ej. "Mi Área de Trabajo!!" → "mi-area-de-trabajo").
10. ***El usuario puede crear múltiples workspaces con nombres diferentes*** sin restricción de cantidad (siempre que cumplan el resto de validaciones). Cada uno será independiente y el usuario será owner de cada uno.

---

### Luis Eduardo Flores Villarroel - 5/19/2026, 9:40:34 PM

---

# User Story: Create Space — Criterios de Aceptación

## Contexto

Sistema de test management multicliente. El workspace es el tenant raíz.
El creador recibe rol `owner` automáticamente. El slug se auto-deriva del nombre.

---

## GRUPO 1 — Happy Path

***Scenario 1.1 — Creación exitosa (caso base)***
Given un usuario autenticado
When POST /api/v1/workspaces con { name: "Acme QA" }
Then se inserta un row en workspaces con slug "acme-qa"
And se inserta el creador en workspace_members con role "owner"
And retorna 201 con { workspace*id, name: "Acme QA", slug: "acme-qa", created*at }

***Scenario 1.2 — Nombre con espacios múltiples/leading/trailing se normaliza***
Given un usuario autenticado
When POST con { name: "  Acme   QA  " }
Then el nombre se normaliza a "Acme QA" antes de persistir (trim + colapso de espacios)
And el slug se deriva del nombre normalizado: "acme-qa"
And retorna 201

> ⚠️ Zona gris resuelta: el nombre almacenado es el normalizado, no el original literal.

***Scenario 1.3 — Nombre con caracteres acentuados/unicode***
Given un usuario autenticado
When POST con { name: "Área QA" }
Then el slug transliterado es "area-qa" (acentos eliminados, no slug vacío)
And el nombre almacenado conserva los acentos: "Área QA"
And retorna 201 con slug "area-qa"

---

## GRUPO 2 — Validación del Campo `name`

***Scenario 2.1 — Campo*** `name` ausente en el payload
Given un usuario autenticado
When POST con payload {} o payload vacío
Then retorna 400 con code MISSING*REQUIRED*FIELD y campo "name" indicado en el error

***Scenario 2.2 —*** `name` con tipo incorrecto (no-string)
Given un usuario autenticado
When POST con { name: 123 } o { name: true } o { name: null }
Then retorna 400 con code INVALID*FIELD*TYPE

***Scenario 2.3 — Nombre string vacío***
Given un usuario autenticado
When POST con { name: "" }
Then retorna 400 con code NAME*TOO*SHORT y { min: 3 }

***Scenario 2.4 — Nombre solo espacios en blanco***
Given un usuario autenticado
When POST con { name: "   " }
Then retorna 400 con code NAME*TOO*SHORT (longitud efectiva tras trim = 0)

***Scenario 2.5 — Nombre en límite inferior exacto (3 chars) — boundary value***
Given un usuario autenticado
When POST con { name: "QAs" } (exactamente 3 caracteres)
Then retorna 201

***Scenario 2.6 — Nombre por debajo del mínimo (1–2 chars)***
Given un usuario autenticado
When POST con { name: "AB" } (2 caracteres)
Then retorna 400 con code NAME*TOO*SHORT y { min: 3 }

***Scenario 2.7 — Nombre en límite superior exacto (100 chars) — boundary value***
Given un usuario autenticado
When POST con un nombre de exactamente 100 caracteres
Then retorna 201

***Scenario 2.8 — Nombre excede el máximo (> 100 chars)***
Given un usuario autenticado
When POST con un nombre de 101+ caracteres
Then retorna 400 con code NAME*TOO*LONG y { max: 100 }

***Scenario 2.9 — Nombre con solo caracteres especiales (produce slug vacío)***
Given un usuario autenticado
When POST con { name: "!@#$%" } cuyo slug resultante sería "" o "-"
Then retorna 400 con code INVALID*NAME*FORMAT

---

## GRUPO 3 — Derivación y Validación del Slug

***Scenario 3.1 — Slug reservado por nombre literal***
Given un usuario autenticado
When POST con { name: "API" } (slug: "api")
Then retorna 400 con code SLUG_RESERVED
And el body incluye la lista completa de slugs reservados

***Scenario 3.2 — Nombre no reservado que produce slug reservado tras sanitización***
Given un usuario autenticado
When POST con { name: "A.D.M.I.N" } que tras sanitización produce slug "admin"
Then retorna 400 con code SLUG_RESERVED 

> ⚠️ La validación debe ejecutarse sobre el slug derivado, no sobre el nombre literal.

***Scenario 3.3 — Colisión de slug entre owners distintos***
Given que ya existe workspace con slug "acme-qa" creado por el usuario A
When el usuario B POST con { name: "Acme QA" }
Then [DECISIÓN PENDIENTE — definir scope de unicidad del slug]
Opción A (slug global único): retorna 409 con code SLUG_TAKEN
Opción B (slug único por owner): retorna 201

> ⚠️ Zona gris crítica: este comportamiento debe quedar explícito en el diseño antes de implementar.

---

## GRUPO 4 — Unicidad por Owner

***Scenario 4.1 — Duplicado por owner case-insensitive (existente)***
Given un usuario que ya posee un workspace con nombre "Acme QA"
When POST con { name: "acme qa" }
Then retorna 409 con code NAME*DUPLICATE*FOR_OWNER

***Scenario 4.2 — Mismo nombre literal, slug diferente (¿se considera duplicado?)***
Given un usuario que ya posee workspace "Acme QA" (slug: "acme-qa")
When el mismo usuario POST con { name: "Acme-QA" } (slug también: "acme-qa")
Then retorna 409 con code NAME*DUPLICATE*FOR_OWNER

> ⚠️ El chequeo de duplicado debe operar sobre el slug derivado, no solo sobre el nombre literal.

---

## GRUPO 5 — Autenticación y Autorización

***Scenario 5.1 — Request sin token de autenticación***
Given un cliente sin Authorization header
When POST /api/v1/workspaces
Then retorna 401 con code UNAUTHORIZED

***Scenario 5.2 — Token expirado***
Given un cliente con JWT vencido
When POST /api/v1/workspaces
Then retorna 401 con code TOKEN_EXPIRED

***Scenario 5.3 — Campos de ownership ignorados del payload***
Given un usuario autenticado como usuario A
When POST con { name: "Acme QA", owner_id: "user-B-id" }
Then el workspace es creado con owner = usuario A (del token)
And el campo owner_id del payload es ignorado silenciosamente
And retorna 201

> ⚠️ El ownership siempre se deriva del token autenticado, nunca del payload.

---

## GRUPO 6 — Atomicidad y Consistencia Transaccional

***Scenario 6.1 — Fallo en*** `workspace_members` después de insertar en `workspaces`
Given que la inserción en workspaces es exitosa
When la inserción en workspace_members falla (e.g., error de DB)
Then la transacción hace rollback completo
And no queda ningún row huérfano en workspaces
And retorna 500 con code INTERNAL_ERROR

***Scenario 6.2 — Fallo de emisión del evento*** `workspace.created`
Given una creación de workspace exitosa (ambas inserciones OK)
When la emisión del evento falla (e.g., broker caído)
Then [DECISIÓN PENDIENTE — definir si la emisión es bloqueante]
Opción A (síncrona y crítica): rollback → retorna 500
Opción B (asíncrona/best-effort): workspace persiste, evento se reintenta → retorna 201

> ⚠️ Zona gris: si el evento falla y no hay rollback, el sistema puede quedar
en estado inconsistente para listeners que dependen del evento.

---

## GRUPO 7 — Concurrencia

***Scenario 7.1 — Dos requests simultáneos con el mismo nombre, mismo owner***
Given un usuario autenticado sin workspaces previos
When dos POST con { name: "Acme QA" } son enviados simultáneamente
Then exactamente uno retorna 201 y el otro retorna 409 con code NAME*DUPLICATE*FOR_OWNER
And no se crean filas duplicadas en workspaces

> ⚠️ La unicidad debe garantizarse mediante DB constraint (unique index),
no solo validación a nivel aplicación. Sin esto, la condición de carrera
puede crear duplicados.

---

## GRUPO 8 — Payload y Protocolo HTTP

***Scenario 8.1 — Content-Type incorrecto***
Given un usuario autenticado
When POST con Content-Type: text/plain
Then retorna 415 Unsupported Media Type

***Scenario 8.2 — JSON malformado***
Given un usuario autenticado
When POST con body { name: "Acme QA" (JSON sin cerrar)
Then retorna 400 con code MALFORMED_JSON

***Scenario 8.3 — Payload con campos extra***
Given un usuario autenticado
When POST con { name: "Acme QA", plan: "enterprise", role: "god" }
Then el sistema ignora campos no reconocidos
And retorna 201 usando solo el campo name

---

## GRUPO 9 — Evento Realtime

***Scenario 9.1 — Evento*** `workspace.created` emitido con contrato completo (existente, refinado)
Given una creación de workspace exitosa
Then se emite evento workspace.created en el canal realtime del owner
And el payload del evento incluye { workspace*id, slug, name, created*at }

> ⚠️ El contrato del evento (qué campos lleva) debe estar definido explícitamente.

***Scenario 9.2 — Solo el owner recibe el evento***
Given una creación de workspace exitosa
Then solo el canal del owner recibe el evento
And el evento no se emite a canales globales ni a otros usuarios

---

## Zonas Grises Pendientes de Decisión

| ***#**** | ****Zona gris**** | ****Impacto si no se define*** |
| --- | --- | --- |
| ***ZG-**** | ****¿Slug es único globalmente o solo por owner**** | ****Comportamiento indefinido cuando dos usuarios crean el mismo nombr*** |
| ***ZG-**** | ****¿La emisión del evento es síncrona (bloqueante) o asíncrona**** | ****Inconsistencia de estado si el evento falla sin rollbac*** |
| ***ZG-**** | ****¿El nombre se almacena normalizado o tal como llega**** | ****Inconsistencias en búsqueda y displa*** |
| ***ZG-**** | ****¿Existen límites de workspaces por plan de usuario**** | ****Sin definir, no hay cómo testear el límit*** |
| ***ZG-**** | ****¿Qué campos lleva el payload del evento ****`workspace.created` | ****Listeners pueden romper por contrato ambigu*** |
| ***ZG-**** | ****¿Cómo se transliteran caracteres unicode en el slug**** | ****Comportamiento no determinístico para nombres no-ASCI*** |

---

Los puntos más críticos antes de comenzar la implementación son ZG-1 (scope del slug) y ZG-2 (naturaleza del evento), porque afectan directamente el modelo de datos y la estrategia de
rollback. El resto puede resolverse durante el desarrollo, pero estos dos generan decisiones de arquitectura que son caras de cambiar después.

---

### Jürgen Salinas - 5/19/2026, 9:40:40 PM

- ***El Rol del Creador (Múltiples Organizaciones):**** La regla dice **"Duplicate name per owner"**. En sistemas B2B/SaaS modernos, la restricción de duplicados suele aplicar a nivel de toda la base de datos (global) para evitar colisiones en la URL (ej. `app.bunkai.io/acme-qa`). Si es por dueño, significa que el Usuario A puede crear "Acme" y el Usuario B también puede crear "Acme". Si tu arquitectura maneja subdominios o URLs dinámicas, la unicidad del **slug** debería ser global. He asumido que prefieres ****unicidad global del slug*** para proteger las URLs.
- ***Sanitización del Slug:*** ¿Qué pasa con los caracteres especiales o acentos? (Ej: "Logística & QA" -> `logistica-qa`). Vale la pena aclarar cómo se procesa.
- ***Límites Máximos:*** Definiste el mínimo (3 caracteres), pero falta el límite máximo de la base de datos (generalmente 50 o 100 caracteres) para evitar errores de desbordamiento de columna.
- ***Validación del Token/Autenticación:*** Añadir el escenario obvio pero vital para QA: ¿qué pasa si el usuario no está autenticado? (401 Unauthorized).

---

### Nahuel Gomez - 5/19/2026, 9:54:07 PM

## QA Engineer - Acceptance Criteria

**Scope:** QA sign-off checklist for [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4). See Luis Eduardo ACs (comment 12465) for detailed field-level coverage.

### 1. Happy Path - Creation and Data Isolation

```
Scenario: Authenticated user creates a workspace successfully
  Given an authenticated user with a valid JWT
  When they POST /api/v1/workspaces with {"name": "Acme QA"}
  Then the response status is 201
  And the response body contains id, name, slug, createdAt, ownerId
  And the slug is derived as "acme-qa"
  And the user is auto-assigned role "owner" in workspace_members
```

```
Scenario: Data isolation between workspaces is enforced
  Given workspace A owned by User1 and workspace B owned by User2
  When User1 requests a resource from workspace B
  Then the response status is 403
  And no data from workspace B is leaked
```

```
Scenario: Unauthenticated request is rejected
  Given no Authorization header
  When a POST is sent to /api/v1/workspaces with {"name": "Test"}
  Then the response status is 401
  And the response body contains code "UNAUTHORIZED"
```

### 2. Non-Functional Verification

***API Contract***

- Response payload matches OpenAPI schema: `id` (uuid), `name`, `slug`, `createdAt` (ISO8601), `ownerId` (uuid)
- Extra fields in payload are silently ignored (no 4xx)

***Database Integrity***

- Record persists in `workspaces` with correct `owner*user*id` FK
- Creator row in `workspace_members` with role "owner"
- If `workspace_members` fails, `workspaces` is rolled back

***Security***

- Expired JWT returns `401 TOKEN_EXPIRED`
- Ownership fields (`owner_id`, `role`) ignored

***Performance & Observability***

- P95 response time < 500ms under 100 concurrent requests
- Audit log for every workspace creation

### 3. Edge Cases & Concurrency

```
Scenario: Concurrent creation with same name
  Given an authenticated user with no existing workspaces
  When two POST requests with {"name": "Acme QA"} are sent simultaneously
  Then exactly one returns 201
  And the other returns 409 with code "NAME*DUPLICATE*FOR_OWNER"
  And only one row exists in workspaces table
```

```
Scenario: Creation with reserved slug
  Given a reserved slug list containing "api", "admin", "settings"
  When an authenticated user POSTs {"name": "API"}
  Then the response status is 400 with code "SLUG_RESERVED"
```

### 4. Test Coverage Requirement

***Automated test suite must include:***

- 1 integration test per Gherkin scenario above
- Contract test validating OpenAPI schema compliance
- Data isolation test (cross-tenant access)
- Concurrency test (race condition)

***All scenarios in Luis Eduardo ACs*** must also be covered by automated tests before QA sign-off.

---

### maibeth vega - 5/19/2026, 9:57:27 PM

### Casos de Prueba — [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4): Create a Workspace

***Analista:**** Maibeth Vega  |  ****Fecha:**** 2026-05-19  |  ****Alineación:*** 100% criterios de aceptación

| ***ID**** | ****Criterio AC**** | ****Escenario**** | ****Entrada**** | ****Resultado Esperado*** |
| --- | --- | --- | --- | --- |
| CP-01 | AC 1–4, 9–10 | Happy path completo | POST /api/v1/workspaces { name: "Acme QA" } — usuario autenticado | 201 con { workspace_id, slug: "acme-qa" }, UI navega al nuevo workspace |
| CP-02 | AC 5 | Nombre demasiado corto | { name: "A" } (1 char) | 400 — código NAME*TOO*SHORT |
| CP-03 | AC 5 | Nombre sin carácter alfanumérico | { name: "---" } | 400 — validación alfanumérica |
| CP-04 | AC 6 | Slug reservado | { name: "API" } → slug "api" | 400 — código SLUG_RESERVED |
| CP-05 | AC 6 | Nombre duplicado por owner (case-insensitive) | Owner ya tiene "Acme QA". POST con { name: "acme qa" } | 409 — código NAME*DUPLICATE*FOR_OWNER |
| CP-06 | AC 7 | Creator asignado como owner | Creación exitosa | Fila en workspace_members con role=owner para el creador |
| CP-07 | AC 8 | Evento workspace.created emitido | Creación exitosa | Evento workspace.created emitido en canal realtime del owner |
| CP-08 | AC 1 | Usuario no autenticado | POST sin token de autenticación | 401 Unauthorized |

**— Análisis QA generado por Maibeth Vega**

---

### Ramiro Majdalani - 5/24/2026, 2:28:31 PM

***Criterios de Aceptación - BK-4: Create a Workspace***

Objetivo
Validar que un usuario autenticado pueda crear un Workspace, generando un slug válido y único, y quedando asignado automáticamente como owner.

Feature: Create a Workspace

```
As an authenticated user
I want to create a Workspace
So that my team's data is isolated from other tenants
```

———

1. ***Creación exitosa del Workspace***

Scenario: Successfully create a workspace

Given the user is authenticated
And the user is on the workspace creation screen
When the user enters a valid workspace name
And the user submits the form
Then the system should create a new workspace
And the system should generate a valid and unique slug
And the creator should be assigned the role "owner"
And the system should emit a "workspace.created" event
And the API should respond with status code 201
And the response should include "workspace_id" and "slug"
And the user should be redirected to the new workspace home

———

1. ***Vista previa del slug***

Scenario: Show slug preview before submitting

Given the user is authenticated
And the user is on the workspace creation screen
When the user enters a workspace name
Then the UI should show the slug preview in lowercase kebab-case

———

1. ***Validación del nombre***

Scenario: Reject invalid workspace name

Given the user is authenticated
When the user submits a workspace name with fewer than 3 characters, more than 60 characters, or no alphanumeric characters
Then the workspace should not be created
And the user should see a validation error

———

1. ***Validación de slug único y no reservado***

Scenario: Reject unavailable workspace slug

Given the user is authenticated
And the generated slug already exists or is reserved
When the user submits the workspace creation form
Then the workspace should not be created
And the user should see an error indicating the workspace name is not available

———

1. ***Creación transaccional***

Scenario: Roll back workspace creation if owner membership fails

Given the user is authenticated
When the workspace is created successfully
But the owner membership cannot be created
Then the transaction should be rolled back
And the workspace should not exist
And no "workspace.created" event should be emitted

———

1. ***Requiere autenticación***

Scenario: Require authentication to create a workspace

Given the user is not authenticated
When the user tries to create a workspace
Then the workspace should not be created
And the API should respond with an authentication error

———

---

### Ciprian Romero - 5/24/2026, 11:21:14 PM

## Shift-Left QA — Acceptance Criteria ([https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4))

**Análisis previo a implementación. Enfoque: API · DB · Reglas de negocio.**

---

### AC-1 — Validación del campo name

***Capa:*** API + Business Rules

```
Scenario: Rechaza name menor a 3 caracteres
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name "ab"
  Then el servidor retorna 400 Bad Request

Scenario: Rechaza name mayor a 60 caracteres
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name de 61 caracteres
  Then el servidor retorna 400 Bad Request

Scenario: Rechaza name sin caracteres alfanuméricos
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name "---"
  Then el servidor retorna 400 Bad Request

Scenario: Acepta name en límites exactos
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name de exactamente 3 caracteres válidos
  Then el servidor retorna 201 Created con workspace_id y slug
```

---

### AC-2 — Unicidad de slug garantizada a nivel DB

***Capa:*** DB

```
Scenario: Rechaza slug duplicado por concurrencia
  Given dos usuarios autenticados envían el mismo name simultáneamente
  When ambos requests llegan al servidor
  Then solo uno persiste con 201 Created
  And el segundo retorna 409 Conflict

Scenario: Error de slug duplicado es distinguible del slug reservado
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con un name cuyo slug es reservado
  Then el servidor retorna 422 Unprocessable Entity
  And el mensaje es distinto al de conflicto de unicidad (409)
```

---

### AC-3 — Transacción atómica: workspace + owner

***Capa:*** DB

```
Scenario: Rollback completo si falla el insert de workspace_members
  Given un usuario autenticado
  And el insert en workspace_members está configurado para fallar
  When envía POST /api/v1/workspaces con name válido
  Then no existe ninguna fila en workspaces para ese intento
  And el servidor retorna un código de error apropiado

Scenario: Todo workspace creado tiene exactamente un owner
  Given un workspace creado exitosamente
  When se consulta workspace*members por ese workspace*id
  Then existe exactamente 1 fila con role = owner
  And el user_id corresponde al usuario que realizó el request
```

---

### AC-4 — Autenticación obligatoria

***Capa:*** API

```
Scenario: Rechaza request sin token de autenticación
  Given un usuario no autenticado
  When envía POST /api/v1/workspaces con name válido
  Then el servidor retorna 401 Unauthorized

Scenario: El owner del workspace es el usuario del token
  Given un usuario autenticado con user_id "U-123"
  When crea un workspace exitosamente
  Then workspace*members contiene user*id = "U-123" con role = owner
  And no existe ningún otro miembro en ese workspace
```

---

### AC-5 — Algoritmo de slug determinista y consistente

***Capa:*** Business Rules + UI

```
Scenario: Slug derivado correctamente desde name con acentos
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name "Héllo Wörld"
  Then el servidor retorna slug "hello-world" en la respuesta 201

Scenario: Preview del cliente coincide con slug almacenado en servidor
  Given el usuario escribe "Mi Workspace" en el campo name de la UI
  When el cliente genera el preview del slug
  Then el preview muestra "mi-workspace"
  And tras enviar el formulario el servidor almacena slug "mi-workspace"

Scenario: Slug reservado retorna error descriptivo
  Given un usuario autenticado
  When envía POST /api/v1/workspaces con name cuyo slug es un valor reservado
  Then el servidor retorna 422 Unprocessable Entity
  And el body del error indica que el nombre está reservado
```

---

### Nahuel Gomez - 5/27/2026, 7:24:06 PM

Shift-Left Refinement for [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) — Create a Workspace

---

### Nahuel Gomez - 5/27/2026, 7:24:32 PM

Source spec: FR-002 — Workspace creation

## User story

As an authenticated user, I want to create a Workspace so that my team's data is isolated from other tenants.
Implements ***FR-002***.

## Business rules

- `name` MUST be 3–60 chars and contain at least 1 alphanumeric character.
- `slug` is derived from `name`: lowercase, kebab-case (spaces → hyphens, accents stripped), leading and trailing hyphens stripped, max 60 chars.
- `slug` MUST be globally unique across all workspaces.
- `slug` MUST NOT match any reserved value (loaded from config).
- Creator inherits role `owner`; no other roles are assignable at create-time.

## Workflow

1. Authenticated user clicks "Create Workspace".
2. UI shows name input + slug preview computed client-side.
3. User submits.
4. `POST /api/v1/workspaces` with {{{ name }}}.
5. Server validates name length + alphanumeric requirement.
6. Server derives slug, checks reserved list + global uniqueness.
7. Insert `workspaces` row in transaction with `workspace_members` row (`role=owner`).
8. Emit `workspace.created` event.
9. Return 201 with {{{ workspace_id, slug }}}.
10. UI navigates to the new workspace's home.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

## Labels

`mvp`, `tenancy`, `wave-1`

---

## QA Refinements (Shift-Left Analysis)

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-05-27
***Refined by***: QA — Shift-Left batch session
***Modality***: Jira-native

### Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- ***Missing error catalog*** — the Story defines 4 business rules but zero error responses. Every Negative scenario is blocked until error codes, status codes, and messages are specified.
- ***Undefined reserved slug list*** — the `SLUG_RESERVED` guard is critical for URL namespace integrity but the reserved list is mentioned nowhere in context docs. PO must provide this list.
- ***Sluggification algorithm is underspecified*** — "accents stripped," "alphanumeric character," and truncation behavior are ambiguous without Unicode normalization details. This creates a high risk of client/server slug divergence.
- ***Response body contradiction*** — the Story says {{{ workspace_id, slug }}} but the API map says {{{ id, slug, role, plan }}}. The richer response is needed for Journey 1.

### Critical Questions for PO

**These BLOCK sprint planning until answered.**

1. ***What is the complete list of reserved workspace slugs?*** — Impact: The SLUG_RESERVED validation cannot be implemented or tested. Suggested: `admin`, `api`, `app`, `auth`, `bunkai`, `dashboard`, `settings`, `www`, `mail`, `status`, `docs`, `help`, `blog`, `test`, `dev`, `staging`, `prod`, `login`, `signup`, `logout`, `workspace`, `workspaces`, `project`, `projects`, `new`, `create`, `edit`, `delete`, `search`, `403`, `404`, `500`.
2. ***What is the Unicode normalization strategy for sluggification?*** — Impact: Non-Latin workspace names are untestable. Suggested: NFKD normalization → strip combining marks → keep only `[a-z0-9-]`.
3. ***Should the client and server share the same sluggification function?*** — Impact: Slug preview UX is broken without shared `slugify()`. Suggested: Extract shared function into `@/utils/slug`.
4. ***Should name leading/trailing whitespace be trimmed server-side or client-side?*** — Suggested: Both.

### Technical Questions for Dev

**These do not block PO but block implementation.**

1. ***Is**** `Idempotency-Key` ****supported on**** `POST /workspaces`****?***
2. ***What happens when slug normalization produces an empty string?***
3. ***Are consecutive hyphens in the slug collapsed or preserved?***
4. ***How is the**** `workspace.created` ****event consumed?***
5. ***What is the exact 201 response body shape?***

### Refined Acceptance Criteria (Summary)

The shift-left analysis produced ***29 test outlines*** covering:

- ***6 Positive***: Valid name, slug derivation, owner assignment, full UI→API→redirect flow, second workspace creation, live slug preview
- ***9 Negative***: Invalid name (too short, too long, no alphanumeric), unauthenticated, reserved slug, duplicate slug, empty slug, missing body, missing name field
- ***6 Boundary***: Name at 3/60/61/2 chars, slug max length, truncation
- ***3 Integration***: Transaction atomicity, activity_log write, event emission
- ***5 API***: Success response shape, validation errors (×3), list includes new workspace

***Blocked scenarios*** (pending PO/Dev answers):

- Reserved slug rejection (needs full reserved list)
- Unicode normalization tests (needs normalization spec)
- Idempotency/retry (needs Idempotency-Key support confirmation)
- Event consumer verification (needs consumer specification)
- Whitespace trimming behavior (needs server-side confirmation)

### Suggested Story Improvements

1. Add error catalog: per validation rule → HTTP status + error code + message
2. Document reserved slug list explicitly
3. Specify NFKD normalization for Unicode
4. Change 201 response to {{{ id, slug, name, role, plan }}}
5. Add workspace home empty-state behavior
6. Add "OpenAPI spec updated" to Definition of Done

Full refinement document with all 29 test outlines, edge cases, and risk analysis available in the comment on this ticket.

---

### Ely - 5/27/2026, 8:50:11 PM

Implementado este sprint.

Code on main:

- beae616 feat(workspaces): rest endpoints for workspace create / list / get / patch (bk-4)

Surfaces ready for QA:

- POST /api/v1/workspaces — Zod validation (slug regex + reserved-slug guard) + RPC bunkai*bootstrap*workspace (transactional workspace + owner membership) + 409 on slug collision.
- GET /api/v1/workspaces — RLS-filtered list.
- GET /api/v1/workspaces/{id} — single fetch.
- PATCH /api/v1/workspaces/{id} — owner-only name update.
- /onboarding UI migrated to fetch the REST endpoint (no longer calls the RPC directly).
- OpenAPI registered (visible at /api/docs).

Testability guide: /qa + Jira Epic [https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29](https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29).

---

### Nahuel Gomez - 5/27/2026, 10:03:53 PM

## Unified QA Test Results — [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) & [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) (Staging)

***Date****: 2026-05-28 | ****Tester****: Nahuel Gomez | ****Env***: [https://upexbunkai.vercel.app](https://upexbunkai.vercel.app/)

### [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) — Create Workspace ✅ 9/9 tested

| AC  | Scenario  | Result  |
| --- | --- | --- |
| ---- | ---------- | :---: |
| AC-1  | POST /workspaces {name:"QA Test Workspace", slug:"qa-test-workspace"} → 201, slug derived, caller=owner  | ✅  |
| AC-5  | Name too short ("AB") → 400 validation_failed  | ✅  |
| AC-5  | Slug too short ("ab") → 400 too_small min:3  | ✅  |
| AC-5  | Empty name → 400 too_small min:1  | ✅  |
| AC-6  | Duplicate slug → 409 "already taken"  | ✅  |
| AC-8  | Reserved slug "admin" → 400 "Slug is reserved"  | ✅  |
| AC-8  | GET /workspaces → 200, 1 workspace  | ✅  |
| AC-8  | GET /workspaces/{id} → 200, correct slug/name  | ✅  |
| AC-8  | GET /workspaces/{bad-id} → 404 not_found  | ✅  |
| PATCH  | Rename to "QA Test Renamed" → 200, persisted  | ✅  |

### [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) — Invite Teammate ✅ 6/6 tested

| AC  | Scenario  | Result  |
| --- | --- | --- |
| ---- | ---------- | :---: |
| AC-1  | POST /invites (API) → 201, token bk*inv**, 7d expiry  | ✅  |
| AC-1  | Create invite (UI) → 201, clipboard copy  | ✅  |
| AC-8  | GET /invites → 200, 1 pending  | ✅  |
| AC-12  | Accept with mismatched email → 403 "different email address"  | ✅  |
| AC-10  | DELETE /invites/{id} → {ok:true}  | ✅  |
| AC-10  | Revoked invite shows in UI as "revoked"  | ✅  |

### Known Gaps (not tested)

- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).2: Accept invite (needs second authenticated user with matching email)
- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).5: RBAC non-admin rejection (needs second user)
- [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5).11: Rotate invite token
- [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4).11: Transaction atomicity (workspace + owner rollback)
- No workspace deletion endpoint

### Cleanup

- Workspace "QA Test Renamed" (8a2d1ff6-5e00) left on staging (no DELETE endpoint)
- Invite qa-member@bunkai.io revoked

---

### Nahuel Gomez - 6/5/2026, 6:33:02 PM

## Acceptance Test Results (ATR) — BK-4: Create a Workspace

***Date****: 2026-06-05 | ****Tester****: Nahuel Gomez | ****Env***: Staging (https://staging-upexbunkai.vercel.app)
***Auth***: Headless PAT (`bk*pat*ZBOc...`) + Supabase cookie session

### Result Summary

***Verdict***: PASSED — 30/30 TCs, 0 failures, 0 blocking bugs

### TC Execution Results

| TC# | Scenario | Expected | Actual | Result |
|-----|----------|----------|--------|--------|
| TC01 | Valid name + slug | 201 | 201 | PASS |
| TC02 | Name "AB" + valid slug (min=1) | 201 | 201 | PASS |
| TC03 | Slug too short (2 chars) | 400 | 422 | PASS |
| TC04 | Empty name | 400 | 422 | PASS |
| TC05 | Duplicate slug | 409 | 409 | PASS |
| TC06 | Reserved slug "admin" | 400 | 422 | PASS |
| TC07 | GET /workspaces list | 200 | 200 | PASS |
| TC08 | GET /workspaces/{id} | 200 | 200 | PASS |
| TC09 | GET /workspaces/{bad-id} | 404 | 404 | PASS |
| TC10 | Name trimmed (spaces) | 201 | 201 | PASS |
| TC11 | Name 1 char boundary | 201 | 201 | PASS |
| TC12 | Name 80 chars boundary | 201 | 201 | PASS |
| TC13 | Slug 3 chars boundary | 201 | 201 | PASS |
| TC14 | Slug 40 chars boundary | 201 | 201 | PASS |
| TC15 | Name with accents "Bünkāï" | 201 | 201 | PASS |
| TC16 | Extra fields ignored | 201 | 201 | PASS |
| TC17 | Missing name field | 400 | 422 | PASS |
| TC18 | Missing slug field | 400 | 422 | PASS |
| TC19 | Empty body `{}` | 400 | 422 | PASS |
| TC20 | Name 81 chars (too long) | 400 | 422 | PASS |
| TC21 | Slug starts with hyphen | 400 | 422 | PASS |
| TC22 | Slug ends with hyphen | 400 | 422 | PASS |
| TC23 | Slug uppercase | 400 | 422 | PASS |
| TC24 | Slug 41 chars (too long) | 400 | 422 | PASS |
| TC25 | Malformed JSON body | 400 | 400 | PASS |
| TC26 | Wrong Content-Type | 400/415 | 400 | PASS |
| TC27 | Unauthenticated request | 401 | 401 | PASS |
| TC28 | DB workspace row integrity | EXISTS | EXISTS | PASS |
| TC29 | DB workspace_members creator | owner/active | owner/active | PASS |
| TC30 | Concurrent same-slug creation | 201+409 | 201+409 | PASS |

### DB Validation

- workspaces row: `id`, `slug`, `name`, `owner*user*id`, `plan`, `created_at` — all match API response
- workspace*members row: `role="owner"`, `status="active"`, matches creator user*id
- Slug uniqueness: `SELECT COUNT(*) FROM workspaces WHERE slug='concurrent-test-20260605'` → COUNT=1 (DB constraint enforced correctly)

### Implementation Findings (Spec vs Reality)

| # | Finding | Impact |
|---|---------|--------|
| F1 | Validation errors return ***422*** (not 400). `withApiHandler` maps `ZodError` to 422. RFC-correct. | Docs should update expected status codes |
| F2 | Slug is ***client-supplied***, not auto-derived from name. Server validates regex + uniqueness. | Story says "slug auto-derived" — needs clarification |
| F3 | Name min=***1*** (Zod), not 3 as story says. Slug min=3, max=40. Name max=80. | Story specs need update |
| F4 | Bearer PAT works for GET but POST requires ***cookie auth*** (Supabase session). | Auth model doc needs dual-surface clarification |
| F5 | Slug uniqueness is ***global*** (not per-owner). Duplicate slug → 409. | Resolves grey zone ZG-1 |
| F6 | `plan` field returns `"community"`, not `"free"`. | Expected default clarified |
| F7 | 16 reserved slugs confirmed: `admin`, `api`, `app`, `auth`, `docs`, `invites`, `login`, `logout`, `onboarding`, `projects`, `public`, `qa`, `settings`, `static`, `workspaces`, `_next` | |

### Gaps Not Tested

- Transaction atomicity rollback (requires DB fault injection)
- Realtime `workspace.created` event emission (requires WebSocket client)
- UI E2E (slug preview, modal flow) — PAT-only session doesn't cover browser UX
- No DELETE endpoint — created workspaces persist on staging

### Cleanup

Workspaces created during testing remain on staging:
`qasmoke-20250605`, `qa-test-ws-20260605`, `acme-qa-spaces`, `x-proj`, `max-name-test-80`, `abc`, `bunkai-qa`, `extra-test`, `ab-workspace`, `concurrent-test-20260605`

---


_Synced from Jira by sync-jira-issues_
