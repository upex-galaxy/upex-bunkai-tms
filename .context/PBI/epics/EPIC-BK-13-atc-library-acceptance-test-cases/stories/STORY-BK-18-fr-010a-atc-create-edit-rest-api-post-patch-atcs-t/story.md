# TMS-ATC API | Create and edit ATCs with steps and assertions

**Jira Key:** [BK-18](https://jira.upexgalaxy.com/browse/BK-18)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## Overview

**Source spec:** FR-010a

## User Story

Como ingeniero de automatización o consumidor de la API, quiero una REST API para crear y editar ATCs (Acceptance Test Cases) con sus steps y assertions en una sola llamada transaccional, para que pueda componer bloques de prueba reutilizables desde herramientas de CLI, scripts y el cliente de UI.

## Context

Ancla PRD US 4.1 y US 4.2 e implementa SRS FR-010 (superficie de servidor). El formulario de UI (Story FR-010b, [BK-19](https://jira.upexgalaxy.com/browse/BK-19)) y la composición de Test posterior (EPIC-BK-5) dependen ambos de este contrato.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-05-27

> El ATP DRAFT completo vive en el custom field 🧪 Acceptance Test Plan (ATP) y está reflejado como comentario en este issue. Esta sección captura los slices que el PO y el Dev necesitan antes de la estimación.

### 🔍 Refined Acceptance Criteria — resumen

Se produjeron 13 Gherkin scenarios (Happy 2 / Negative 7 / Boundary 2 / Integration 2). Decisiones clave de contrato:

1. **Slug format**: `{module-slug}/atc-{id-first-8-chars}` (prefijo de UUID en minúsculas) — determinista, sin dependencia de secuencia.
2. **Semántica de PATCH**: cuerpo de reemplazo total (estilo PUT), NO merge parcial. Lo omitido = se limpia.
3. **Version conflict**: optimistic locking vía header `If-Match: <version>`. 409 si hay mismatch.
4. **Error codes**: agregar `ac*outside*user*story`, `module*outside*project*subtree`, `steps*position*invalid` al mapa `API*ERROR*CODES`.
5. **Auth**: `requireBearerToken` + `requireScope('atc:write')` en ambos endpoints.
6. RPC `bunkai*create*atc`: nuevo RPC que devuelve uuid (separado de `bunkai*save*atc`, que es solo UPDATE).
7. **affected*********test*********ids**: array vacío en el MVP (la tabla `test_steps` todavía no existe).
8. **user*********story*********id en PATCH**: inmutable — se ignora silenciosamente si se provee.

### ⚠️ Edge Cases Identified

14 edge cases: 6 Alta, 5 Media, 3 Baja. Las de mayor severidad:

- POST con PAT inválido (401), scope insuficiente (403), PATCH a un id inexistente (404)
- Version conflict en PATCH concurrente (409), slug collision (409)
- POST con module fuera del subtree del project

### ❓ Open Questions — con decisiones de Senior PO/DEV

1. **Manejo de slug collision**: devolver 409 — el cliente debe reintentar con distinto module/title. (Senior PO)
2. **Consumidores de event en el MVP**: registrar en la tabla event_log — BK-20/21 consumen después. (Senior PO)
3. **Naming de scope**: un único `atc:write` cubre tanto POST como PATCH. (Senior PO)
4. **Firma de bunkai*********create*********atc**: devuelve uuid, recibe `p*project*id`. El slug se computa en PL/pgSQL. (Senior DEV)
5. **Registro de error codes**: agregar al mapa `API*ERROR*CODES` (no inline). (Senior DEV)
6. **affected*********test*********ids**: array vacío `[]` — la tabla test_steps todavía no está migrada. (Senior DEV)
7. **PATCH con body vacío**: aceptar como no-op → 200, sin incremento de version, sin event. (Senior DEV)

### 📐 Scope — IN vs OUT

**IN**: endpoints POST/PATCH, RPC bunkai*create*atc, validación cross-entity, computación de slug, incremento de version, auth+scope, optimistic locking, emisión de event, nuevos error codes, OpenAPI spec, integration tests.
**OUT**: GET (BK-20), DELETE (futuro), formulario de UI (BK-19), expansión de used*in (BK-20), idempotency (futuro), webhooks (futuro), scopes granulares (futuro), affected*test_ids con datos reales (EPIC-BK-5).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Tests (12)

- [BK-149](https://jira.upexgalaxy.com/browse/BK-149): BK-18: TC01: should create an ATC and return 201 with steps, assertions, slug and version 1 when POST /atcs receives a valid payload _(Candidate)_
- [BK-150](https://jira.upexgalaxy.com/browse/BK-150): BK-18: TC02: should reject POST /atcs with 401 when auth is missing/invalid and 403 when the token lacks atc:write scope _(Candidate)_
- [BK-151](https://jira.upexgalaxy.com/browse/BK-151): BK-18: TC03: should reject POST /atcs with 422 ac_outside_user_story when an acceptance criterion belongs to a different user story _(Candidate)_
- [BK-152](https://jira.upexgalaxy.com/browse/BK-152): BK-18: TC04: should reject POST /atcs with 422 module_outside_project_subtree when the module is outside the user story subtree _(Candidate)_
- [BK-153](https://jira.upexgalaxy.com/browse/BK-153): BK-18: TC05: should reject POST /atcs with 422 steps_position_invalid when step positions are not strictly increasing from 1 _(Candidate)_
- [BK-154](https://jira.upexgalaxy.com/browse/BK-154): BK-18: TC06: should enforce POST /atcs body boundaries for title length, step count, tag count and layer enum _(Candidate)_
- [BK-155](https://jira.upexgalaxy.com/browse/BK-155): BK-18: TC07: should write zero rows across atcs/atc_steps/atc_assertions when POST /atcs fails a cross-entity check given a transactional rollback _(Candidate)_
- [BK-156](https://jira.upexgalaxy.com/browse/BK-156): BK-18: TC08: should return 200, bump version and cascade-replace children when PATCH /atcs/{id} full-replaces with X-If-Match (BK-96 regression) _(Candidate)_
- [BK-157](https://jira.upexgalaxy.com/browse/BK-157): BK-18: TC09: should honor optimistic locking on PATCH /atcs/{id} (200 matching X-If-Match / 409 stale / 200 absent) _(Candidate)_
- [BK-158](https://jira.upexgalaxy.com/browse/BK-158): BK-18: TC10: should return 404 not_found when PATCH /atcs/{id} targets a non-existent ATC id _(Candidate)_
- [BK-159](https://jira.upexgalaxy.com/browse/BK-159): BK-18: TC11: should treat PATCH /atcs/{id} with an empty body as a 200 no-op without version bump or event _(Candidate)_
- [BK-160](https://jira.upexgalaxy.com/browse/BK-160): BK-18: TC12: should keep slug, user_story_id and module_id immutable when PATCH /atcs/{id} attempts to change them _(Candidate)_

### Test Execution (1)

- [BK-95](https://jira.upexgalaxy.com/browse/BK-95): [ATR] BK-18 — ATC create/edit REST API _(Close)_

### Bug (1)

- [BK-96](https://jira.upexgalaxy.com/browse/BK-96): ATC Library: ATC PATCH API: Happy-path PATCH /atcs/{id} returns 412 instead of 200 though the edit commits _(Closed)_

### Storys (7)

- [BK-15](https://jira.upexgalaxy.com/browse/BK-15): TMS-AC | Manage criteria under a user story _(Ready For Release)_
- [BK-19](https://jira.upexgalaxy.com/browse/BK-19): TMS-ATC Builder | Build an ATC with ordered steps and assertions _(Ready For Release)_
- [BK-20](https://jira.upexgalaxy.com/browse/BK-20): TMS-ATC Search | Search and autocomplete ATCs _(BLOCKED)_
- [BK-23](https://jira.upexgalaxy.com/browse/BK-23): TMS-ATC Duplicate | Duplicate an ATC with steps and assertions _(BLOCKED)_
- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Release)_
- [BK-21](https://jira.upexgalaxy.com/browse/BK-21): TMS-ATC Propagation | Cascade ATC edits to all tests _(QA Approved)_
- [BK-22](https://jira.upexgalaxy.com/browse/BK-22): TMS-ATC Usage | See a "Used in N tests" report _(QA Approved)_

### Test Plan (1)

- [BK-94](https://jira.upexgalaxy.com/browse/BK-94): [ATP] BK-18 — ATC create/edit REST API _(READY)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** api, atc, backend, mvp, shift-left-2026-05-27, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
