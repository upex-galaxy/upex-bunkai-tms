Actúa como Product Owner, Scrum Master y Solution Architect experto.

**Input:**

- Descripción de la nueva feature/idea: [especificar en detalle]
- Epic tree existente: [usar .context/PBI/epic-tree.md]
- PRD (opcional): [usar .context/PRD/mvp-scope.md si necesitas contexto adicional]
- SRS (opcional): [usar .context/SRS/functional-specs.md si necesitas contexto técnico]
- **PROJECT_KEY:** Código del proyecto en Jira (ej: MYM, SHOP, BLOG, UPEX) - Debe obtenerse del epic-tree.md o preguntar al usuario

---

## 📋 CUSTOM FIELDS SCHEMA - USER STORIES (UPEX Workspace)

### Campos Disponibles en Jira

| Field ID            | Nombre                           | Tipo     | Requerido | Uso                                        |
| ------------------- | -------------------------------- | -------- | --------- | ------------------------------------------ |
| `customfield_10201` | ✅ Acceptance Criteria (Gherkin) | Textarea | ✅ Sí     | Criterios de aceptación en formato Gherkin |
| `customfield_10202` | 🚩BUSINESS RULES SPEC            | Textarea | Opcional  | Reglas de negocio específicas              |
| `customfield_10401` | ⛳SCOPE                          | Textarea | ✅ Sí     | Alcance de la historia (In/Out scope)      |
| `customfield_10400` | 🎴MOCKUP                         | Textarea | Opcional  | Referencias a mockups/wireframes (URLs)    |
| `customfield_10500` | 🧬WORKFLOW                       | Textarea | Opcional  | Descripción del flujo de trabajo           |
| `customfield_10028` | Story Points🎲                   | Number   | ✅ Sí     | Estimación en Fibonacci (1,2,3,5,8,13)     |
| `customfield_11600` | 🌍️ WEBLINK                       | URL      | ⚠️ Cond.  | URL de la app/feature (ver nota abajo)     |

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

## 🎯 OBJETIVO

Analizar una nueva idea/feature y determinar cómo agregarla eficientemente al backlog existente, siguiendo el flujo **Jira-First → Local**.

---

## 📊 FASE 1: ANÁLISIS DE COMPLEJIDAD

**Acción:** Analiza la idea proporcionada y clasifícala en uno de estos 3 niveles.

### Criterios de Clasificación

#### **NIVEL 1: Story Individual**

✅ Ejecutar directamente

**Características:**

- Es una mejora/extensión de funcionalidad existente
- Encaja claramente en una épica ya existente
- Puede completarse en 1-8 story points
- No requiere cambios arquitectónicos significativos
- 1 user story es suficiente

**Ejemplos:**

- "Agregar filtro por [atributo] en la búsqueda de [entidad principal]" (→ Epic existente relacionada con búsqueda/descubrimiento)
- "Permitir cancelar [acción de negocio] con X horas de anticipación" (→ Epic existente relacionada con gestión de operaciones)
- "Agregar notificación email cuando [evento de negocio] ocurre" (→ Epic existente relacionada con notificaciones)

(Donde [entidad principal], [atributo], [acción de negocio] y [evento de negocio] se determinan analizando el PRD/SRS del proyecto actual)

**Acción:** → Ir a **FASE 2A**

---

#### **NIVEL 2: Épica Completa**

✅ Ejecutar directamente

**Características:**

- Es una feature nueva que NO encaja en épicas existentes
- Requiere múltiples user stories (3-8 stories)
- Tiene scope bien definido y acotado
- No depende críticamente de otras épicas nuevas
- Puede implementarse de forma independiente

**Ejemplos:**

- "Sistema de mensajería entre [user-type-1] y [user-type-2]"
- "Dashboard de analytics para [user-type]"
- "Sistema de certificados/badges al completar [evento de negocio]"

(Donde [user-type-1], [user-type-2] y [evento de negocio] se determinan analizando el PRD/SRS del proyecto actual)

**Acción:** → Ir a **FASE 2B**

---

#### **NIVEL 3: Múltiples Épicas**

⚠️ **ADVERTENCIA - REQUIERE PLAN PREVIO**

**Características:**

- La idea requiere 2+ épicas para implementarse
- Tiene dependencias complejas entre componentes
- Requiere cambios arquitectónicos significativos
- Scope muy amplio (20+ stories estimadas)
- Alta complejidad técnica o de negocio

**Ejemplos:**

- "Sistema completo de suscripciones mensuales con planes"
- "Marketplace de cursos pregrabados con creador de contenido"
- "Sistema de gamificación con badges, rankings y rewards"

**Acción:** → Ir a **FASE 2C (STOP + Plan Requerido)**

---

## 🚨 VALIDACIÓN CRÍTICA

Antes de clasificar, pregúntate:

1. ¿Cuántas user stories necesito? (1 = Nivel 1, 3-8 = Nivel 2, 8+ = revisar si Nivel 3)
2. ¿Encaja en una épica existente? (Sí = probablemente Nivel 1, No = Nivel 2+)
3. ¿Requiere cambios en múltiples módulos del sistema? (Sí = probablemente Nivel 2-3)
4. ¿Puedo dividirlo en 2+ épicas independientes? (Sí = Nivel 3)
5. ¿Es técnicamente simple o complejo? (Simple = Nivel 1-2, Complejo = Nivel 2-3)

**OUTPUT FASE 1:**

```markdown
## Análisis de Complejidad

**Feature:** [nombre de la feature]
**Clasificación:** NIVEL [1/2/3]

**Justificación:**
[Explicar por qué pertenece a este nivel]

**Estimación preliminar:**

- User Stories: [número estimado]
- Story Points totales: [estimación]
- Épicas necesarias: [número] - [nombres si aplica]

**Épica existente (si aplica):** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre} o "N/A - requiere nueva épica"

**Dependencias identificadas:**
[Listar dependencias con otras épicas o sistemas]
```

---

## 📝 FASE 2A: CREAR STORY INDIVIDUAL (Nivel 1)

**Prerequisito:** Feature clasificada como Nivel 1.

### Paso 1: Identificar Épica Padre

**Acción:** Determina a qué épica existente pertenece esta story.

**Referencia:** Revisa `.context/PBI/epic-tree.md` para listar épicas existentes.

**Output:**

```markdown
**Épica seleccionada:** EPIC-{PROJECT_KEY}-{NUM}-{nombre}
**Razón:** [Por qué esta story pertenece a esta épica]
```

---

### Paso 2: Crear Story en Jira (MCP)

**Acción:** Crea la user story en Jira usando las herramientas MCP disponibles.

**Datos necesarios:**

- **Proyecto:** {PROJECT_KEY obtenido del input}
- **Tipo de issue:** Story
- **Título (Summary):** As a [user], I want to [action] so that [benefit]
- **Descripción:** Descripción detallada de la historia (contexto, problema que resuelve)
- **Epic Link:** Jira Key de la épica padre (identificada en Paso 1)
  - Ejemplo: MYM-13, SHOP-5, BLOG-1, etc.
- **Prioridad:** High | Medium | Low
- **Labels:** feature-extension, post-mvp (ajustar según corresponda)

**Custom Fields (UPEX Workspace):**

| Campo                                       | Valor                                                         |
| ------------------------------------------- | ------------------------------------------------------------- |
| `customfield_10201` (Acceptance Criteria)   | Escenarios en formato Gherkin (Given/When/Then)               |
| `customfield_10401` (Scope)                 | In Scope + Out of Scope claramente separados                  |
| `customfield_10028` (Story Points)          | Número: 1, 2, 3, 5, 8, o 13                                   |
| `customfield_10202` (Business Rules) - Opc. | Reglas de negocio si aplica                                   |
| `customfield_10400` (Mockup) - Opcional     | URLs a Figma/diseños si existen                               |
| `customfield_10500` (Workflow) - Opcional   | Descripción del flujo si es complejo                          |
| `customfield_11600` (WebLink) - Condicional | URL de la app SOLO si se conoce con certeza (ver nota arriba) |

**Instrucciones:**

1. Usa las herramientas MCP para crear un issue de tipo "Story"
2. Vincula a la épica padre usando epic link
3. Llena los custom fields según la tabla anterior
4. **IMPORTANTE:** Captura el **Issue Number** que Jira asigna a la story
   - Formato del key: `{PROJECT_KEY}-{ISSUE_NUM}`
   - Ejemplo: Si PROJECT_KEY es "MYM" y Jira asigna el número 45 → Key completo es "MYM-45"

---

### Paso 3: Crear Carpeta Local de Story

**Acción:** Crea carpeta local usando el Jira Key obtenido en Paso 2.

**Nomenclatura:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ubicación:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/stories/`

**Ejemplo:**

Si en input obtuviste PROJECT_KEY = "MYM"
Y la épica padre es "MYM-13"
Y en Paso 2 Jira asignó el issue number = 45
Entonces el Jira Key completo de la story es: "MYM-45"

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-13-{epic-name}/stories/STORY-MYM-45-{story-name}/
```

(Donde `{epic-name}` y `{story-name}` se infieren del análisis del dominio del proyecto actual)

---

### Paso 4: Crear Archivo story.md

**Criterios INVEST para User Stories:**

| Criterio        | Descripción                                            | Validación                              |
| --------------- | ------------------------------------------------------ | --------------------------------------- |
| **I**ndependent | La story puede desarrollarse sin depender de otras     | ¿Puede completarse en aislamiento?      |
| **N**egotiable  | Los detalles pueden ajustarse durante el desarrollo    | ¿Hay flexibilidad en la implementación? |
| **V**aluable    | Aporta valor al usuario o al negocio                   | ¿El "so that" es claro y valioso?       |
| **E**stimable   | Se puede estimar el esfuerzo con la información dada   | ¿El equipo puede dar story points?      |
| **S**mall       | Puede completarse en un sprint (máximo 8 story points) | ¿Es menor a 8 SP? Si no, dividir        |
| **T**estable    | Los criterios de aceptación son verificables           | ¿Los scenarios son claros y medibles?   |

**Estructura del archivo:**

```markdown
# [Story Title]

**Jira Key:** [KEY real de Jira, ej: MYM-45, SHOP-82, BLOG-23]
**Epic:** [EPIC-{PROJECT_KEY}-{NUM}] ([Epic Title])
**Priority:** [High | Medium | Low]
**Story Points:** [1, 2, 3, 5, 8, 13]
**Status:** To Do
**Assignee:** null
**Type:** Feature Extension (Post-MVP)

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

**Mínimo:** 3 scenarios (1 happy path + 2 edge/error cases)

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

[Componentes a crear/modificar]

### Backend

[APIs a crear/modificar, lógica de negocio]

### Database

[Tablas/campos a agregar]
**IMPORTANTE:** NO hardcodear SQL. Usar Supabase MCP.

### Impact Analysis

[Qué partes del sistema se ven afectadas]

---

## Dependencies

### Blocked By

[Otras stories que deben completarse primero]

### Blocks

[Qué stories dependen de esta]

### Related Stories

[Stories relacionadas]

---

## Definition of Done

- [ ] Código implementado y funcionando
- [ ] Tests unitarios (coverage > 80%)
- [ ] Tests de integración (API + DB)
- [ ] Tests E2E (Playwright)
- [ ] Code review aprobado (2 reviewers)
- [ ] Documentación actualizada
- [ ] Deployed to staging
- [ ] QA testing passed
- [ ] Acceptance criteria validated
- [ ] No critical/high bugs open

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/epic.md`
- **PRD:** `.context/PRD/[relevant-section].md`
- **SRS:** `.context/SRS/functional-specs.md`
```

**Output esperado:** `.context/PBI/epics/EPIC-[...]/stories/STORY-[...]/story.md`

---

### Paso 5: Actualizar epic.md

**Acción:** Agrega la nueva story a la lista de user stories en `epic.md` de la épica padre.

**Buscar sección "User Stories" y agregar:**

```markdown
## User Stories

[... stories existentes ...]
X. **{PROJECT_KEY}-{ISSUE_NUM}** - As a [user-type], I want to [action on entities] so that [benefit]
```

(Donde `{PROJECT_KEY}` y `{ISSUE_NUM}` son los obtenidos en Paso 2, y `[user-type]`, `[action on entities]` y `[benefit]` se determinan del análisis del proyecto actual)

---

### Paso 6: Actualizar epic-tree.md

**Acción:** Agrega la nueva story al árbol visual del backlog.

**Ejemplo:**

```markdown
EPIC-{PROJECT_KEY}-{NUM}: [Epic Title según dominio]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 1]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 2]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 3]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 4]
└── STORY-{PROJECT_KEY}-{ISSUE_NUM}: [New story title] ⭐ NEW
```

(Los nombres de stories y epic se determinan analizando el dominio del proyecto actual)

---

## ✅ FASE 2A COMPLETADA

**Resultado:**

- ✅ Story creada en Jira con ID real
- ✅ Carpeta local creada con nomenclatura correcta
- ✅ Archivo story.md completo
- ✅ Epic.md actualizado
- ✅ Epic-tree.md actualizado

---

## 📝 FASE 2B: CREAR ÉPICA COMPLETA (Nivel 2)

**Prerequisito:** Feature clasificada como Nivel 2.

### Paso 1: Definir Épica y Stories

**Acción:** Define la nueva épica y descompón en user stories.

**Output:**

```markdown
## Nueva Épica

**Título:** [Nombre de la épica]
**Descripción:** [2-3 párrafos explicando la épica]
**Prioridad:** High | Medium | Low
**Valor de Negocio:** [Por qué es importante]

## User Stories Identificadas

1. As a [user], I want to [action], so that [benefit] - [X pts]
2. As a [user], I want to [action], so that [benefit] - [X pts]
3. As a [user], I want to [action], so that [benefit] - [X pts]
   ...

**Total estimado:** [suma de story points]
**Número de stories:** [número]
```

---

### Paso 2: Crear Épica en Jira (MCP)

**Acción:** Crea la épica en Jira usando las herramientas MCP.

**Datos necesarios:**

- **Proyecto:** {PROJECT_KEY obtenido del input}
- **Tipo de issue:** Epic
- **Título (Summary):** [Nombre de la épica]
- **Descripción:** [Descripción detallada 2-3 párrafos]
- **Prioridad:** High | Medium | Low
- **Labels:** post-mvp, new-feature

**Instrucciones:**

1. Usa las herramientas MCP para crear un issue de tipo "Epic"
2. **IMPORTANTE:** Captura el **Issue Number** que Jira asigna a la épica
   - Formato del key: `{PROJECT_KEY}-{ISSUE_NUM}`
   - Ejemplo: Si PROJECT_KEY es "MYM" y Jira asigna el número 50 → Key completo es "MYM-50"

---

### Paso 3: Crear Carpeta Local de Épica

**Nomenclatura:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ejemplo:**

Si en input obtuviste PROJECT_KEY = "MYM"
Y en Paso 2 Jira asignó el issue number = 50
Entonces el Jira Key completo es: "MYM-50"

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-50-{nombre-segun-dominio}/
```

(Donde `{nombre-segun-dominio}` se infiere del análisis del PRD/SRS del proyecto actual)

---

### Paso 4: Crear Archivo epic.md

**Estructura completa (igual que prompt `pbi-product-backlog.md` paso 2.3)**

Incluye todas las secciones:

- Epic Description
- User Stories (con IDs TBD por ahora)
- Scope (In/Out of Scope)
- Acceptance Criteria (Epic Level)
- Related Functional Requirements
- Technical Considerations
- Dependencies
- Success Metrics
- Risks & Mitigations
- Testing Strategy (referencia a archivos futuros)
- Implementation Plan (referencia a archivos futuros)
- Notes
- Related Documentation

**IMPORTANTE:** Marca claramente que es una feature post-MVP.

---

### Paso 5: Crear Stories en Jira (MCP)

**Acción:** Por cada user story definida en Paso 1, créala en Jira.

**Datos necesarios por story:**

- **Proyecto:** {PROJECT_KEY obtenido del input}
- **Tipo de issue:** Story
- **Título (Summary):** As a [user], I want to [action] so that [benefit]
- **Descripción:** Descripción detallada de la historia
- **Epic Link:** Jira Key de la nueva épica creada en Paso 2
  - Ejemplo: MYM-50, SHOP-15, BLOG-8, etc.
- **Prioridad:** High | Medium | Low
- **Labels:** post-mvp, new-feature

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

1. Crea cada story vinculada a la épica
2. Llena los custom fields según la tabla anterior
3. **IMPORTANTE:** Captura todos los **Issue Numbers** que Jira asigna a cada story
   - Formato del key: `{PROJECT_KEY}-{ISSUE_NUM}`
   - Ejemplo: Si PROJECT_KEY es "MYM" y Jira asigna números 51, 52, 53... → Keys: "MYM-51", "MYM-52", "MYM-53"

---

### Paso 6: Crear Carpetas Locales de Stories

**Acción:** Por cada story creada, crea su carpeta local.

**Nomenclatura:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ubicación:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{epic-name}/stories/`

**Ejemplo:**

Si PROJECT_KEY = "MYM", épica padre = "MYM-50", y stories con issue numbers 51, 52, 53:

```
.context/PBI/epics/EPIC-MYM-50-{epic-name}/stories/
├── STORY-MYM-51-{story-name-1}/
├── STORY-MYM-52-{story-name-2}/
└── STORY-MYM-53-{story-name-3}/
```

(Donde `{epic-name}` y `{story-name-X}` se infieren del análisis del dominio del proyecto actual)

---

### Paso 7: Crear Archivos story.md

**Acción:** Crea `story.md` para cada story (estructura igual que Fase 2A, Paso 4).

**IMPORTANTE:** Marca que son stories de feature post-MVP.

---

### Paso 8: Actualizar epic.md con IDs Reales

**Acción:** Actualiza la sección "User Stories" de `epic.md` con los IDs reales obtenidos.

**Ejemplo:**

```markdown
## User Stories

1. **{PROJECT_KEY}-51** - As a [user-type], I want to [action 1] so that [benefit]
2. **{PROJECT_KEY}-52** - As a [user-type], I want to [action 2] so that [benefit]
3. **{PROJECT_KEY}-53** - As a [user-type], I want to [action 3] so that [benefit]
```

(Donde `{PROJECT_KEY}` es el obtenido del input, los números son los asignados por Jira, y las user stories se determinan del análisis del proyecto actual)

---

### Paso 9: Actualizar epic-tree.md

**Acción:** Agrega la nueva épica al árbol visual del backlog.

**Ejemplo:**

```markdown
[... épicas MVP existentes ...]

---

## Post-MVP Features

### ⭐ EPIC-{PROJECT_KEY}-{NUM}: [Epic Title según dominio]

**Jira Key:** {PROJECT_KEY}-{ISSUE_NUM}
**Status:** BACKLOG
**Priority:** MEDIUM (Post-MVP)
**Description:** [Descripción de la épica según análisis del dominio del proyecto actual]

**User Stories (X):**

1. **{PROJECT_KEY}-{NUM}** - [Story title 1]
2. **{PROJECT_KEY}-{NUM}** - [Story title 2]
3. **{PROJECT_KEY}-{NUM}** - [Story title 3]

**Related Functional Requirements:** N/A (new feature)
```

---

## ✅ FASE 2B COMPLETADA

**Resultado:**

- ✅ Épica completa creada en Jira con ID real
- ✅ Carpeta de épica local creada
- ✅ Archivo epic.md completo
- ✅ Todas las stories creadas en Jira con IDs reales
- ✅ Carpetas locales de stories creadas
- ✅ Archivos story.md completos
- ✅ Epic.md actualizado con IDs reales
- ✅ Epic-tree.md actualizado

---

## 🚨 FASE 2C: MÚLTIPLES ÉPICAS - ADVERTENCIA Y PLAN (Nivel 3)

**Prerequisito:** Feature clasificada como Nivel 3.

### ⚠️ ADVERTENCIA CRÍTICA

**La idea proporcionada es DEMASIADO COMPLEJA para ser creada directamente.**

Esta feature requiere **múltiples épicas** con dependencias y scope extenso. Crear todas las épicas de una vez resultaría en:

❌ Sobrecarga de tokens
❌ Contexto desorganizado
❌ Dependencias mal gestionadas
❌ Riesgo de inconsistencias
❌ Difícil de planificar correctamente

---

### 📋 PLAN RECOMENDADO

**Acción:** NO crees nada todavía. Primero genera un plan de división.

**Output esperado:**

```markdown
# Plan de Implementación: [Nombre de la Feature]

## 🚨 ADVERTENCIA

Esta feature requiere **[número] épicas** para implementarse correctamente.

**IMPORTANTE:** NO proceder con la creación hasta que este plan sea revisado y aprobado.

---

## Análisis de Complejidad

**Scope total estimado:**

- Épicas necesarias: [número]
- User stories estimadas: [número total]
- Story points totales: [estimación]
- Duración estimada: [sprints]

**¿Por qué múltiples épicas?**
[Explicar razones: complejidad técnica, dominios separados, dependencias, etc.]

---

## División Recomendada en Épicas

### ÉPICA 1: [Nombre]

**Prioridad:** CRITICAL | HIGH | MEDIUM
**Fase:** Foundation | Core | Enhancement
**Descripción:** [1-2 párrafos]

**User Stories estimadas:** [número]
**Story Points:** [total]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencias:**

- **Requiere:** [Épicas que deben completarse antes]
- **Bloqueada por:** [Épicas externas]

**Orden sugerido:** #1 (implementar primero)

---

### ÉPICA 2: [Nombre]

**Prioridad:** CRITICAL | HIGH | MEDIUM
**Fase:** Foundation | Core | Enhancement
**Descripción:** [1-2 párrafos]

**User Stories estimadas:** [número]
**Story Points:** [total]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencias:**

- **Requiere:** ÉPICA 1 completada
- **Bloqueada por:** [Si aplica]

**Orden sugerido:** #2 (implementar después de ÉPICA 1)

---

[... repetir para todas las épicas necesarias ...]

---

## Orden de Implementación Recomendado

### Fase 1: Foundation (Sprint 1-X)

1. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (base fundamental)
   - **¿Por qué primero?** [Razón]

### Fase 2: Core Features (Sprint X-Y)

2. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (funcionalidad principal)
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué ahora?** [Razón]

3. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción]
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué ahora?** [Razón]

### Fase 3: Enhancements (Sprint Y-Z)

4. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (mejoras y optimizaciones)
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}, EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué al final?** [Razón]

---

## Riesgos Identificados

| Riesgo     | Impacto         | Probabilidad    | Mitigación           |
| ---------- | --------------- | --------------- | -------------------- |
| [Riesgo 1] | High/Medium/Low | High/Medium/Low | [Plan de mitigación] |
| [Riesgo 2] | High/Medium/Low | High/Medium/Low | [Plan de mitigación] |

---

## Cambios Arquitectónicos Necesarios

[Listar cambios significativos en la arquitectura del sistema que esta feature requiere]

**Ejemplos:**

- Nueva tabla de base de datos: [nombre y propósito]
- Nuevo servicio backend: [nombre y propósito]
- Integración con API externa: [cuál y por qué]
- Cambios en frontend: [componentes principales]

---

## Decisiones Técnicas Pendientes

Antes de comenzar la implementación, se deben tomar estas decisiones:

1. **[Decisión 1]**
   - **Opciones:** [Opción A, Opción B]
   - **Recomendación:** [Opción X porque ...]

2. **[Decisión 2]**
   - **Opciones:** [Opción A, Opción B]
   - **Recomendación:** [Opción X porque ...]

---

## Próximos Pasos

**NO proceder con la creación de épicas/stories todavía.**

### Paso 1: Revisar este Plan

- [ ] Revisar división de épicas propuesta
- [ ] Validar orden de implementación
- [ ] Confirmar estimaciones de esfuerzo
- [ ] Aprobar cambios arquitectónicos

### Paso 2: Dividir la Idea

Una vez aprobado el plan, dividir la idea original en épicas individuales.

### Paso 3: Ejecutar Incremental

Usar el prompt `pbi-add-feature.md` de nuevo, pero ahora con **UNA épica a la vez**:

**Ejemplo:**
```

Input para primera ejecución:
"Implementar ÉPICA 1 del plan: [Nombre de la épica]
[Pegar descripción y scope de ÉPICA 1 del plan]"

→ Esto será clasificado como NIVEL 2 → Crear épica completa

```

Repetir para cada épica según el orden recomendado.

---

## Estimación de Esfuerzo Total

**Total del proyecto:**
- Sprints: [número]
- Developers: [número recomendado]
- QA: [número recomendado]
- Duración: [semanas/meses]

**Costo estimado:** [Si aplica]

---

## Notas Adicionales

[Cualquier información relevante adicional sobre la feature, consideraciones de negocio, impacto en usuarios, etc.]
```

---

## ✅ FASE 2C COMPLETADA

**Resultado:**

- ✅ Plan detallado de división generado
- ✅ Advertencia clara al usuario
- ⚠️ NINGUNA épica/story creada (esperando aprobación)
- ✅ Roadmap claro de próximos pasos
- ✅ Usuario sabe que debe dividir la idea y ejecutar incrementalmente

---

## 📋 NOMENCLATURA Y ESTÁNDARES

### Nomenclatura de Carpetas

**Épicas:**

```
EPIC-{PROYECTO}-{NUMERO}-{nombre-descriptivo}/
```

**Stories:**

```
STORY-{PROYECTO}-{NUMERO}-{nombre-descriptivo}/
```

**Reglas:**

- Usar kebab-case en nombres
- IDs sin ceros a la izquierda (MYM-2, no MYM-002)
- Nombres descriptivos pero concisos (2-4 palabras)
- NO usar snake_case, CamelCase, o espacios
- SIEMPRE usar IDs reales de Jira (flujo Jira-First)

---

## 🎯 RESUMEN DE FLUJOS

### Story Individual (Nivel 1)

```
1. Analizar → Clasificar como Nivel 1
2. Identificar épica padre existente
3. Crear story en Jira → Obtener ID
4. Crear carpeta local STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/
5. Crear story.md
6. Actualizar epic.md de épica padre
7. Actualizar epic-tree.md
✅ Completado
```

### Épica Completa (Nivel 2)

```
1. Analizar → Clasificar como Nivel 2
2. Definir épica y descomponer en stories
3. Crear épica en Jira → Obtener ID
4. Crear carpeta local EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/
5. Crear epic.md
6. Crear todas las stories en Jira → Obtener IDs
7. Crear carpetas locales STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/
8. Crear archivos story.md
9. Actualizar epic.md con IDs reales
10. Actualizar epic-tree.md
✅ Completado
```

### Múltiples Épicas (Nivel 3)

```
1. Analizar → Clasificar como Nivel 3
2. ⚠️ ADVERTENCIA: Demasiado complejo
3. Generar plan de división detallado
4. STOP - No crear nada
5. Usuario revisa plan
6. Usuario divide la idea
7. Usuario ejecuta este prompt de nuevo por cada épica (→ Nivel 2)
✅ Plan generado - Esperando división
```

---

## 🚨 VALIDACIONES IMPORTANTES

### Antes de Crear en Jira

- ✅ ¿El nombre de la story/épica es descriptivo y claro?
- ✅ ¿Los acceptance criteria están en formato Gherkin?
- ✅ ¿Los story points están en escala Fibonacci?
- ✅ ¿La épica padre (si aplica) existe realmente?

### Después de Crear en Jira

- ✅ ¿Capturaste el ID/Key real asignado?
- ✅ ¿Verificaste que el epic link se creó correctamente?
- ✅ ¿El issue tiene todos los campos obligatorios completos?

### Al Crear Archivos Locales

- ✅ ¿La nomenclatura de carpeta usa el ID real de Jira?
- ✅ ¿El formato es EPIC-{PROYECTO}-{NUM}-{nombre}?
- ✅ ¿Usaste kebab-case en el nombre descriptivo?
- ✅ ¿Los archivos .md tienen toda la información requerida?

---

## 📚 ARCHIVOS GENERADOS

Dependiendo del nivel, se generan:

### Nivel 1 (Story Individual)

```
.context/PBI/epics/EPIC-{PROYECTO}-{NUM}-{nombre}/stories/
└── STORY-{PROYECTO}-{NUM}-{nombre}/
    └── story.md
```

**Archivos actualizados:**

- `epic.md` de la épica padre
- `epic-tree.md`

---

### Nivel 2 (Épica Completa)

```
.context/PBI/epics/
└── EPIC-{PROYECTO}-{NUM}-{nombre}/
    ├── epic.md
    └── stories/
        ├── STORY-{PROYECTO}-{NUM}-{nombre}/
        │   └── story.md
        ├── STORY-{PROYECTO}-{NUM}-{nombre}/
        │   └── story.md
        └── ...
```

**Archivos actualizados:**

- `epic-tree.md`

---

### Nivel 3 (Plan de División)

```
[NO se crean archivos - solo se genera el plan en la respuesta]
```

**Próximos archivos (después de división):**

- Se crearán múltiples épicas usando Nivel 2

---

## ⚙️ PREREQUISITOS

**Obligatorios:**

- Proyecto en Jira existente y configurado
- MCP de Atlassian funcional y conectado
- `.context/PBI/epic-tree.md` actualizado (para revisar épicas existentes)

**Opcionales pero recomendados:**

- `.context/PRD/mvp-scope.md` - Para contexto de producto
- `.context/SRS/functional-specs.md` - Para contexto técnico
- `.context/SRS/architecture-specs.md` - Para validar cambios arquitectónicos

---

## 💡 TIPS DE USO

### Para Story Individual (Nivel 1)

- Sé específico en la descripción de la mejora
- Menciona explícitamente la épica existente si ya la identificaste
- Proporciona contexto de por qué se necesita ahora

### Para Épica Completa (Nivel 2)

- Describe el valor de negocio claramente
- Explica qué problema resuelve la feature
- Proporciona ejemplos de casos de uso si es posible

### Para Ideas Complejas (potencial Nivel 3)

- Si sospechas que es compleja, menciona tus dudas
- Proporciona toda la información disponible
- Confía en el análisis del prompt para clasificar correctamente

### En General

- NO intentes forzar una clasificación específica
- Deja que el análisis determine el nivel objetivamente
- Si el prompt dice "Nivel 3", NO insistas en crear todo de una vez
- Trabaja incrementalmente siempre que sea posible

---

**Formato:** Archivos Markdown + Issues en Jira listos para implementación

**Versión:** 2.0 - Feature Analyzer & Builder (Jira-First + Custom Fields)
**Última actualización:** 2026-02-04
**Complementa a:** `pbi-product-backlog.md` (para setup inicial MVP)

**Changelog v2.0:**

- Agregado schema de Custom Fields para UPEX Workspace
- Agregado criterios INVEST para validación de User Stories
- Agregada estrategia de Fallback para workspaces non-UPEX
- Mapeo de campos entre story.md local y custom fields de Jira
