Actúa como Scrum Master y Product Owner.

**Input:**

- PRD: [usar .context/PRD/mvp-scope.md]
- SRS: [usar .context/SRS/functional-specs.md]
- **PROJECT_KEY:** Se solicitará al usuario en PASO 0 (ej: MYM, SHOP, BLOG, UPEX)

---

## 📋 CUSTOM FIELDS SCHEMA - USER STORIES (UPEX Workspace)

### Campos Disponibles en Jira

| Field ID            | Nombre                          | Tipo     | Requerido | Uso                                        |
| ------------------- | ------------------------------- | -------- | --------- | ------------------------------------------ |
| `customfield_10201` | ✅ Acceptance Criteria (Gherkin) | Textarea | ✅ Sí      | Criterios de aceptación en formato Gherkin |
| `customfield_10202` | 🚩BUSINESS RULES SPEC            | Textarea | Opcional  | Reglas de negocio específicas              |
| `customfield_10401` | ⛳SCOPE                          | Textarea | ✅ Sí      | Alcance de la historia (In/Out scope)      |
| `customfield_10400` | 🎴MOCKUP                         | Textarea | Opcional  | Referencias a mockups/wireframes (URLs)    |
| `customfield_10500` | 🧬WORKFLOW                       | Textarea | Opcional  | Descripción del flujo de trabajo           |
| `customfield_10028` | Story Points🎲                   | Number   | ✅ Sí      | Estimación en Fibonacci (1,2,3,5,8,13)     |
| `customfield_11600` | 🌍️ WEBLINK                       | URL      | ⚠️ Cond.   | URL de la app/feature (ver nota abajo)     |

### Nota sobre WEBLINK (customfield_11600)

**IMPORTANTE:** Este campo es OPCIONAL y solo debe llenarse si:

- La IA conoce PERFECTAMENTE el dominio de la aplicación bajo prueba
- El dominio está definido en el system prompt o contexto del proyecto
- El usuario ha proporcionado explícitamente la URL

**Si hay duda sobre la URL correcta:** NO llenar el campo. Es preferible dejarlo vacío que poner una URL incorrecta.

### Estrategia de Fallback (Workspaces Non-UPEX)

Si el MCP de Jira indica que los custom fields no existen:

1. **Buscar equivalente:** Usar `jira_search_fields` para buscar campos similares por nombre
2. **Preguntar al usuario:** Si no se encuentra, solicitar el Field ID correcto
3. **Fallback a Description:** Incluir la información en el campo Description con formato claro:

   ```
   ## Acceptance Criteria (Gherkin)
   [contenido]

   ## Scope
   [contenido]

   ## Story Points: X
   ```

---

## 🎯 FLUJO DE TRABAJO: JIRA-FIRST → LOCAL

**IMPORTANTE:** Este prompt trabaja de forma incremental para optimizar tokens y mantener contexto definido.

### Flujo por Épica

1. **Crear épica en Jira** (MCP) → obtener ID real
2. **Crear carpeta local** con ID real de Jira
3. **Crear archivo epic.md** local
4. **Crear todas las stories de esa épica en Jira** (MCP) → obtener IDs reales
5. **Crear carpetas locales de stories** con IDs reales
6. **Crear archivos story.md** locales
7. **Repetir para siguiente épica**

---

## 📝 NOMENCLATURA DE CARPETAS

### Entendiendo los Componentes de la Nomenclatura

**IMPORTANTE:** La nomenclatura tiene 4 partes con diferentes orígenes:

#### 1. **Fijo (del template):**

- `EPIC-` o `STORY-` - Prefijo que indica el tipo de issue
- **No cambia nunca, es parte del sistema**

#### 2. **Variable del proyecto (usuario define):**

- `{PROJECT_KEY}` - Código del proyecto en Jira
  - Ejemplos: `MYM`, `SHOP`, `BLOG`, `UPEX`, etc.
  - Lo define el usuario al crear el proyecto en Jira
  - **Debe preguntarse al usuario en PASO 0**
  - Características: MAYÚSCULAS, 2-5 caracteres, sin espacios

#### 3. **Autogenerado por Jira (NO controlable):**

- `{ISSUE_NUM}` - Número secuencial que Jira asigna automáticamente
  - Ejemplos: `1`, `2`, `13`, `45`, etc.
  - **NO lo controla la IA ni el usuario**
  - Se obtiene DESPUÉS de crear el issue en Jira mediante MCP
  - Siempre es secuencial y sin ceros a la izquierda

#### 4. **Definido por análisis del dominio:**

- `{nombre-descriptivo}` - 2-4 palabras en kebab-case
  - Se infiere analizando el PRD/SRS del proyecto actual
  - Usa el vocabulario específico del dominio de negocio
  - Formato: minúsculas, kebab-case

---

### Reglas para Épicas

**Formato:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ejemplos con diferentes proyectos:**

Proyecto "MYM" (Jira asignó issues #2 y #13):

- ✅ `EPIC-MYM-2-user-authentication-profiles/`
- ✅ `EPIC-MYM-13-entity-discovery-search/`

Proyecto "SHOP" (Jira asignó issue #45):

- ✅ `EPIC-SHOP-45-payment-processing/`

Proyecto "BLOG" (Jira asignó issue #1):

- ✅ `EPIC-BLOG-1-content-management-system/`

**Ejemplos INVÁLIDOS:**

- ❌ `EPIC-001-user-auth/` (falta PROJECT_KEY)
- ❌ `EPIC_MYM_2_UserAuth/` (formato incorrecto, debe usar guiones)
- ❌ `EPIC-MYM-002-auth/` (NO usar ceros a la izquierda, Jira nunca los genera)
- ❌ `EPIC-MYM-2-user-authentication-and-comprehensive-profile-management-system/` (nombre muy largo)

---

### Reglas para Stories

**Formato:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

(Mismas reglas que épicas)

**Ejemplos con diferentes proyectos:**

Proyecto "MYM" (Jira asignó issues #3 y #14):

- ✅ `STORY-MYM-3-user-signup-email/`
- ✅ `STORY-MYM-14-view-all-entities/`

Proyecto "SHOP" (Jira asignó issue #46):

- ✅ `STORY-SHOP-46-add-to-cart-flow/`

Proyecto "BLOG" (Jira asignó issue #2):

- ✅ `STORY-BLOG-2-create-blog-post/`

---

## **PASO 0: Obtener Project Key de Jira**

**CRÍTICO:** Este paso debe ejecutarse PRIMERO, antes de crear cualquier carpeta o archivo.

### Objetivo

Obtener el **Project Key** (código del proyecto en Jira) que se usará en toda la nomenclatura de carpetas.

### Acción

**Preguntar al usuario:**

```
🔑 ¿Cuál es el código/key de tu proyecto en Jira?

Ejemplos válidos: MYM, SHOP, BLOG, UPEX, TASK, etc.

Características:
- 2-5 caracteres
- MAYÚSCULAS
- Sin espacios ni caracteres especiales
- Es el prefijo que aparece en todos los issues de Jira (ej: MYM-1, MYM-2, etc.)

Por favor ingresa el PROJECT_KEY:
```

### Validación

Si el usuario proporciona un valor inválido:

- ❌ `mym` → Debe ser MAYÚSCULAS
- ❌ `MY-M` → No debe tener guiones ni espacios
- ❌ `MYPROJECT` → Muy largo (máximo 5 caracteres)

Pedir corrección hasta que sea válido.

### Output

**Guardar el PROJECT_KEY** para usar en:

- Nomenclatura de carpetas: `EPIC-{PROJECT_KEY}-{NUM}-{nombre}/`
- Consultas MCP a Jira
- Documentación generada

**Ejemplo:**

Si el usuario responde: `MYM`

Entonces TODAS las carpetas usarán:

- `EPIC-MYM-{NUM}-{nombre}/`
- `STORY-MYM-{NUM}-{nombre}/`

---

## **PASO 1: Crear epic-tree.md (Vista General)**

**Acción:** Genera árbol visual high-level de TODAS las épicas y stories del MVP.

**IMPORTANTE:** Este paso es SOLO para planificación. NO crea nada en Jira todavía.

**Formato del archivo:**

```markdown
# Product Backlog - Epic Tree

## Overview

Total Epics: [número]
Total User Stories: [número]
Project Code: {PROJECT_KEY obtenido en PASO 0}
Jira Project: [URL del proyecto en Jira]

---

## Epic Hierarchy

### EPIC 1: [Epic Title]

**Planned Jira Key:** {PROJECT_KEY}-TBD
**Priority:** CRITICAL | HIGH | MEDIUM | LOW
**Description:** [1-2 líneas]

**User Stories (estimado: X):**

1. {PROJECT_KEY}-TBD - As a [user], I want to [action] so that [benefit]
2. {PROJECT_KEY}-TBD - As a [user], I want to [action] so that [benefit]
   ...

---

### EPIC 2: [Epic Title]

...

---

## Epic Prioritization

### Phase 1: Foundation (Sprint 1-2)

1. Epic 1 - [Nombre]
2. Epic 2 - [Nombre]

### Phase 2: Core Features (Sprint 3-4)

...

---

## Next Steps

1. Run this prompt again, specifying EPIC 1 to create it incrementally
2. Continue with EPIC 2, EPIC 3, etc.
```

**Output esperado:** `.context/PBI/epic-tree.md`

---

## **PASO 2: Crear Épicas Incrementalmente**

**IMPORTANTE:** Este paso se ejecuta UNA VEZ POR ÉPICA. Repite el proceso para cada épica del epic-tree.

### **2.1 - Crear Épica en Jira (MCP)**

**Acción:** Usa las herramientas MCP de Atlassian disponibles para crear la épica en Jira.

**Datos necesarios para crear la épica:**

- **Proyecto:** {PROJECT_KEY obtenido en PASO 0}
- **Tipo de issue:** Epic
- **Título (Summary):** Nombre de la épica del PRD
- **Descripción:** Descripción detallada de la épica (2-3 párrafos)
- **Prioridad:** High | Medium | Low
- **Labels:** mvp, fase-1 (ajustar según corresponda)

**Instrucciones:**

1. Usa las herramientas MCP para crear un issue de tipo "Epic" en Jira
2. Completa todos los campos requeridos
3. **IMPORTANTE:** Captura el **Issue Number** que Jira asigna a la épica
   - Formato del key: `{PROJECT_KEY}-{ISSUE_NUM}`
   - Ejemplo: Si PROJECT_KEY es "MYM" y Jira asigna el número 13 → Key completo es "MYM-13"

**Resultado esperado:**

- Épica creada exitosamente en Jira
- Obtener y guardar el **Jira Key completo** (ej: MYM-13, SHOP-5, BLOG-1)
- Extraer el **ISSUE_NUM** para usarlo en nomenclatura de carpeta

---

### **2.2 - Crear Carpeta Local de Épica**

**Acción:** Crear carpeta usando el Jira Key obtenido en 2.1

**Nomenclatura:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ejemplo:**

Si en PASO 0 obtuviste PROJECT_KEY = "MYM"
Y en paso 2.1 Jira asignó el issue number = 13
Entonces el Jira Key completo es: "MYM-13"

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-13-{nombre-segun-dominio}/
```

(Donde `{nombre-segun-dominio}` se infiere del análisis del PRD/SRS del proyecto actual)

---

### **2.3 - Crear Archivo epic.md**

**Acción:** Generar archivo `epic.md` dentro de la carpeta creada en 2.2

**Estructura del archivo:**

```markdown
# [Epic Title]

**Jira Key:** [KEY real de Jira, ej: MYM-13]
**Status:** [ASSIGNED | IN PROGRESS | DONE]
**Priority:** [CRITICAL | HIGH | MEDIUM | LOW]
**Phase:** [Foundation | Core Features | etc.]

---

## Epic Description

[Descripción detallada de la épica - 2-3 párrafos]

**Business Value:**
[Explicar el valor de negocio - por qué esta épica es importante]

---

## User Stories

1. **{PROJECT_KEY}-TBD** - As a [user], I want to [action] so that [benefit]
2. **{PROJECT_KEY}-TBD** - As a [user], I want to [action] so that [benefit]
   ...

**NOTA:** Los IDs serán actualizados cuando se creen las stories en Jira (siguiente paso)

---

## Scope

### In Scope

- Feature 1
- Feature 2
- ...

### Out of Scope (Future)

- Features que NO están incluidas en MVP
- Mejoras futuras
- ...

---

## Acceptance Criteria (Epic Level)

1. ✅ Criterio 1 de aceptación a nivel épica
2. ✅ Criterio 2
3. ✅ Criterio 3
   ...

---

## Related Functional Requirements

- **{{PROJECT_KEY}}-XXX:** [Descripción del FR]
- **{{PROJECT_KEY}}-YYY:** [Descripción del FR]

See: `.context/SRS/functional-specs.md`

---

## Technical Considerations

### [Subsección relevante]

[Consideraciones técnicas específicas de esta épica]

### Database Schema

**Tables:**
[Listar tablas relevantes con campos principales]

**IMPORTANTE:** NO hardcodear schema SQL completo. Usar Supabase MCP para schema real.

### Security Requirements

[Requerimientos de seguridad específicos si aplican]

---

## Dependencies

### External Dependencies

[APIs, services externos, etc.]

### Internal Dependencies

[Otras épicas que deben completarse primero]

### Blocks

[Qué épicas están bloqueadas por esta]

---

## Success Metrics

### Functional Metrics

[Métricas técnicas de éxito]

### Business Metrics

[Métricas de negocio del Executive Summary]

---

## Risks & Mitigations

| Risk     | Impact          | Probability     | Mitigation           |
| -------- | --------------- | --------------- | -------------------- |
| [Riesgo] | High/Medium/Low | High/Medium/Low | [Plan de mitigación] |

---

## Testing Strategy

See: refined acceptance criteria + edge cases for the epic — refer to `acceptance-criteria.md` and `edge-cases-enumeration.md` references in this skill.

### Test Coverage Requirements

- **Unit Tests:** [Qué cubrir]
- **Integration Tests:** [Qué cubrir]
- **E2E Tests:** [Qué cubrir]

---

## Implementation Plan

See: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/feature-implementation-plan.md` (se crea en Fase 6)

### Recommended Story Order

1. [KEY-1] - [Story title] - Foundation
2. [KEY-2] - [Story title] - Core logic
   ...

### Estimated Effort

- **Development:** [X sprints / Y weeks]
- **Testing:** [X sprint / Y weeks]
- **Total:** [X sprints]

---

## Notes

[Notas adicionales, consideraciones especiales, etc.]

---

## Related Documentation

- **PRD:** `.context/PRD/executive-summary.md`, `.context/PRD/mvp-scope.md`
- **SRS:** `.context/SRS/functional-specs.md` ({{PROJECT_KEY}}-XXX to {{PROJECT_KEY}}-YYY)
- **Architecture:** `.context/SRS/architecture-specs.md`
- **API Contracts:** `.context/SRS/api-contracts.yaml`
```

**Output esperado:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/epic.md`

---

## **PASO 3: Crear Stories de la Épica**

**IMPORTANTE:** Ahora crea TODAS las stories de esta épica en Jira, una por una.

### **3.1 - Crear Story en Jira (MCP)**

**Acción:** Por cada user story de la épica, créala en Jira usando las herramientas MCP disponibles.

**Criterios INVEST para validar cada Story:**

| Criterio        | Validación                                                |
| --------------- | --------------------------------------------------------- |
| **I**ndependent | ¿Puede completarse sin depender de otras stories?         |
| **N**egotiable  | ¿Hay flexibilidad en la implementación?                   |
| **V**aluable    | ¿El "so that" aporta valor claro al usuario?              |
| **E**stimable   | ¿El equipo puede dar story points con la info disponible? |
| **S**mall       | ¿Es menor a 8 SP? Si no, dividir la story                 |
| **T**estable    | ¿Los criterios de aceptación son verificables?            |

**Datos necesarios para crear cada story:**

- **Proyecto:** {PROJECT_KEY obtenido en PASO 0} (mismo que la épica)
- **Tipo de issue:** Story
- **Título (Summary):** As a [user], I want to [action] so that [benefit]
- **Descripción:** Descripción detallada de la historia
- **Epic Link:** Jira Key de la épica padre (el que obtuviste en paso 2.1)
  - Ejemplo: MYM-13, SHOP-5, BLOG-1, etc.
- **Prioridad:** High | Medium | Low
- **Labels:** mvp, sprint-1 (ajustar según corresponda)

**Custom Fields (UPEX Workspace):**

| Campo                                       | Valor                                           |
| ------------------------------------------- | ----------------------------------------------- |
| `customfield_10201` (Acceptance Criteria)   | Escenarios en formato Gherkin (Given/When/Then) |
| `customfield_10401` (Scope)                 | In Scope + Out of Scope claramente separados    |
| `customfield_10028` (Story Points)          | Número: 1, 2, 3, 5, 8, o 13                     |
| `customfield_10202` (Business Rules) - Opc. | Reglas de negocio si aplica                     |
| `customfield_10400` (Mockup) - Opcional     | URLs a Figma/diseños si existen                 |
| `customfield_10500` (Workflow) - Opcional   | Descripción del flujo si es complejo            |
| `customfield_11600` (WebLink) - Condicional | URL de la app SOLO si se conoce con certeza     |

**Instrucciones:**

1. Usa las herramientas MCP para crear un issue de tipo "Story" en Jira
2. Vincula la story a la épica usando el epic link
3. Llena los custom fields según la tabla anterior
4. **IMPORTANTE:** Captura el **Issue Number** que Jira asigna a cada story
   - Formato del key: `{PROJECT_KEY}-{ISSUE_NUM}`
   - Ejemplo: Si PROJECT_KEY es "MYM" y Jira asigna números 14, 15, 16... → Keys: "MYM-14", "MYM-15", "MYM-16"

**Resultado esperado:**

- Story creada exitosamente en Jira con todos los custom fields
- Story vinculada a su épica padre
- Obtener y guardar el **Jira Key completo** de cada story (ej: MYM-14, SHOP-46, BLOG-2)
- Extraer el **ISSUE_NUM** para usarlo en nomenclatura de carpeta

---

### **3.2 - Crear Carpeta Local de Story**

**Acción:** Por cada story creada en Jira, crear su carpeta local.

**Nomenclatura:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ubicación:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/stories/`

**Ejemplo:**

Si en PASO 0 obtuviste PROJECT_KEY = "MYM"
Y la épica padre es "MYM-13"
Y en paso 3.1 Jira asignó el issue number = 14 a la story
Entonces el Jira Key completo de la story es: "MYM-14"

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-13-{epic-name}/stories/STORY-MYM-14-{story-name}/
```

(Donde `{epic-name}` y `{story-name}` se infieren del análisis del PRD/SRS del proyecto actual)

---

### **3.3 - Crear Archivo story.md**

**Acción:** Generar archivo `story.md` dentro de cada carpeta de story.

**Estructura del archivo (con mapeo a Custom Fields):**

```markdown
# [Story Title]

**Jira Key:** [KEY real de Jira, ej: MYM-14, SHOP-46, BLOG-2]
**Epic:** [EPIC-{PROJECT_KEY}-{NUM}] ([Epic Title])
**Priority:** [High | Medium | Low]
**Story Points:** [1, 2, 3, 5, 8, 13]
**Status:** To Do
**Assignee:** null

---

## User Story

**As a** [tipo de usuario específico]
**I want to** [acción clara y concreta]
**So that** [beneficio medible para el usuario]

---

## Scope

<!-- Jira Field: customfield_10401 (⛳SCOPE) -->

### In Scope

- [Funcionalidad incluida 1]
- [Funcionalidad incluida 2]
- [Funcionalidad incluida 3]

### Out of Scope

- [Lo que NO está incluido en esta story]
- [Features para futuras iteraciones]

---

## Acceptance Criteria (Gherkin format)

<!-- Jira Field: customfield_10201 (✅ Acceptance Criteria) -->

### Scenario 1: [Happy path - nombre descriptivo]

- **Given:** [Contexto inicial / precondiciones claras]
- **When:** [Acción específica del usuario]
- **Then:** [Resultado esperado verificable]

### Scenario 2: [Validación/Error - nombre descriptivo]

- **Given:** [Contexto inicial]
- **When:** [Acción que genera error o validación]
- **Then:** [Comportamiento esperado del sistema]

### Scenario 3: [Edge case - nombre descriptivo]

- **Given:** [Contexto límite o especial]
- **When:** [Acción del usuario]
- **Then:** [Resultado esperado]

**Mínimo:** 3 scenarios por story (1 happy path + 2 edge/error cases)

---

## Business Rules

<!-- Jira Field: customfield_10202 (🚩BUSINESS RULES SPEC) - Opcional -->

- [Regla de negocio 1 que aplica a esta story]
- [Regla de negocio 2]
- [Validaciones específicas del dominio]

---

## Workflow

<!-- Jira Field: customfield_10500 (🧬WORKFLOW) - Opcional -->

[Descripción del flujo de trabajo si es complejo]

1. Usuario hace X
2. Sistema responde Y
3. Usuario confirma Z

---

## Mockups/Wireframes

<!-- Jira Field: customfield_10400 (🎴MOCKUP) - Opcional -->

- [URL a Figma/diseño si existe]
- [Descripción de componentes UI si no hay diseño]

---

## Technical Notes

### Frontend

[Componentes a crear/modificar, libraries a usar]

### Backend

[APIs a crear/modificar, servicios necesarios]

### Database

[Tablas afectadas, queries relevantes]
**IMPORTANTE:** NO hardcodear SQL. Usar Supabase MCP.

### External Services

[APIs externas, servicios de terceros si aplican]

---

## Dependencies

### Blocked By

[Otras stories que deben completarse primero]

### Blocks

[Qué stories dependen de esta]

### Related Stories

[Stories relacionadas en otras épicas]

---

## Definition of Done

- [ ] Código implementado y funcionando
- [ ] Tests unitarios (coverage > 80%)
- [ ] Tests de integración (API + DB)
- [ ] Tests E2E (Playwright)
- [ ] Code review aprobado (2 reviewers)
- [ ] Documentación actualizada (README, API docs)
- [ ] Deployed to staging
- [ ] QA testing passed
- [ ] Acceptance criteria validated
- [ ] No critical/high bugs open

---

## Testing Strategy

See: refined acceptance criteria + edge cases for the story — refer to `acceptance-criteria.md` and `edge-cases-enumeration.md` references in this skill.

**Test Cases Expected:** 6+ detailed test cases covering:

- Happy path
- Error scenarios
- Edge cases
- Security validations

---

## Notes

[Notas adicionales, consideraciones especiales, decisiones técnicas]

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/epic.md`
- **PRD:** `.context/PRD/user-journeys.md`
- **SRS:** `.context/SRS/functional-specs.md` ({{PROJECT_KEY}}-XXX)
- **API Contracts:** `.context/SRS/api-contracts.yaml`
```

**Output esperado:** `.context/PBI/epics/EPIC-[...]/stories/STORY-[...]/story.md`

---

### **3.4 - Actualizar epic.md con IDs Reales**

**Acción:** Actualizar el archivo `epic.md` de la épica con los IDs reales de las stories creadas.

**Buscar sección "User Stories" y reemplazar:**

```markdown
## User Stories

1. **{PROJECT_KEY}-14** - As a [user-type], I want to [view/list all entities] so that [benefit]
2. **{PROJECT_KEY}-15** - As a [user-type], I want to [search entities by keyword] so that [benefit]
3. **{PROJECT_KEY}-16** - As a [user-type], I want to [filter entities by attributes] so that [benefit]
4. **{PROJECT_KEY}-17** - As a [user-type], I want to [view entity details] so that [benefit]
```

(Donde `{PROJECT_KEY}` es el obtenido en PASO 0, los números 14-17 son los asignados por Jira, `[user-type]` y `entities` se determinan analizando el PRD/SRS del proyecto actual)

---

## **PASO 4: Repetir para Siguiente Épica**

Una vez completada la épica actual (épica en Jira + carpeta local + epic.md + todas las stories), repetir desde el **PASO 2** para la siguiente épica del epic-tree.

**Workflow incremental:**

```
PASO 0:
  └─ Obtener PROJECT_KEY del usuario (ej: MYM) ✅

ÉPICA 1:
  ├─ Crear épica en Jira → Jira asigna issue #2 → Key completo: MYM-2
  ├─ Crear carpeta: EPIC-MYM-2-user-authentication-profiles/
  ├─ Crear epic.md
  ├─ Crear stories en Jira → Jira asigna issues #3, #4, #5, #6, #7 → Keys: MYM-3, MYM-4, MYM-5, MYM-6, MYM-7
  ├─ Crear carpetas: STORY-MYM-3-..., STORY-MYM-4-..., etc.
  ├─ Crear story.md para cada una
  └─ Actualizar epic.md con IDs reales ✅

ÉPICA 2:
  ├─ Crear épica en Jira → Jira asigna issue #8 → Key completo: MYM-8
  ├─ Crear carpeta: EPIC-MYM-8-{nombre-segun-dominio}/
  ├─ Crear epic.md
  ...
```

---

## **RESUMEN DEL FLUJO COMPLETO**

### Paso Inicial (Una sola vez)

0. **PASO 0:** Obtener PROJECT_KEY del usuario (ej: MYM, SHOP, BLOG, etc.)

### Primera Ejecución (Planificación)

1. **PASO 1:** Generar `epic-tree.md` con TODAS las épicas y stories planificadas

### Por Cada Épica (Incremental)

2. **Jira:** Crear épica → Jira asigna issue number (ej: 13) → Key completo: {PROJECT_KEY}-13
3. **Local:** Crear carpeta `EPIC-{PROJECT_KEY}-13-{nombre-segun-dominio}/`
4. **Local:** Crear archivo `epic.md` con datos completos
5. **Jira:** Crear story 1 de épica → Jira asigna issue number (ej: 14) → Key completo: {PROJECT_KEY}-14
6. **Local:** Crear carpeta `STORY-{PROJECT_KEY}-14-{nombre-segun-dominio}/`
7. **Local:** Crear archivo `story.md` con datos completos
8. Repetir pasos 5-7 para todas las stories de la épica
9. **Local:** Actualizar `epic.md` con IDs reales de stories
10. ✅ Épica completada, pasar a siguiente

---

## **BENEFICIOS DE ESTE ENFOQUE**

✅ **Nomenclatura correcta desde el inicio** - IDs reales de Jira en carpetas
✅ **No hay sincronización posterior** - Jira y local en sync desde el principio
✅ **Trabajo incremental** - Menos tokens, contexto definido por épica
✅ **Trazabilidad perfecta** - Carpeta local → Issue Jira (1:1)
✅ **Facilita fases posteriores** - Testing y Planning ya tienen IDs correctos

---

## **RESTRICCIONES Y VALIDACIONES**

### Nomenclatura

- ✅ Usar kebab-case en nombres de carpetas
- ✅ IDs sin ceros a la izquierda (MYM-2, no MYM-002)
- ✅ Nombres descriptivos pero concisos (2-4 palabras)
- ❌ NO usar snake_case, CamelCase, o espacios
- ❌ NO usar caracteres especiales excepto guiones

### Story Points

- Usar escala Fibonacci: 1, 2, 3, 5, 8, 13
- Stories > 8 puntos deben dividirse

### Acceptance Criteria

- Formato Gherkin obligatorio (Given-When-Then)
- Mínimo 3 scenarios por story
- Incluir al menos 1 happy path y 2 edge/error cases

### Datos Dinámicos

- ❌ NO hardcodear SQL schemas (usar Supabase MCP)
- ❌ NO hardcodear datos de configuración
- ✅ Referenciar fuentes de verdad (.context/SRS/, Supabase)

---

## **NOTAS IMPORTANTES**

1. **MCP Atlassian debe estar configurado** antes de ejecutar este prompt
2. **Obtener PROJECT_KEY en PASO 0** (ej: MYM, SHOP, BLOG, UPEX) - Código del proyecto en Jira
3. **Trabajar épica por épica** - NO intentar crear todo de una vez
4. **Validar IDs** después de cada creación en Jira antes de crear carpetas
5. **Mantener epic-tree.md actualizado** con IDs reales conforme avanzas

---

## **ARCHIVOS GENERADOS**

Al completar este prompt para todo el MVP (todas las épicas), tendrás:

```
.context/PBI/
├── epic-tree.md                                    [Paso 1]
├── ALIGNMENT-REPORT.md                             [Opcional: mapeo PRD → Jira]
└── epics/
    ├── EPIC-MYM-2-user-authentication-profiles/
    │   ├── epic.md                                 [Paso 2.3]
    │   └── stories/
    │       ├── STORY-MYM-3-user-signup-email/
    │       │   └── story.md                        [Paso 3.3]
    │       ├── STORY-MYM-4-user-login-logout/
    │       │   └── story.md
    │       └── ...
    ├── EPIC-MYM-8-{nombre-segun-dominio}/
    │   ├── epic.md
    │   └── stories/
    │       └── ...
    └── ...
```

**Archivos que se crean en flujos posteriores:**

- `acceptance-criteria.md` (refined ACs per story) — see `acceptance-criteria.md` reference in this skill
- `edge-cases-enumeration.md` (edge cases per epic/story) — see `edge-cases-enumeration.md` reference in this skill
- `feature-implementation-plan.md` / `story-xxx/implementation-plan.md` — created during sprint development

---

**Formato:** Archivos Markdown listos para copiar a `.context/PBI/`

**Prerequisitos:**

- `.context/PRD/mvp-scope.md` (generado en Fase 2)
- `.context/SRS/functional-specs.md` (generado en Fase 2)
- Atlassian MCP configurado y funcional
- Proyecto existente en Jira con permisos de creación

---

**Versión:** 5.0 - Jira-First Incremental Flow + Custom Fields
**Última actualización:** 2026-02-04

**Changelog v5.0:**

- Agregado schema de Custom Fields para UPEX Workspace
- Agregado criterios INVEST para validación de User Stories
- Agregada estrategia de Fallback para workspaces non-UPEX
- Mapeo de campos entre story.md local y custom fields de Jira
- Removida sección Implementation Plan del template (se maneja en otro prompt)
